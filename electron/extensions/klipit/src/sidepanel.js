/*
 * Klippit side panel controller.
 *
 * Plain DOM, no framework. Reads/writes through the shared `klippitStorage`
 * (defined in storage.js, loaded before this file) and asks the background
 * worker to capture the active tab (the panel can't read other tabs' URLs as
 * reliably as the worker, and the worker owns badge feedback).
 */

(() => {
  const store = globalThis.klippitStorage;
  const api =
    (typeof browser !== 'undefined' && browser) ||
    (typeof chrome !== 'undefined' && chrome);

  // ---- tiny DOM helpers ----------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs = {}, children = []) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') {
        node.addEventListener(k.slice(2), v);
      } else if (v !== null && v !== undefined && v !== false) {
        node.setAttribute(k, v);
      }
    }
    for (const c of [].concat(children)) {
      if (c == null) continue;
      node.append(c.nodeType ? c : document.createTextNode(String(c)));
    }
    return node;
  };

  // ---- inline SVG icons (built via DOM, no innerHTML) -----------------------
  const SVGNS = 'http://www.w3.org/2000/svg';
  const ICON_PATHS = {
    link: ['M9.5 14.5l5-5', 'M8 11l-2 2a3.2 3.2 0 0 0 4.5 4.5l2-2', 'M16 13l2-2a3.2 3.2 0 0 0-4.5-4.5l-2 2'],
    edit: ['M4 20l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z', 'M12.5 6.5l3 3'],
    note: ['M4 20l1-4 9.5-9.5a2.1 2.1 0 0 1 3 3L8 19l-4 1Z', 'M12.5 6.5l3 3'],
    trash: ['M5 7h14', 'M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7', 'M7 7l.9 12.1A1.6 1.6 0 0 0 9.5 20.6h5a1.6 1.6 0 0 0 1.6-1.5L17 7', 'M10.5 11v5.5M13.5 11v5.5'],
    x: ['M6 6l12 12M18 6L6 18'],
    arrow: ['M5 12h13', 'M13 6l6 6-6 6'],
    graph: [
      'M7.8 11.2L15 7.2',
      'M7.8 12.8L15 16.8',
      'M6 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
      'M17 4.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
      'M17 15.5a2 2 0 1 0 0 4a2 2 0 1 0 0-4',
    ],
  };
  function icon(name, sw = 1.7) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('class', 'ic');
    svg.setAttribute('aria-hidden', 'true');
    for (const d of ICON_PATHS[name] || []) {
      const p = document.createElementNS(SVGNS, 'path');
      p.setAttribute('d', d);
      p.setAttribute('fill', 'none');
      p.setAttribute('stroke', 'currentColor');
      p.setAttribute('stroke-width', String(sw));
      p.setAttribute('stroke-linecap', 'round');
      p.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(p);
    }
    return svg;
  }

  function timeAgo(ts) {
    const s = Math.floor((Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return new Date(ts).toLocaleDateString();
  }

  function hostOf(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url || '';
    }
  }

  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 1800);
  }

  // ---- view state ----------------------------------------------------------
  const state = {
    type: '',
    tag: null,
    query: '',
    view: 'list', // 'list' | 'groups'
    // id of the item whose connections are expanded
    expanded: new Set(),
    // tag group headers that are collapsed (groups view)
    collapsedGroups: new Set(),
    // whether the tag cloud shows all tags vs. just the most-used few
    tagsExpanded: false,
    // whether the graph draws faint shared-tag links between items
    graphTagLinks: true,
  };

  // How many tags the cloud shows before collapsing the rest behind "+N more".
  const TAG_CLOUD_CAP = 8;

  // Lazily-created graph instance + an id->item index its callbacks read from
  // (kept fresh each render so opening a node always resolves the latest data).
  let graph = null;
  let graphIndex = new Map();

  // ===========================================================================
  // Rendering
  // ===========================================================================

  async function refresh() {
    await renderStats();
    await renderTagCloud();
    await renderList();
    await renderActiveTabHint();
  }

  async function renderStats() {
    const s = await store.stats();
    const n = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
    const node = $('#stats');
    node.replaceChildren(
      el('div', { text: `${n(s.links, 'link')} · ${n(s.notes, 'note')}` }),
      el('div', { text: `${n(s.connections, 'thread')} · ${n(s.tags, 'tag')}` })
    );
  }

  async function renderTagCloud() {
    const cloud = $('#tag-cloud');
    cloud.replaceChildren();
    cloud.classList.remove('expanded');

    // The cloud is a list/groups filter; it has no role in the graph view.
    if (state.view === 'graph') return;

    const tags = await store.listTags(); // sorted by frequency, then name
    if (tags.length === 0) return;

    const pill = ({ tag, count }) =>
      el(
        'button',
        {
          class: 'tag-pill' + (state.tag === tag ? ' is-active' : ''),
          type: 'button',
          onclick: () => {
            state.tag = state.tag === tag ? null : tag;
            refresh();
          },
        },
        [`#${tag}`, el('span', { class: 'count', text: String(count) })]
      );

    // Collapsed: show the most-used tags only. Always keep a selected tag
    // visible so the active filter never hides behind "+N more".
    let shown;
    if (state.tagsExpanded) {
      shown = tags;
    } else {
      shown = tags.slice(0, TAG_CLOUD_CAP);
      if (state.tag && !shown.some((t) => t.tag === state.tag)) {
        const active = tags.find((t) => t.tag === state.tag);
        if (active) shown = [active, ...shown.slice(0, TAG_CLOUD_CAP - 1)];
      }
    }

    cloud.classList.toggle('expanded', state.tagsExpanded);
    for (const t of shown) cloud.append(pill(t));

    const hidden = tags.length - shown.length;
    if (state.tagsExpanded && tags.length > TAG_CLOUD_CAP) {
      cloud.append(
        el('button', {
          class: 'tag-more',
          type: 'button',
          text: 'Show less',
          onclick: () => {
            state.tagsExpanded = false;
            renderTagCloud();
          },
        })
      );
    } else if (hidden > 0) {
      cloud.append(
        el('button', {
          class: 'tag-more',
          type: 'button',
          text: `+${hidden} more`,
          onclick: () => {
            state.tagsExpanded = true;
            renderTagCloud();
          },
        })
      );
    }
  }

  // Toggle between the scrolling list/groups container and the graph canvas.
  function showGraph(on) {
    $('#graph-view').hidden = !on;
    $('#list').hidden = on;
  }

  // Jump from a card to its node in the graph: switch view, then centre it.
  async function focusInGraph(id) {
    state.view = 'graph';
    document.querySelectorAll('.seg').forEach((s) =>
      s.classList.toggle('is-active', s.dataset.view === 'graph')
    );
    await refresh(); // builds/updates the graph and clears the tag cloud
    if (graph) graph.focus(id);
  }

  async function renderList() {
    if (state.view === 'graph') return renderGraph();
    showGraph(false);
    if (state.view === 'groups') return renderGroups();

    const list = $('#list');
    list.replaceChildren();

    const items = await store.listItems({
      type: state.type || undefined,
      tag: state.tag || undefined,
      query: state.query || undefined,
    });

    if (items.length === 0) {
      list.append(emptyState());
      return;
    }

    let i = 0;
    for (const item of items) {
      const node = await renderCard(item);
      node.style.setProperty('--i', i++);
      list.append(node);
    }
  }

  // Grouped-by-tag view. Because items can carry multiple tags, the same item
  // appears under every tag group it belongs to — clusters, not folders.
  // Items with no tags collect in a trailing "Untagged" group.
  async function renderGroups() {
    const list = $('#list');
    list.replaceChildren();

    const items = await store.listItems({
      type: state.type || undefined,
      query: state.query || undefined,
    });

    if (items.length === 0) {
      list.append(emptyState());
      return;
    }

    // Build tag -> items. listItems already sorts newest-first, so each
    // group preserves that order. Respect a selected tag filter by narrowing
    // to that single group.
    const byTag = new Map();
    const untagged = [];
    for (const item of items) {
      if (item.tags.length === 0) {
        untagged.push(item);
        continue;
      }
      for (const tag of item.tags) {
        if (state.tag && tag !== state.tag) continue;
        if (!byTag.has(tag)) byTag.set(tag, []);
        byTag.get(tag).push(item);
      }
    }

    // Order groups: most-used tag first, then alphabetical (matches the cloud).
    const orderedTags = [...byTag.keys()].sort(
      (a, b) => byTag.get(b).length - byTag.get(a).length || a.localeCompare(b)
    );

    for (const tag of orderedTags) {
      list.append(await renderGroup(tag, byTag.get(tag), false));
    }
    // Only show Untagged when not narrowed to a specific tag.
    if (!state.tag && untagged.length) {
      list.append(await renderGroup(null, untagged, true));
    }

    if (orderedTags.length === 0 && !(!state.tag && untagged.length)) {
      list.append(emptyState());
    }
  }

  async function renderGroup(tag, groupItems, isUntagged) {
    const key = isUntagged ? ' untagged' : tag;
    const collapsed = state.collapsedGroups.has(key);

    const head = el(
      'button',
      {
        class: 'group-head' + (collapsed ? ' collapsed' : '') + (isUntagged ? ' untagged' : ''),
        type: 'button',
        onclick: () => {
          if (collapsed) state.collapsedGroups.delete(key);
          else state.collapsedGroups.add(key);
          renderList();
        },
      },
      [
        el('span', { class: 'g-caret', text: '▾' }),
        el('span', { class: 'g-name', text: isUntagged ? 'Untagged' : `#${tag}` }),
        el('span', { class: 'g-count', text: String(groupItems.length) }),
      ]
    );

    const section = el('section', { class: 'group' }, [head]);
    if (!collapsed) {
      const body = el('div', { class: 'group-body' });
      let i = 0;
      for (const item of groupItems) {
        const node = await renderCard(item);
        node.style.setProperty('--i', i++);
        body.append(node);
      }
      section.append(body);
    }
    return section;
  }

  // Connections graph. Edges come in two kinds:
  //   - 'conn': explicit connections (solid teal)
  //   - 'tag':  two items share at least one tag (faint dashed), so clusters
  //             form even before anything is manually connected.
  // Nodes are any item that participates in an edge of either kind. Ignores the
  // type/tag/search filters — the graph shows the whole web.
  const TAG_FANOUT_MAX = 10; // tags on more items than this are too generic to link
  const TAG_EDGE_MAX = 400; // safety cap on drawn tag edges

  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  async function renderGraph() {
    showGraph(true);
    const [items, conns] = await Promise.all([store.listItems({}), store.allConnections()]);
    graphIndex = new Map(items.map((it) => [it.id, it]));

    const edges = [];
    const connPairs = new Set();
    for (const c of conns) {
      if (!graphIndex.has(c.a) || !graphIndex.has(c.b)) continue;
      edges.push({ a: c.a, b: c.b, kind: 'conn', label: c.label || '', weight: 1 });
      connPairs.add(pairKey(c.a, c.b));
    }

    let tagEdgeCount = 0;
    if (state.graphTagLinks) {
      // group item ids by tag, then turn each small tag-group into pairwise
      // edges weighted by how many tags a pair shares.
      const byTag = new Map();
      for (const it of items) {
        for (const t of it.tags) {
          if (!byTag.has(t)) byTag.set(t, []);
          byTag.get(t).push(it.id);
        }
      }
      const shared = new Map(); // pairKey -> { a, b, count, tags: [] }
      for (const [tag, ids] of byTag) {
        if (ids.length < 2 || ids.length > TAG_FANOUT_MAX) continue;
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            const k = pairKey(ids[i], ids[j]);
            if (connPairs.has(k)) continue; // a real connection already links these
            const cur = shared.get(k);
            if (cur) {
              cur.count++;
              cur.tags.push(tag);
            } else {
              shared.set(k, { a: ids[i], b: ids[j], count: 1, tags: [tag] });
            }
          }
        }
      }
      const tagEdges = [...shared.values()]
        .sort((x, y) => y.count - x.count)
        .slice(0, TAG_EDGE_MAX);
      for (const p of tagEdges) {
        edges.push({
          a: p.a,
          b: p.b,
          kind: 'tag',
          weight: p.count,
          label: p.tags.map((t) => `#${t}`).join(' · '),
        });
      }
      tagEdgeCount = tagEdges.length;
    }

    const degree = new Map();
    for (const e of edges) {
      degree.set(e.a, (degree.get(e.a) || 0) + 1);
      degree.set(e.b, (degree.get(e.b) || 0) + 1);
    }
    // Show every item. Connected items cluster; unlinked ones float free
    // (rendered as hollow rings so the connected web stays the focus).
    const nodes = items.map((it) => ({
      id: it.id,
      type: it.type,
      title: it.title,
      degree: degree.get(it.id) || 0,
    }));

    const connCount = edges.length - tagEdgeCount;
    const empty = $('#graph-empty');
    const hint = $('#graph-hint');
    if (nodes.length === 0) {
      empty.hidden = false;
      hint.textContent = '';
      if (graph) graph.setData({ nodes: [], edges: [] });
      return;
    }
    empty.hidden = true;
    hint.textContent =
      `${nodes.length} item${nodes.length === 1 ? '' : 's'} · ${connCount} link${connCount === 1 ? '' : 's'}` +
      (state.graphTagLinks ? ` · ${tagEdgeCount} tag link${tagEdgeCount === 1 ? '' : 's'}` : '');

    if (!graph) {
      graph = new KlippitGraph($('#graph-canvas'), {
        onOpen: (n) => {
          const it = graphIndex.get(n.id);
          if (!it) return;
          if (it.type === 'link' && it.url) openUrl(it.url);
          else openNoteModal({ mode: 'edit', item: it });
        },
      });
    }
    graph.setData({ nodes, edges });
    graph.resize(); // container just became visible — measure now
  }

  function emptyState() {
    const filtered = state.query || state.tag || state.type;
    return el('div', { class: 'empty' }, [
      el('div', { class: 'empty-mark', text: filtered ? '⁂' : '❦' }),
      el('strong', { text: filtered ? 'Nothing matches' : 'A blank page' }),
      el('span', {
        text: filtered
          ? 'Try clearing the search or filters.'
          : 'Clip the page you’re on, or write a note. Everything you keep — and why — lives here.',
      }),
    ]);
  }

  async function renderCard(item) {
    const isNote = item.type === 'note';
    const card = el('div', { class: `card type-${item.type}`, 'data-id': item.id });

    // head: lead icon + title/url + actions
    const leadIcon = isNote
      ? el('div', { class: 'card-note-badge', title: 'Note' }, [icon('note', 1.8)])
      : el('img', {
          class: 'card-favicon',
          src: item.favicon || fallbackFavicon(item.url),
          alt: '',
          onerror: (e) => (e.target.style.visibility = 'hidden'),
        });

    const titleEl = isNote
      ? el('p', { class: 'card-title', text: item.title })
      : el('p', { class: 'card-title' }, [
          el('a', {
            href: item.url,
            text: item.title,
            title: item.url,
            onclick: (e) => {
              e.preventDefault();
              openUrl(item.url);
            },
          }),
        ]);

    const titles = el('div', { class: 'card-titles' }, [
      titleEl,
      !isNote ? el('div', { class: 'card-url', text: hostOf(item.url) }) : null,
    ]);

    const actions = el('div', { class: 'card-actions' }, [
      el(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: 'Connect to another item',
          'aria-label': 'Connect',
          onclick: () => openConnectModal(item),
        },
        [icon('link')]
      ),
      el(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: 'Edit',
          'aria-label': 'Edit',
          onclick: () => editItem(item),
        },
        [icon('edit')]
      ),
      el(
        'button',
        {
          class: 'icon-btn danger',
          type: 'button',
          title: 'Delete',
          'aria-label': 'Delete',
          onclick: () => deleteItem(item),
        },
        [icon('trash')]
      ),
    ]);

    card.append(el('div', { class: 'card-head' }, [leadIcon, titles, actions]));

    // note / context body (click to edit inline)
    if (item.note) {
      card.append(
        el('p', {
          class: 'card-note editable',
          text: item.note,
          title: 'Click to edit',
          onclick: (e) => inlineEditNote(item, e.currentTarget),
        })
      );
    } else if (!isNote) {
      card.append(
        el('p', {
          class: 'card-note editable placeholder',
          text: 'Add a line of context…',
          onclick: (e) => inlineEditNote(item, e.currentTarget),
        })
      );
    }

    // source attribution for notes captured from a page selection
    if (item.source && item.source.url) {
      card.append(
        el(
          'button',
          {
            class: 'card-source',
            type: 'button',
            title: item.source.title || item.source.url,
            onclick: () => openUrl(item.source.url),
          },
          [icon('arrow'), `from ${hostOf(item.source.url)}`]
        )
      );
    }

    // tags — always present so the inline add-tag control is reachable.
    // Each pill filters on click; its × removes the tag from this item.
    const tagsWrap = el('div', { class: 'card-tags' });
    for (const t of item.tags) {
      tagsWrap.append(
        el('span', { class: 'tag-pill' + (state.tag === t ? ' is-active' : '') }, [
          el('span', {
            class: 'tag-name',
            text: `#${t}`,
            style: 'cursor:pointer',
            onclick: () => {
              state.tag = state.tag === t ? null : t;
              refresh();
            },
          }),
          el('span', {
            class: 'tag-x',
            text: '×',
            title: 'Remove tag',
            onclick: async (e) => {
              e.stopPropagation();
              await store.removeTag(item.id, t);
              await refresh();
            },
          }),
        ])
      );
    }
    tagsWrap.append(addTagControl(item));
    card.append(tagsWrap);

    // meta row: time + connection toggle
    const conns = await store.getConnections(item.id);
    const metaChildren = [el('span', { text: timeAgo(item.createdAt) })];
    if (conns.length) {
      metaChildren.push(
        el('button', {
          class: 'link-btn',
          type: 'button',
          text: `${conns.length} connection${conns.length > 1 ? 's' : ''}`,
          onclick: () => {
            if (state.expanded.has(item.id)) state.expanded.delete(item.id);
            else state.expanded.add(item.id);
            renderList();
          },
        }),
        el(
          'button',
          {
            class: 'meta-graph-btn',
            type: 'button',
            title: 'View in graph',
            'aria-label': 'View in graph',
            onclick: () => focusInGraph(item.id),
          },
          [icon('graph')]
        )
      );
    }
    card.append(el('div', { class: 'card-meta' }, metaChildren));

    // expanded connections
    if (state.expanded.has(item.id) && conns.length) {
      const box = el('div', { class: 'conns' });
      for (const { connection, other } of conns) {
        box.append(
          el('div', { class: 'conn-item' }, [
            el('span', { class: 'conn-dot' }, [icon('link', 1.8)]),
            el('span', {
              class: 'conn-link',
              text: other.title,
              title: other.url || other.note,
              onclick: () => {
                if (other.type === 'link' && other.url) openUrl(other.url);
                else scrollToCard(other.id);
              },
            }),
            connection.label ? el('span', { class: 'conn-label', text: `“${connection.label}”` }) : null,
            el(
              'button',
              {
                class: 'icon-btn danger',
                type: 'button',
                title: 'Remove connection',
                'aria-label': 'Remove connection',
                onclick: async () => {
                  await store.disconnect(connection.id);
                  toast('Connection removed');
                  refresh();
                },
              },
              [icon('x')]
            ),
          ])
        );
      }
      card.append(box);
    }

    return card;
  }

  function fallbackFavicon(url) {
    // A 1x1 transparent pixel so a broken/missing favicon doesn't show an icon.
    return (
      'data:image/svg+xml;utf8,' +
      encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18"><rect width="18" height="18" rx="4" fill="%23cdbfa6"/></svg>`
      )
    );
  }

  function scrollToCard(id) {
    const node = document.querySelector(`.card[data-id="${id}"]`);
    if (node) {
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.style.transition = 'box-shadow .3s';
      node.style.boxShadow = '0 0 0 2px var(--teal)';
      setTimeout(() => (node.style.boxShadow = ''), 900);
    }
  }

  // ===========================================================================
  // Capture flow
  // ===========================================================================

  let pendingContextItemId = null;

  async function saveCurrentPage() {
    let res = await sendToBackground({ type: 'klippit:capture-active-tab' });
    // Embedded hosts (see klippitHost below) leave the worker with no active tab
    // to find, so fall back to the page the host handed us.
    if ((!res || !res.ok) && hostTab) res = { ok: true, ...(await store.saveLink(hostTab)) };
    if (!res || !res.ok) {
      toast("Can't save this page");
      return;
    }
    await refresh();
    // Reveal the context pane targeting the just-saved item.
    pendingContextItemId = res.item.id;
    const pane = $('#context-pane');
    $('#context-target').textContent = res.created
      ? `Saved: ${res.item.title}`
      : `Already saved: ${res.item.title} — add more context?`;
    $('#context-input').value = res.item.note || '';
    $('#context-tags').value = (res.item.tags || []).join(', ');
    pane.hidden = false;
    $('#context-input').focus();
  }

  async function commitContext() {
    if (!pendingContextItemId) return;
    await store.updateItem(pendingContextItemId, {
      note: $('#context-input').value,
      tags: $('#context-tags').value,
    });
    closeContext();
    toast('Context saved');
    await refresh();
  }

  function closeContext() {
    $('#context-pane').hidden = true;
    pendingContextItemId = null;
    $('#context-input').value = '';
    $('#context-tags').value = '';
  }

  // ===========================================================================
  // Item editing / deletion
  // ===========================================================================

  // A "+ tag" pill that swaps into a tiny input. Accepts comma-separated tags,
  // commits on Enter, cancels on Esc/blur. After committing it refreshes, which
  // re-renders the card with the new pill(s).
  function addTagControl(item) {
    const btn = el('button', {
      class: 'tag-add',
      type: 'button',
      text: '+ tag',
      title: 'Add a tag',
    });
    btn.addEventListener('click', () => {
      const input = el('input', {
        class: 'tag-add-input',
        type: 'text',
        placeholder: 'tag',
        'aria-label': `Add tag to ${item.title}`,
      });
      let committed = false;
      const commit = async () => {
        if (committed) return;
        committed = true;
        const val = input.value.trim();
        if (val) {
          // store.addTag normalizes; pass the raw (comma-separated) string by
          // merging into the existing tags via updateItem for multi-tag adds.
          await store.updateItem(item.id, { tags: [...item.tags, ...val.split(',')] });
        }
        await refresh();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          commit();
        } else if (e.key === 'Escape') {
          committed = true;
          refresh();
        }
      });
      input.addEventListener('blur', commit);
      btn.replaceWith(input);
      input.focus();
    });
    return btn;
  }

  function inlineEditNote(item, node) {
    const textarea = el('textarea', {
      class: 'context-input',
      rows: Math.max(2, (item.note || '').split('\n').length),
    });
    textarea.value = item.note || '';
    node.replaceWith(textarea);
    textarea.focus();
    textarea.selectionStart = textarea.value.length;

    const commit = async () => {
      await store.updateItem(item.id, { note: textarea.value });
      await refresh();
    };
    textarea.addEventListener('blur', commit);
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        textarea.blur();
      } else if (e.key === 'Escape') {
        textarea.removeEventListener('blur', commit);
        refresh();
      }
    });
  }

  function editItem(item) {
    // Reuse the note modal for full editing of either type.
    openNoteModal({
      mode: 'edit',
      item,
    });
  }

  async function deleteItem(item) {
    const ok = confirm(`Delete “${item.title}”? This also removes its connections.`);
    if (!ok) return;
    await store.deleteItem(item.id);
    state.expanded.delete(item.id);
    toast('Deleted');
    await refresh();
  }

  // ===========================================================================
  // Note modal (new note + edit existing)
  // ===========================================================================

  let noteModalCtx = null;

  function openNoteModal({ mode, item }) {
    noteModalCtx = { mode, item: item || null };
    $('#note-title').textContent =
      mode === 'edit' ? (item.type === 'note' ? 'Edit note' : 'Edit clip') : 'New note';
    $('#note-heading').value = item ? item.title : '';
    $('#note-body').value = item ? item.note : '';
    $('#note-tags').value = item ? item.tags.join(', ') : '';
    // For links being edited, the heading is the page title; keep it editable.
    $('#note-modal').hidden = false;
    $('#note-body').focus();
  }

  function closeNoteModal() {
    $('#note-modal').hidden = true;
    noteModalCtx = null;
  }

  // ===========================================================================
  // Tag manager (rename / merge / delete across all items)
  // ===========================================================================

  function openTagManager() {
    $('#tags-modal').hidden = false;
    renderTagManager();
  }
  function closeTagManager() {
    $('#tags-modal').hidden = true;
  }

  async function renderTagManager() {
    const box = $('#tag-manager');
    box.replaceChildren();
    const tags = await store.listTags();
    if (tags.length === 0) {
      box.append(el('div', { class: 'tm-empty', text: 'No tags yet.' }));
      return;
    }

    for (const { tag, count } of tags) {
      const name = el('input', {
        class: 'tm-name',
        type: 'text',
        value: tag,
        'aria-label': `Rename tag ${tag}`,
      });
      const commitRename = async () => {
        const v = name.value.trim().toLowerCase().replace(/^#/, '');
        if (!v || v === tag) {
          name.value = tag;
          return;
        }
        const n = await store.renameTag(tag, v);
        toast(n ? `“${tag}” → “${v}” (${n})` : 'No change');
        await refresh();
        renderTagManager();
      };
      name.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          name.blur();
        } else if (e.key === 'Escape') {
          name.value = tag;
          name.blur();
        }
      });
      name.addEventListener('blur', commitRename);

      const merge = el('select', { class: 'tm-merge', 'aria-label': `Merge ${tag} into another tag` }, [
        el('option', { value: '', text: 'merge…' }),
        ...tags.filter((o) => o.tag !== tag).map((o) => el('option', { value: o.tag, text: `→ #${o.tag}` })),
      ]);
      merge.addEventListener('change', async () => {
        const target = merge.value;
        if (!target) return;
        const n = await store.mergeTags([tag], target);
        toast(`Merged “${tag}” into “${target}” (${n})`);
        await refresh();
        renderTagManager();
      });

      const del = el(
        'button',
        {
          class: 'icon-btn danger',
          type: 'button',
          title: `Remove #${tag} everywhere`,
          'aria-label': `Delete tag ${tag}`,
          onclick: async () => {
            if (!confirm(`Remove #${tag} from all ${count} item${count === 1 ? '' : 's'}? The items themselves are kept.`)) return;
            await store.deleteTag(tag);
            toast(`Removed #${tag}`);
            await refresh();
            renderTagManager();
          },
        },
        [icon('trash')]
      );

      box.append(
        el('div', { class: 'tm-row' }, [
          el('span', { class: 'tm-hash', text: '#' }),
          name,
          el('span', { class: 'tm-count', text: String(count) }),
          merge,
          del,
        ])
      );
    }
  }

  async function saveNoteModal() {
    if (!noteModalCtx) return;
    const heading = $('#note-heading').value.trim();
    const body = $('#note-body').value;
    const tags = $('#note-tags').value;

    if (noteModalCtx.mode === 'edit') {
      const patch = { note: body, tags };
      if (heading) patch.title = heading;
      await store.updateItem(noteModalCtx.item.id, patch);
      toast('Saved');
    } else {
      if (!body.trim() && !heading) {
        toast('Write something first');
        return;
      }
      await store.createNote({ title: heading, note: body, tags });
      toast('Note created');
    }
    closeNoteModal();
    await refresh();
  }

  // ===========================================================================
  // Connect picker
  // ===========================================================================

  let connectSource = null;

  async function openConnectModal(item) {
    connectSource = item;
    $('#connect-source').textContent = `Connecting: ${item.title}`;
    $('#connect-search').value = '';
    $('#connect-label').value = '';
    $('#connect-modal').hidden = false;
    await renderConnectResults('');
    $('#connect-search').focus();
  }

  function closeConnectModal() {
    $('#connect-modal').hidden = true;
    connectSource = null;
  }

  async function renderConnectResults(query) {
    const box = $('#connect-results');
    box.replaceChildren();
    const items = await store.listItems({ query: query || undefined });
    const existing = await store.getConnections(connectSource.id);
    const connectedIds = new Set(existing.map((c) => c.other.id));

    const candidates = items.filter((it) => it.id !== connectSource.id);
    if (candidates.length === 0) {
      box.append(el('div', { class: 'empty', text: 'No other items to connect to yet.' }));
      return;
    }

    for (const it of candidates) {
      const already = connectedIds.has(it.id);
      box.append(
        el(
          'div',
          {
            class: 'result-row',
            onclick: async () => {
              if (already) {
                toast('Already connected');
                return;
              }
              await store.connect(connectSource.id, it.id, $('#connect-label').value.trim());
              toast('Connected');
              state.expanded.add(connectSource.id);
              closeConnectModal();
              await refresh();
            },
          },
          [
            el('span', { class: 'r-type', text: it.type }),
            el('span', { class: 'r-title', text: it.title }),
            already ? el('span', { class: 'r-type', text: '✓ linked' }) : null,
          ]
        )
      );
    }
  }

  // ===========================================================================
  // Background messaging + tab helpers
  // ===========================================================================

  function sendToBackground(msg) {
    return api.runtime.sendMessage(msg).catch((e) => {
      console.warn('message failed', e);
      return null;
    });
  }

  function openUrl(url) {
    sendToBackground({ type: 'klippit:open-url', url });
  }

  // Hosts that embed this panel beside a page they own push the current page in
  // here. Perci runs the panel in an Electron <webview>, where chrome.tabs marks
  // nothing active and the worker's tabs.query comes back empty. Stays null in
  // Chrome and Firefox, where the worker answers for itself.
  let hostTab = null;
  globalThis.klippitHost = {
    setActiveTab(tab) {
      hostTab = tab && /^https?:\/\//i.test(tab.url || '') ? tab : null;
      renderActiveTabHint();
    },
  };

  async function renderActiveTabHint() {
    const res = await sendToBackground({ type: 'klippit:get-active-tab' });
    const tab = (res && res.ok && res.tab && res.tab.capturable && res.tab) || hostTab;
    const hint = $('#active-tab-hint');
    hint.textContent = tab ? hostOf(tab.url) : '';
    hint.title = (tab && tab.title) || '';
  }

  // ===========================================================================
  // Export / import
  // ===========================================================================

  async function exportData() {
    const data = await store.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', {
      href: url,
      download: `klipit-export-${new Date().toISOString().slice(0, 10)}.json`,
    });
    document.body.append(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast('Exported');
  }

  async function importData(file) {
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const ok = confirm('Importing will replace all current Klippit data. Continue?');
      if (!ok) return;
      await store.importAll(data);
      toast('Imported');
      await refresh();
    } catch (e) {
      console.error(e);
      toast('Import failed — invalid file');
    }
  }

  // ===========================================================================
  // Wiring
  // ===========================================================================

  function wire() {
    $('#save-page').addEventListener('click', saveCurrentPage);
    $('#new-note').addEventListener('click', () => openNoteModal({ mode: 'new' }));

    // context pane
    $('#context-save').addEventListener('click', commitContext);
    $('#context-skip').addEventListener('click', closeContext);
    $('#context-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        commitContext();
      } else if (e.key === 'Escape') {
        closeContext();
      }
    });
    $('#context-tags').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitContext();
      }
    });

    // search + filters
    let searchTimer = null;
    $('#search').addEventListener('input', (e) => {
      clearTimeout(searchTimer);
      const v = e.target.value;
      searchTimer = setTimeout(() => {
        state.query = v;
        renderList();
      }, 120);
    });
    document.querySelectorAll('.chip-type').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip-type').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        state.type = chip.dataset.type;
        renderList();
      });
    });

    // List / Groups / Graph view switch. Full refresh so the tag cloud (a
    // list/groups-only control) is shown or hidden to match the new view.
    document.querySelectorAll('.seg').forEach((seg) => {
      seg.addEventListener('click', () => {
        document.querySelectorAll('.seg').forEach((s) => s.classList.remove('is-active'));
        seg.classList.add('is-active');
        state.view = seg.dataset.view;
        refresh();
      });
    });

    // note modal
    $('#note-save').addEventListener('click', saveNoteModal);
    $('#note-cancel').addEventListener('click', closeNoteModal);
    $('#note-close').addEventListener('click', closeNoteModal);

    // connect modal
    $('#connect-close').addEventListener('click', closeConnectModal);
    let connTimer = null;
    $('#connect-search').addEventListener('input', (e) => {
      clearTimeout(connTimer);
      const v = e.target.value;
      connTimer = setTimeout(() => renderConnectResults(v), 120);
    });

    // tag manager
    $('#manage-tags').addEventListener('click', openTagManager);
    $('#tags-close').addEventListener('click', closeTagManager);

    // graph: re-center + shared-tag links toggle
    $('#graph-refit').addEventListener('click', () => graph && graph.refit());
    $('#graph-tag-links').addEventListener('change', (e) => {
      state.graphTagLinks = e.target.checked;
      renderGraph();
    });

    // dismiss modals on backdrop click
    document.querySelectorAll('.modal').forEach((m) => {
      m.addEventListener('click', (e) => {
        if (e.target === m) m.hidden = true;
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        $('#note-modal').hidden = true;
        $('#connect-modal').hidden = true;
        $('#tags-modal').hidden = true;
      }
    });

    // export / import
    $('#export').addEventListener('click', exportData);
    $('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) importData(file);
      e.target.value = '';
    });

    // theme toggle
    const THEMES = ['system', 'light', 'dark'];
    let currentTheme = localStorage.getItem('klippit-theme') || 'system';

    function applyTheme() {
      const isDark = currentTheme === 'dark' || (currentTheme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
      document.documentElement.classList.toggle('theme-dark', isDark);

      const btn = $('#theme-toggle');
      if (btn) btn.textContent = `Theme: ${currentTheme.charAt(0).toUpperCase() + currentTheme.slice(1)}`;
    }

    $('#theme-toggle').addEventListener('click', () => {
      const idx = THEMES.indexOf(currentTheme);
      currentTheme = THEMES[(idx + 1) % THEMES.length];
      localStorage.setItem('klippit-theme', currentTheme);
      applyTheme();
    });

    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
      if (currentTheme === 'system') applyTheme();
    });

    applyTheme(); // Set initial button text

    // refresh when the background saves something (e.g. keyboard shortcut)
    api.runtime.onMessage.addListener((msg) => {
      if (msg && msg.type === 'klippit:item-saved') {
        refresh();
        if (msg.payload && msg.payload.ok && msg.payload.item) {
          toast(msg.payload.item.type === 'link' ? 'Link saved' : 'Selection saved');
        }
      }
    });

    // keep the active-tab hint fresh as the user switches tabs
    if (api.tabs && api.tabs.onActivated) {
      api.tabs.onActivated.addListener(renderActiveTabHint);
    }
  }

  // ---- boot ----------------------------------------------------------------
  async function boot() {
    await store.init();
    wire();
    await refresh();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
