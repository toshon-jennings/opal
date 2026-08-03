/*
 * StorageManager — the single source of truth for Klippit data.
 *
 * Persists everything to chrome.storage.local (via the webextension-polyfill
 * `browser` global so the same code runs on Chrome and Firefox). There is no
 * backend, no auth, no server. Swapping in a synced/remote store later only
 * means reimplementing #read / #write.
 *
 * Data shapes
 * -----------
 * Item (a link OR a note — they share a table so connections can cross types):
 *   {
 *     id:        string,                // "itm_<random>"
 *     type:      "link" | "note",
 *     url:       string | null,         // links only
 *     title:     string,                // page title, or first line of a note
 *     favicon:   string | null,         // links only
 *     note:      string,                // the freeform context / body text
 *     tags:      string[],              // normalized, lowercased
 *     createdAt: number,                // epoch ms
 *     updatedAt: number                 // epoch ms
 *   }
 *
 * Connection (an undirected edge between two items):
 *   {
 *     id:        string,                // "con_<random>"
 *     a:         string,                // item id
 *     b:         string,                // item id
 *     label:     string,                // optional reason for the link
 *     createdAt: number
 *   }
 *
 * Storage layout (keys in chrome.storage.local):
 *   klippit:items        -> { [id]: Item }
 *   klippit:connections  -> { [id]: Connection }
 *   klippit:schema       -> number (for future migrations)
 */

const KEYS = {
  items: 'klippit:items',
  connections: 'klippit:connections',
  schema: 'klippit:schema',
};

const SCHEMA_VERSION = 1;

// Resolve the extension API namespace. The polyfill exposes a promise-based
// `browser`; fall back to `chrome` if it somehow isn't present.
const api =
  (typeof browser !== 'undefined' && browser) ||
  (typeof chrome !== 'undefined' && chrome) ||
  null;

function newId(prefix) {
  const rand =
    (globalThis.crypto && globalThis.crypto.randomUUID && globalThis.crypto.randomUUID()) ||
    Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `${prefix}_${rand.replace(/-/g, '').slice(0, 16)}`;
}

function normalizeTags(tags) {
  if (!tags) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const t = String(raw).trim().toLowerCase().replace(/^#/, '');
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

class StorageManager {
  // ---- low-level get/set against chrome.storage.local --------------------

  async #read(key, fallback) {
    const res = await api.storage.local.get(key);
    const val = res ? res[key] : undefined;
    return val === undefined ? fallback : val;
  }

  async #write(key, value) {
    await api.storage.local.set({ [key]: value });
    return value;
  }

  async #items() {
    return this.#read(KEYS.items, {});
  }

  async #connections() {
    return this.#read(KEYS.connections, {});
  }

  // ---- lifecycle ----------------------------------------------------------

  /** Ensure the store is initialized. Safe to call repeatedly. */
  async init() {
    const schema = await this.#read(KEYS.schema, null);
    if (schema === null) {
      await this.#write(KEYS.schema, SCHEMA_VERSION);
      await this.#write(KEYS.items, {});
      await this.#write(KEYS.connections, {});
    }
    return SCHEMA_VERSION;
  }

  // ---- items: create ------------------------------------------------------

  /**
   * Save a link. If the same URL already exists, the existing item is returned
   * untouched (callers can then focus/append context) rather than duplicated.
   */
  async saveLink({ url, title, favicon, note, tags } = {}) {
    if (!url) throw new Error('saveLink requires a url');
    const items = await this.#items();

    const existing = Object.values(items).find((it) => it.type === 'link' && it.url === url);
    if (existing) return { item: existing, created: false };

    const now = Date.now();
    const item = {
      id: newId('itm'),
      type: 'link',
      url,
      title: (title && title.trim()) || url,
      favicon: favicon || null,
      note: note || '',
      tags: normalizeTags(tags),
      createdAt: now,
      updatedAt: now,
    };
    items[item.id] = item;
    await this.#write(KEYS.items, items);
    return { item, created: true };
  }

  /**
   * Create a standalone note (a first-class object, not attached to any URL).
   * `source` is optional { url, title } — set when the note was captured from a
   * page selection, so the note remembers where it came from.
   */
  async createNote({ title, note, tags, source } = {}) {
    const body = (note || '').trim();
    const derivedTitle =
      (title && title.trim()) || body.split('\n')[0].slice(0, 80) || 'Untitled note';
    const now = Date.now();
    const items = await this.#items();
    const item = {
      id: newId('itm'),
      type: 'note',
      url: null,
      title: derivedTitle,
      favicon: null,
      note: body,
      tags: normalizeTags(tags),
      source: source && source.url ? { url: source.url, title: source.title || source.url } : null,
      createdAt: now,
      updatedAt: now,
    };
    items[item.id] = item;
    await this.#write(KEYS.items, items);
    return { item, created: true };
  }

  // ---- items: read --------------------------------------------------------

  async getItem(id) {
    const items = await this.#items();
    return items[id] || null;
  }

  /**
   * List items, newest first. Options:
   *   { type, tag, query } — all optional filters.
   */
  async listItems({ type, tag, query } = {}) {
    const items = Object.values(await this.#items());
    const needle = (query || '').trim().toLowerCase();
    const wantTag = tag ? tag.trim().toLowerCase() : null;

    return items
      .filter((it) => (type ? it.type === type : true))
      .filter((it) => (wantTag ? it.tags.includes(wantTag) : true))
      .filter((it) => {
        if (!needle) return true;
        return (
          (it.title || '').toLowerCase().includes(needle) ||
          (it.note || '').toLowerCase().includes(needle) ||
          (it.url || '').toLowerCase().includes(needle) ||
          it.tags.some((t) => t.includes(needle))
        );
      })
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  /** All distinct tags with their usage counts, sorted by frequency. */
  async listTags() {
    const items = Object.values(await this.#items());
    const counts = new Map();
    for (const it of items) {
      for (const t of it.tags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  // ---- items: update / delete --------------------------------------------

  /** Patch fields on an item. `tags` are re-normalized if supplied. */
  async updateItem(id, patch = {}) {
    const items = await this.#items();
    const item = items[id];
    if (!item) throw new Error(`No item with id ${id}`);

    const allowed = ['title', 'note', 'url', 'favicon'];
    for (const k of allowed) {
      if (k in patch) item[k] = patch[k];
    }
    if ('tags' in patch) item.tags = normalizeTags(patch.tags);
    item.updatedAt = Date.now();

    items[id] = item;
    await this.#write(KEYS.items, items);
    return item;
  }

  async addTag(id, tag) {
    const item = await this.getItem(id);
    if (!item) throw new Error(`No item with id ${id}`);
    return this.updateItem(id, { tags: [...item.tags, tag] });
  }

  async removeTag(id, tag) {
    const item = await this.getItem(id);
    if (!item) throw new Error(`No item with id ${id}`);
    const t = String(tag).trim().toLowerCase();
    return this.updateItem(id, { tags: item.tags.filter((x) => x !== t) });
  }

  // ---- tag management (across all items) ----------------------------------

  /**
   * Rename a tag everywhere. If `to` already exists on an item that also had
   * `from`, the two collapse into one (i.e. rename doubles as merge). Returns
   * the number of items affected.
   */
  async renameTag(from, to) {
    const src = String(from).trim().toLowerCase().replace(/^#/, '');
    const dst = normalizeTags(to)[0]; // normalize the target to a single clean tag
    if (!src || !dst || src === dst) return 0;

    const items = await this.#items();
    let affected = 0;
    for (const item of Object.values(items)) {
      if (!item.tags.includes(src)) continue;
      // Replace src with dst, dedupe, drop src.
      const next = item.tags.map((t) => (t === src ? dst : t));
      item.tags = normalizeTags(next);
      item.updatedAt = Date.now();
      affected++;
    }
    if (affected) await this.#write(KEYS.items, items);
    return affected;
  }

  /** Merge several source tags into one target tag. Returns items affected. */
  async mergeTags(sources, target) {
    const dst = normalizeTags(target)[0];
    if (!dst) return 0;
    let affected = 0;
    for (const s of sources || []) {
      affected += await this.renameTag(s, dst);
    }
    return affected;
  }

  /** Remove a tag from every item. Returns the number of items affected. */
  async deleteTag(tag) {
    const t = String(tag).trim().toLowerCase().replace(/^#/, '');
    if (!t) return 0;
    const items = await this.#items();
    let affected = 0;
    for (const item of Object.values(items)) {
      if (!item.tags.includes(t)) continue;
      item.tags = item.tags.filter((x) => x !== t);
      item.updatedAt = Date.now();
      affected++;
    }
    if (affected) await this.#write(KEYS.items, items);
    return affected;
  }

  /** Delete an item and any connections that touch it. */
  async deleteItem(id) {
    const items = await this.#items();
    if (!items[id]) return false;
    delete items[id];
    await this.#write(KEYS.items, items);

    const conns = await this.#connections();
    let changed = false;
    for (const [cid, c] of Object.entries(conns)) {
      if (c.a === id || c.b === id) {
        delete conns[cid];
        changed = true;
      }
    }
    if (changed) await this.#write(KEYS.connections, conns);
    return true;
  }

  // ---- connections --------------------------------------------------------

  /**
   * Connect two items (any combination of links/notes). Undirected and
   * deduplicated: connect(a,b) and connect(b,a) yield one edge.
   */
  async connect(aId, bId, label = '') {
    if (!aId || !bId) throw new Error('connect requires two item ids');
    if (aId === bId) throw new Error('cannot connect an item to itself');

    const items = await this.#items();
    if (!items[aId] || !items[bId]) throw new Error('both items must exist');

    const conns = await this.#connections();
    const existing = Object.values(conns).find(
      (c) => (c.a === aId && c.b === bId) || (c.a === bId && c.b === aId)
    );
    if (existing) {
      if (label && existing.label !== label) {
        existing.label = label;
        conns[existing.id] = existing;
        await this.#write(KEYS.connections, conns);
      }
      return { connection: existing, created: false };
    }

    const connection = {
      id: newId('con'),
      a: aId,
      b: bId,
      label: label || '',
      createdAt: Date.now(),
    };
    conns[connection.id] = connection;
    await this.#write(KEYS.connections, conns);
    return { connection, created: true };
  }

  async disconnect(connectionId) {
    const conns = await this.#connections();
    if (!conns[connectionId]) return false;
    delete conns[connectionId];
    await this.#write(KEYS.connections, conns);
    return true;
  }

  /** Every connection that touches `id`, paired with the item on the other end. */
  async getConnections(id) {
    const conns = Object.values(await this.#connections());
    const items = await this.#items();
    return conns
      .filter((c) => c.a === id || c.b === id)
      .map((c) => {
        const otherId = c.a === id ? c.b : c.a;
        return { connection: c, other: items[otherId] || null };
      })
      .filter((x) => x.other !== null)
      .sort((a, b) => b.connection.createdAt - a.connection.createdAt);
  }

  async allConnections() {
    return Object.values(await this.#connections());
  }

  // ---- bulk / maintenance -------------------------------------------------

  /** Export the entire store as a plain object (for backup / JSON download). */
  async exportAll() {
    return {
      schema: await this.#read(KEYS.schema, SCHEMA_VERSION),
      exportedAt: Date.now(),
      items: await this.#items(),
      connections: await this.#connections(),
    };
  }

  /** Replace the entire store from a previously exported object. */
  async importAll(data) {
    if (!data || typeof data !== 'object') throw new Error('invalid import payload');
    await this.#write(KEYS.items, data.items || {});
    await this.#write(KEYS.connections, data.connections || {});
    await this.#write(KEYS.schema, data.schema || SCHEMA_VERSION);
    return true;
  }

  async clearAll() {
    await this.#write(KEYS.items, {});
    await this.#write(KEYS.connections, {});
    return true;
  }

  async stats() {
    const items = Object.values(await this.#items());
    return {
      links: items.filter((i) => i.type === 'link').length,
      notes: items.filter((i) => i.type === 'note').length,
      connections: Object.keys(await this.#connections()).length,
      tags: (await this.listTags()).length,
    };
  }
}

// Expose on the global so this single file works in every extension context
// without a build step: the side panel loads it via <script src>, and the
// background service worker loads it via importScripts(). Both then share the
// exact same StorageManager — no ESM, no bundler required.
globalThis.StorageManager = StorageManager;
globalThis.klippitStorage = new StorageManager();
