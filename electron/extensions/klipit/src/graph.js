/*
 * KlippitGraph — a small dependency-free force-directed graph on a <canvas>.
 *
 * Renders items as nodes (teal = link, ochre = note) and connections as edges.
 * Supports pan (drag background), zoom (wheel), node drag, click-to-select
 * (highlights neighbours), and double-click to open/focus. Colors are read from
 * the page's CSS custom properties so it tracks light/dark automatically.
 *
 * Usage:
 *   const g = new KlippitGraph(canvas, { onOpen, onSelect });
 *   g.setData({ nodes:[{id,type,title,degree}], edges:[{a,b,label}] });
 *   g.destroy();
 */
class KlippitGraph {
  constructor(canvas, { onOpen, onSelect } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onOpen = onOpen || (() => {});
    this.onSelect = onSelect || (() => {});

    this.nodes = [];
    this.edges = [];
    this.pos = new Map(); // id -> {x,y,vx,vy}
    this.adj = new Map(); // id -> Set(neighbourId)

    this.scale = 1;
    this.offset = { x: 0, y: 0 };
    this.alpha = 0; // simulation "temperature"; >0 means keep ticking
    this.raf = null;
    this.selected = null;
    this.centerId = null; // node to keep centered while a focus settles
    this.hover = null;
    this.drag = null; // { id } node drag, or { pan:true } background pan
    this.last = { x: 0, y: 0 };
    this.dpr = Math.max(1, window.devicePixelRatio || 1);

    this.readColors();
    this.bind();
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas.parentElement || canvas);
    KlippitGraph.last = this; // handle for tooling / focusing from elsewhere
  }

  readColors() {
    const cs = getComputedStyle(document.documentElement);
    const v = (n, fb) => (cs.getPropertyValue(n).trim() || fb);
    this.colors = {
      teal: v('--teal', '#1f6f63'),
      ochre: v('--ochre', '#b3681c'),
      ink: v('--ink', '#2a2520'),
      inkFaint: v('--ink-faint', '#9c9080'),
      hairline: v('--hairline-strong', '#cdbfa6'),
      paper: v('--paper', '#f6f1e7'),
      surface: v('--surface', '#fffdf8'),
    };
  }

  // ---- data ----------------------------------------------------------------

  setData({ nodes, edges }) {
    this.nodes = nodes;
    this.edges = edges;
    this.adj = new Map(nodes.map((n) => [n.id, new Set()]));
    for (const e of edges) {
      this.adj.get(e.a)?.add(e.b);
      this.adj.get(e.b)?.add(e.a);
    }
    // Seed positions on a circle (keep existing positions across refreshes).
    const cx = 0;
    const cy = 0;
    const R = 120 + nodes.length * 4;
    nodes.forEach((n, i) => {
      if (!this.pos.has(n.id)) {
        const a = (i / Math.max(1, nodes.length)) * Math.PI * 2;
        this.pos.set(n.id, { x: cx + Math.cos(a) * R * Math.random(), y: cy + Math.sin(a) * R * Math.random(), vx: 0, vy: 0 });
      }
    });
    // Drop stale positions.
    for (const id of [...this.pos.keys()]) {
      if (!this.adj.has(id)) this.pos.delete(id);
    }
    this.selected = this.selected && this.adj.has(this.selected) ? this.selected : null;
    this.reheat();
    if (nodes.length) this.fitSoon = true;
  }

  reheat() {
    this.alpha = 1;
    this.start();
  }

  // ---- sizing ---------------------------------------------------------------

  resize() {
    const r = this.canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    this.dpr = Math.max(1, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(r.width * this.dpr);
    this.canvas.height = Math.round(r.height * this.dpr);
    this.w = r.width;
    this.h = r.height;
    this.draw();
  }

  // ---- coordinate transforms ------------------------------------------------

  toScreen(p) {
    return { x: p.x * this.scale + this.offset.x + this.w / 2, y: p.y * this.scale + this.offset.y + this.h / 2 };
  }
  toWorld(sx, sy) {
    return { x: (sx - this.w / 2 - this.offset.x) / this.scale, y: (sy - this.h / 2 - this.offset.y) / this.scale };
  }

  radius(n) {
    return 7 + Math.sqrt((n.degree || 0)) * 2.4;
  }

  fit() {
    if (!this.nodes.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const n of this.nodes) {
      const p = this.pos.get(n.id);
      if (!p) continue;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    const gw = Math.max(1, maxX - minX), gh = Math.max(1, maxY - minY);
    const pad = 60;
    const s = Math.min((this.w - pad) / gw, (this.h - pad) / gh, 1.6);
    this.scale = Math.max(0.25, Math.min(s, 1.6));
    const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
    this.offset.x = -mx * this.scale;
    this.offset.y = -my * this.scale;
  }

  // ---- simulation -----------------------------------------------------------

  tick() {
    const ids = this.nodes.map((n) => n.id);
    const REP = 5200;       // repulsion strength
    const SPRING = 0.045;   // edge attraction
    const REST = 78;        // ideal edge length
    const CENTER = 0.012;   // gravity to centre
    const a = this.alpha;

    // pairwise repulsion (O(n^2); fine for the modest sizes a side panel holds)
    for (let i = 0; i < ids.length; i++) {
      const pi = this.pos.get(ids[i]);
      for (let j = i + 1; j < ids.length; j++) {
        const pj = this.pos.get(ids[j]);
        let dx = pi.x - pj.x, dy = pi.y - pj.y;
        let d2 = dx * dx + dy * dy;
        if (d2 < 0.01) { d2 = 0.01; dx = Math.random() - 0.5; dy = Math.random() - 0.5; }
        const f = (REP / d2) * a;
        const d = Math.sqrt(d2);
        const fx = (dx / d) * f, fy = (dy / d) * f;
        pi.vx += fx; pi.vy += fy;
        pj.vx -= fx; pj.vy -= fy;
      }
    }
    // edge springs — explicit connections pull tighter; shared-tag links pull
    // gently (and a little more per shared tag) so clusters form without
    // collapsing onto manual connections.
    for (const e of this.edges) {
      const pa = this.pos.get(e.a), pb = this.pos.get(e.b);
      if (!pa || !pb) continue;
      const dx = pb.x - pa.x, dy = pb.y - pa.y;
      const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const isTag = e.kind === 'tag';
      const k = isTag ? 0.012 * Math.min(3, e.weight || 1) : SPRING;
      const rest = isTag ? 120 : REST;
      const f = k * (d - rest) * a;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      pa.vx += fx; pa.vy += fy;
      pb.vx -= fx; pb.vy -= fy;
    }
    // integrate
    for (const id of ids) {
      if (this.drag && this.drag.id === id) continue;
      const p = this.pos.get(id);
      p.vx += -p.x * CENTER * a;
      p.vy += -p.y * CENTER * a;
      p.vx *= 0.82; p.vy *= 0.82;
      p.x += p.vx; p.y += p.vy;
    }
    this.alpha *= 0.985;
    if (this.alpha < 0.01) this.alpha = 0;
  }

  start() {
    if (this.raf) return;
    const loop = () => {
      if (this.alpha > 0) this.tick();
      if (this.fitSoon && this.alpha < 0.4) { this.fit(); this.fitSoon = false; }
      // keep a focused node centred while the layout settles, then release it
      if (this.centerId) {
        const p = this.pos.get(this.centerId);
        if (p) { this.offset.x = -p.x * this.scale; this.offset.y = -p.y * this.scale; }
        if (this.alpha === 0) this.centerId = null;
      }
      this.draw();
      if (this.alpha > 0 || this.fitSoon || this.centerId) {
        this.raf = requestAnimationFrame(loop);
      } else {
        this.raf = null;
      }
    };
    this.raf = requestAnimationFrame(loop);
  }

  // ---- drawing --------------------------------------------------------------

  draw() {
    const ctx = this.ctx;
    if (!this.w) return;
    ctx.save();
    ctx.scale(this.dpr, this.dpr);
    ctx.clearRect(0, 0, this.w, this.h);

    const neigh = this.selected ? this.adj.get(this.selected) : null;
    const dim = (id) => this.selected && id !== this.selected && !(neigh && neigh.has(id));

    // edges — draw faint dashed tag links first, then solid connections on top
    const drawEdge = (e) => {
      const pa = this.pos.get(e.a), pb = this.pos.get(e.b);
      if (!pa || !pb) return;
      const sa = this.toScreen(pa), sb = this.toScreen(pb);
      const active = this.selected && (e.a === this.selected || e.b === this.selected);
      const isTag = e.kind === 'tag';
      ctx.beginPath();
      ctx.moveTo(sa.x, sa.y);
      ctx.lineTo(sb.x, sb.y);
      if (isTag) {
        // weight-aware: pairs sharing more tags read heavier and less faint
        const w = Math.min(e.weight || 1, 4);
        ctx.setLineDash([3, 4]);
        ctx.strokeStyle = this.colors.inkFaint;
        ctx.globalAlpha = this.selected
          ? active
            ? Math.min(0.75, 0.42 + w * 0.1)
            : 0.06
          : 0.15 + (w - 1) * 0.07;
        ctx.lineWidth = (active ? 1.2 : 0.9) + (w - 1) * 0.5;
      } else {
        ctx.setLineDash([]);
        ctx.strokeStyle = active ? this.colors.teal : this.colors.hairline;
        ctx.globalAlpha = this.selected ? (active ? 0.95 : 0.14) : 0.6;
        ctx.lineWidth = active ? 1.8 : 1.2;
      }
      ctx.stroke();
      ctx.setLineDash([]);
      // label the edge when one of its nodes is selected (shared tags for tag
      // edges, the connection's reason for conn edges)
      if (active && e.label && this.scale > 0.6) {
        const mx = (sa.x + sb.x) / 2, my = (sa.y + sb.y) / 2;
        ctx.globalAlpha = 0.92;
        ctx.font = isTag ? '600 9.5px "Hanken Grotesk", sans-serif' : 'italic 10px Fraunces, Georgia, serif';
        ctx.textAlign = 'center';
        const tw = ctx.measureText(e.label).width;
        ctx.fillStyle = this.colors.paper;
        ctx.fillRect(mx - tw / 2 - 3, my - 13, tw + 6, 13);
        ctx.fillStyle = isTag ? this.colors.inkFaint : this.colors.teal;
        ctx.fillText(e.label, mx, my - 3);
      }
    };
    for (const e of this.edges) if (e.kind === 'tag') drawEdge(e);
    for (const e of this.edges) if (e.kind !== 'tag') drawEdge(e);
    ctx.globalAlpha = 1;

    // nodes
    const showAllLabels = this.nodes.length <= 14 && this.scale > 0.5;
    for (const n of this.nodes) {
      const p = this.pos.get(n.id);
      if (!p) continue;
      const s = this.toScreen(p);
      const r = this.radius(n);
      const color = n.type === 'note' ? this.colors.ochre : this.colors.teal;
      const faded = dim(n.id);

      ctx.globalAlpha = faded ? 0.25 : 1;
      // halo for selected
      if (n.id === this.selected || n.id === this.hover) {
        ctx.beginPath();
        ctx.arc(s.x, s.y, r + 4, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.18;
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      // unlinked items render hollow (paper fill + coloured ring) so the
      // connected web stays visually dominant; connected items are solid.
      const isolated = (n.degree || 0) === 0;
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fillStyle = isolated ? this.colors.surface : color;
      ctx.fill();
      ctx.lineWidth = isolated ? 1.6 : 1.5;
      ctx.strokeStyle = isolated ? color : this.colors.surface;
      ctx.stroke();

      const label = n.id === this.selected || n.id === this.hover || showAllLabels;
      if (label && !faded) {
        const text = n.title.length > 28 ? n.title.slice(0, 27) + '…' : n.title;
        ctx.font = '600 11px "Hanken Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const tw = ctx.measureText(text).width;
        const ly = s.y + r + 4;
        ctx.globalAlpha = 0.92;
        ctx.fillStyle = this.colors.paper;
        ctx.fillRect(s.x - tw / 2 - 3, ly - 1, tw + 6, 15);
        ctx.fillStyle = this.colors.ink;
        ctx.globalAlpha = 1;
        ctx.fillText(text, s.x, ly);
      }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  // ---- interaction ----------------------------------------------------------

  nodeAt(sx, sy) {
    for (let i = this.nodes.length - 1; i >= 0; i--) {
      const n = this.nodes[i];
      const p = this.pos.get(n.id);
      if (!p) continue;
      const s = this.toScreen(p);
      const r = this.radius(n) + 4;
      if ((sx - s.x) ** 2 + (sy - s.y) ** 2 <= r * r) return n;
    }
    return null;
  }

  localXY(ev) {
    const r = this.canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  bind() {
    const c = this.canvas;
    this._onDown = (ev) => {
      const { x, y } = this.localXY(ev);
      const n = this.nodeAt(x, y);
      this.last = { x, y };
      if (n) {
        this.drag = { id: n.id, moved: false };
        this.alpha = Math.max(this.alpha, 0.3);
        this.start();
      } else {
        this.drag = { pan: true };
      }
      c.setPointerCapture?.(ev.pointerId);
    };
    this._onMove = (ev) => {
      const { x, y } = this.localXY(ev);
      if (this.drag && this.drag.id) {
        const w = this.toWorld(x, y);
        const p = this.pos.get(this.drag.id);
        p.x = w.x; p.y = w.y; p.vx = 0; p.vy = 0;
        this.drag.moved = true;
        this.alpha = Math.max(this.alpha, 0.2);
        this.start();
      } else if (this.drag && this.drag.pan) {
        this.offset.x += x - this.last.x;
        this.offset.y += y - this.last.y;
        this.last = { x, y };
        this.draw();
      } else {
        const n = this.nodeAt(x, y);
        const id = n ? n.id : null;
        if (id !== this.hover) {
          this.hover = id;
          c.style.cursor = id ? 'pointer' : 'grab';
          this.draw();
        }
      }
    };
    this._onUp = (ev) => {
      const { x, y } = this.localXY(ev);
      if (this.drag && this.drag.id && !this.drag.moved) {
        // a click on a node: select / deselect
        this.selected = this.selected === this.drag.id ? null : this.drag.id;
        const node = this.nodes.find((n) => n.id === this.selected);
        this.onSelect(node || null);
        this.draw();
      }
      this.drag = null;
    };
    this._onDbl = (ev) => {
      const { x, y } = this.localXY(ev);
      const n = this.nodeAt(x, y);
      if (n) this.onOpen(n);
    };
    this._onWheel = (ev) => {
      ev.preventDefault();
      const { x, y } = this.localXY(ev);
      const before = this.toWorld(x, y);
      const factor = Math.exp(-ev.deltaY * 0.0015);
      this.scale = Math.max(0.25, Math.min(this.scale * factor, 3));
      const after = this.toWorld(x, y);
      // keep the point under the cursor stationary
      this.offset.x += (after.x - before.x) * this.scale;
      this.offset.y += (after.y - before.y) * this.scale;
      this.draw();
    };
    c.addEventListener('pointerdown', this._onDown);
    c.addEventListener('pointermove', this._onMove);
    c.addEventListener('pointerup', this._onUp);
    c.addEventListener('pointercancel', this._onUp);
    c.addEventListener('dblclick', this._onDbl);
    c.addEventListener('wheel', this._onWheel, { passive: false });
    c.style.cursor = 'grab';
  }

  refit() {
    this.fitSoon = true;
    this.start();
  }

  // Programmatically select a node (e.g. to focus an item from elsewhere).
  selectById(id) {
    this.selected = this.adj.has(id) ? id : null;
    this.onSelect(this.nodes.find((n) => n.id === this.selected) || null);
    this.draw();
    return this.selected;
  }

  // Select a node AND pan it to centre — used when jumping in from the list.
  focus(id) {
    if (!this.adj.has(id)) return false;
    this.selected = id;
    this.onSelect(this.nodes.find((n) => n.id === id) || null);
    this.fitSoon = false; // don't let auto-fit fight the centring
    this.centerId = id;
    if (this.scale < 0.8) this.scale = 0.95; // ensure a readable zoom
    this.reheat();
    return true;
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.ro?.disconnect();
    const c = this.canvas;
    c.removeEventListener('pointerdown', this._onDown);
    c.removeEventListener('pointermove', this._onMove);
    c.removeEventListener('pointerup', this._onUp);
    c.removeEventListener('pointercancel', this._onUp);
    c.removeEventListener('dblclick', this._onDbl);
    c.removeEventListener('wheel', this._onWheel);
  }
}

globalThis.KlippitGraph = KlippitGraph;
