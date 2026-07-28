/*
 * Klippit background service worker.
 *
 * Responsibilities:
 *   - Initialize storage on install.
 *   - Open the side panel (Chrome) / sidebar (Firefox) when the toolbar icon
 *     is clicked.
 *   - Handle the "save-current-page" keyboard command directly, so a page can
 *     be captured even when the panel is closed.
 *   - Broker capture requests coming from the side panel ("grab the active
 *     tab for me").
 *
 * Cross-browser notes:
 *   - Chrome runs this as a classic MV3 service worker; we load the polyfill
 *     with importScripts so `browser.*` promises are available.
 *   - Firefox loads the polyfill + this file via manifest `background.scripts`,
 *     so importScripts is unnecessary (and undefined) there — hence the guard.
 *   - Chrome opens UI via browser.sidePanel; Firefox via browser.sidebarAction.
 *     We feature-detect rather than branch on a user-agent string.
 */

// Load the polyfill in the Chrome service-worker context only. In Firefox the
// manifest already loaded it, and importScripts isn't defined there.
if (typeof browser === 'undefined' && typeof importScripts === 'function') {
  // eslint-disable-next-line no-undef
  importScripts('/vendor/browser-polyfill.min.js', '/src/storage.js');
} else if (typeof importScripts === 'function') {
  // browser was already defined (unlikely in Chrome SW) but we still need storage.
  importScripts('/src/storage.js');
}
// In Firefox, storage.js is listed in background.scripts and is already loaded.

const storage = globalThis.klippitStorage || new globalThis.StorageManager();

// ---- toolbar click: open the panel ----------------------------------------

browser.action.onClicked.addListener(async (tab) => {
  await openPanel(tab);
});

async function openPanel(tab) {
  // Chrome: side panel.
  if (browser.sidePanel && typeof browser.sidePanel.open === 'function') {
    try {
      await browser.sidePanel.open({ windowId: tab.windowId });
      return;
    } catch (e) {
      // Fall through to other strategies if the gesture window expired.
      console.warn('sidePanel.open failed', e);
    }
  }
  // Firefox: sidebar.
  if (browser.sidebarAction && typeof browser.sidebarAction.open === 'function') {
    try {
      await browser.sidebarAction.open();
      return;
    } catch (e) {
      console.warn('sidebarAction.open failed', e);
    }
  }
}

// On Chrome, also let clicking the icon toggle the panel open behavior.
if (browser.sidePanel && browser.sidePanel.setPanelBehavior) {
  browser.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((e) => console.warn('setPanelBehavior failed', e));
}

// ---- install / startup -----------------------------------------------------

browser.runtime.onInstalled.addListener(async () => {
  await storage.init();
  setupContextMenu();
});
// Service workers can restart; ensure the menu exists on wake too.
setupContextMenu();

function setupContextMenu() {
  if (!browser.contextMenus) return;
  // removeAll first so re-running doesn't throw "duplicate id".
  browser.contextMenus.removeAll(() => {
    browser.contextMenus.create({
      id: 'klippit-save-selection',
      title: 'Save selection to Klipit',
      contexts: ['selection'],
    });
  });
}

// ---- helpers ----------------------------------------------------------------

async function getActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab || null;
}

function isCapturable(url) {
  if (!url) return false;
  // Skip internal pages we can't meaningfully bookmark.
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url);
}

async function captureActiveTab(extraNote) {
  await storage.init();
  const tab = await getActiveTab();
  if (!tab || !isCapturable(tab.url)) {
    return { ok: false, reason: 'no-capturable-tab' };
  }
  const result = await storage.saveLink({
    url: tab.url,
    title: tab.title,
    favicon: tab.favIconUrl || null,
    note: extraNote || '',
  });
  // Best-effort badge feedback.
  try {
    await flashBadge(result.created ? '+1' : '✓');
  } catch (_) {
    /* badge is cosmetic */
  }
  return { ok: true, ...result };
}

// Save a page text selection as a standalone note that remembers its source.
async function saveSelectionNote(selectionText, tab) {
  await storage.init();
  const text = (selectionText || '').trim();
  if (!text) return { ok: false, reason: 'empty-selection' };
  const result = await storage.createNote({
    note: text,
    source: tab && isCapturable(tab.url) ? { url: tab.url, title: tab.title } : null,
  });
  try {
    await flashBadge('“ ”');
  } catch (_) {
    /* cosmetic */
  }
  return { ok: true, ...result };
}

async function flashBadge(text) {
  if (!browser.action || !browser.action.setBadgeText) return;
  await browser.action.setBadgeBackgroundColor({ color: '#1f6f63' });
  await browser.action.setBadgeText({ text });
  setTimeout(() => browser.action.setBadgeText({ text: '' }), 1500);
}

// ---- context menu: save selection ------------------------------------------

if (browser.contextMenus && browser.contextMenus.onClicked) {
  browser.contextMenus.onClicked.addListener(async (info, tab) => {
    if (info.menuItemId !== 'klippit-save-selection') return;
    const res = await saveSelectionNote(info.selectionText, tab);
    browser.runtime.sendMessage({ type: 'klippit:item-saved', payload: res }).catch(() => {});
  });
}

// ---- keyboard command: save current page -----------------------------------

if (browser.commands && browser.commands.onCommand) {
  browser.commands.onCommand.addListener(async (command) => {
    if (command === 'save-current-page') {
      const res = await captureActiveTab();
      // Notify any open panel so it can refresh its list.
      browser.runtime
        .sendMessage({ type: 'klippit:item-saved', payload: res })
        .catch(() => {});
    }
  });
}

// ---- message broker for the side panel --------------------------------------

async function handleGetActiveTab() {
  const tab = await getActiveTab();
  return {
    ok: !!tab,
    tab: tab
      ? {
          url: tab.url,
          title: tab.title,
          favicon: tab.favIconUrl || null,
          capturable: isCapturable(tab.url),
        }
      : null,
  };
}

async function handleOpenUrl(url) {
  await browser.tabs.create({ url });
  return { ok: true };
}

browser.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg.type !== 'string') return;

  switch (msg.type) {
    case 'klippit:capture-active-tab':
      // Returning the promise sends the resolved value back to the caller.
      return captureActiveTab(msg.note);

    case 'klippit:get-active-tab':
      return handleGetActiveTab();

    case 'klippit:open-url':
      return handleOpenUrl(msg.url);

    default:
      return; // not ours
  }
});
