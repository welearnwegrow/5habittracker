// <avatar-canvas> — generative dot-drawn kolams and avatars.
// Attributes:
//   species   kolam | bird | koi | butterfly | jellyfish | phoenix | dragon
//   rarity    common | rare | legendary   (kolam complexity)
//   seed      int                         (deterministic design)
//   playing   "true" | "false"            (false = draw one still frame)
//   reveal    changing value replays the reveal (kolam: timelapse draw; avatar: assemble)
//   assemble  "pattern"                   (avatar reveal morphs out of a flat ring pattern)
//   density   point-count multiplier
//   center-y  0..1 vertical centre        cover "true" = size to the larger side
(function () {
  const SPECIES = ['bird', 'koi', 'butterfly', 'jellyfish', 'phoenix', 'dragon', 'kolam'];
  const PAL = {
    bird:      [[47, 138, 153], [91, 184, 201], [168, 184, 42], [124, 196, 176]],
    koi:       [[47, 138, 153], [168, 184, 42], [224, 178, 58], [91, 184, 201]],
    butterfly: [[168, 184, 42], [47, 138, 153], [124, 196, 176], [224, 178, 58]],
    jellyfish: [[91, 184, 201], [47, 138, 153], [124, 196, 176], [168, 184, 42]],
    phoenix:   [[224, 178, 58], [168, 184, 42], [47, 138, 153], [31, 92, 104]],
    dragon:    [[47, 138, 153], [31, 92, 104], [168, 184, 42], [124, 196, 176]],
  };
  const TAU = Math.PI * 2;
  const easeOut = p => 1 - Math.pow(1 - p, 3);
  const clamp01 = v => v < 0 ? 0 : v > 1 ? 1 : v;
  const rgb = c => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  function rngFrom(seed) {
    let a = (seed | 0) ^ 0x9e3779b9;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function palColor(pal, p) {
    p = clamp01(p) * (pal.length - 1);
    const i = Math.floor(p), f = p - i;
    return rgb(mix(pal[i], pal[Math.min(i + 1, pal.length - 1)], f));
  }

  class AvatarCanvas extends HTMLElement {
    static get observedAttributes() { return ['species', 'rarity', 'seed', 'playing', 'reveal', 'density', 'center-y', 'centery', 'cover', 'assemble']; }
    connectedCallback() {
      if (this._init) return; this._init = true;
      this.style.display = 'block'; this.style.position = 'relative';
      this.style.width = '100%'; this.style.height = '100%'; this.style.overflow = 'hidden';
      this.canvas = document.createElement('canvas');
      this.canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;';
      this.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.t = 0.7; this.revealT = 0;
      this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this);
      this.resize(); this.build();
      const rv = this.getAttribute('reveal'); if (rv !== null && rv !== '' && rv !== '0') this.revealT = performance.now();
      this._raf = requestAnimationFrame(this.frame.bind(this));
    }
    disconnectedCallback() { cancelAnimationFrame(this._raf); if (this.ro) this.ro.disconnect(); this._init = false; if (this.canvas) this.canvas.remove(); }
    attributeChangedCallback(name) {
      if (!this._init) return;
      if (name === 'reveal') { this.revealT = performance.now(); this.needDraw = true; }
      else if (name === 'playing' || name === 'center-y' || name === 'centery' || name === 'cover' || name === 'assemble') this.needDraw = true;
      else { this.build(); this.needDraw = true; }
    }
    resize() {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = this.clientWidth || 200, h = this.clientHeight || 200;
      this.canvas.width = Math.max(1, Math.round(w * dpr));
      this.canvas.height = Math.max(1, Math.round(h * dpr));
      this.dpr = dpr; this.needDraw = true;
    }
    build() {
      let sp = this.getAttribute('species') || 'butterfly';
      if (!SPECIES.includes(sp)) sp = 'butterfly';
      this.species = sp;
      this.rarity = this.getAttribute('rarity') || 'common';
      this.seed = parseInt(this.getAttribute('seed') || '1', 10) || 1;
      const dens = parseFloat(this.getAttribute('density') || '1') || 1;
      const nfg = Math.max(500, Math.round((sp === 'kolam' ? 9000 : 6000) * dens));
      this.nfg = nfg;
      this.gx = new Float32Array(nfg); this.gy = new Float32Array(nfg); this.ga = new Float32Array(nfg);
      this.rx = new Float32Array(nfg); this.ry = new Float32Array(nfg); this.jit = new Float32Array(nfg);
      this.col = new Array(nfg);
      const rng = rngFrom(this.seed);
      for (let i = 0; i < nfg; i++) {
        const a = rng() * TAU, rad = 0.9 + rng() * 0.7;
        this.rx[i] = Math.cos(a) * rad; this.ry[i] = Math.sin(a) * rad; this.jit[i] = rng();
      }
      // seeded order used to lay points onto the flat ring pattern (avatar reveal)
      const pr = rngFrom(this.seed + 31), perm = new Uint32Array(nfg);
      for (let i = 0; i < nfg; i++) perm[i] = i;
      for (let i = nfg - 1; i > 0; i--) { const j = Math.floor(pr() * (i + 1)); const tmp = perm[i]; perm[i] = perm[j]; perm[j] = tmp; }
      this.rank = new Float32Array(nfg);
      for (let j = 0; j < nfg; j++) this.rank[perm[j]] = j;
      // hidden 2D pattern: 6 rings growing outward, complexity rising per ring
      const ps = rngFrom(this.seed * 13 + 5), ms = [4, 6, 8, 10, 12, 16], ptypes = ['hypo', 'epi', 'petal'];
      this.pRings = [];
      for (let l = 0; l < 6; l++) this.pRings.push({ m: ms[l], type: l === 0 ? 'petal' : ptypes[Math.floor(ps() * 3)], q: 0.5 + ps() * 0.6, R: 0.2 + l * 0.165, dir: l % 2 ? -1 : 1, ph: ps() * TAU });
      this.pl = new Uint8Array(nfg); this.pp = new Float32Array(nfg); this.px = new Float32Array(nfg); this.py = new Float32Array(nfg);
      const perR = nfg / 6;
      for (let i = 0; i < nfg; i++) { const rk = this.rank[i], l = Math.min(5, Math.floor(rk / perR)); this.pl[i] = l; this.pp[i] = (rk - l * perR) / perR; }
      this.pcol = new Array(nfg);
      if (sp !== 'kolam') { const ppal = PAL[sp]; for (let i = 0; i < nfg; i++) this.pcol[i] = palColor(ppal, (this.pl[i] + this.pp[i] * 0.35) / 6); }

      const leg = this.rarity === 'legendary', rare = this.rarity !== 'common';
      if (sp === 'kolam') {
        const kr = rngFrom(this.seed * 7 + 3);
        const pick = arr => arr[Math.floor(kr() * arr.length)];
        const S = leg ? pick([12, 16]) : rare ? pick([8, 10, 12]) : pick([6, 8, 8]);
        const SCHEMES = [
          [[47, 138, 153], [168, 184, 42], [124, 196, 176]],
          [[47, 138, 153], [168, 184, 42], [150, 205, 220]],
          [[31, 92, 104], [168, 184, 42], [224, 178, 58]],
          [[91, 184, 201], [47, 138, 153], [190, 205, 90]],
          [[47, 138, 153], [124, 196, 176], [200, 215, 110]],
          [[31, 92, 104], [91, 184, 201], [168, 184, 42], [224, 178, 58]],
        ];
        const sch = pick(SCHEMES).slice();
        for (let i = sch.length - 1; i > 0; i--) { const j = Math.floor(kr() * (i + 1)); const tmp = sch[i]; sch[i] = sch[j]; sch[j] = tmp; }
        const cols = sch.slice(0, leg ? Math.min(4, sch.length) : rare ? 3 : 2);
        const polys = [], fills = [];
        let band = 0;
        const add = (pts, closed, col) => polys.push({ pts, closed, band, col });
        const circ = (cx, cy, r, seg) => { const p = []; seg = seg || Math.max(14, Math.round(r * 220)); for (let k = 0; k < seg; k++) { const an = k / seg * TAU; p.push([cx + Math.cos(an) * r, cy + Math.sin(an) * r]); } return p; };
        const place = (local, phi, rc) => { const cr = Math.cos(phi), sr = Math.sin(phi); return local.map(q => [(rc + q[1]) * cr - q[0] * sr, (rc + q[1]) * sr + q[0] * cr]); };
        const rot = (pts, ang, px, py) => { const c = Math.cos(ang), s = Math.sin(ang); return pts.map(q => { const x = q[0] - px, y = q[1] - py; return [px + x * c - y * s, py + x * s + y * c]; }); };
        const dropPts = (w, h, sc, oy) => { const p = []; for (let k = 0; k < 48; k++) { const t = k / 48 * TAU; p.push([Math.sin(t) * Math.sin(t / 2) * (w / 2) / 0.77 * sc, Math.cos(t) * (h / 2) * sc + oy]); } return p; };
        const M = {
          drop: (w, h, nest) => { const o = [[dropPts(w, h, 1, 0), true]]; if (nest) { o.push([dropPts(w, h, 0.55, -h * 0.14), true]); } else o.push([circ(0, -h * 0.18, Math.min(w, h) * 0.09, 10), true]); return o; },
          lotus: (w, h) => { const hc = h, hs = h * 0.74, piv = -h / 2; const side = (dir) => rot(dropPts(w * 0.42, hs, 1, piv + hs / 2), dir * 0.6, 0, piv); return [[dropPts(w * 0.5, hc, 1, 0), true], [side(1), true], [side(-1), true], [dropPts(w * 0.5, hc, 0.45, -h * 0.16), true]]; },
          diamond: (w, h, nest) => { const d = s => [[0, h / 2 * s], [w / 2 * s, 0], [0, -h / 2 * s], [-w / 2 * s, 0]]; const o = [[d(1), true], [d(0.6), true]]; if (nest) o.push([d(0.25), true]); return o; },
          star: (w, h, nest, k) => { const R = Math.min(w, h) / 2, p = []; for (let j = 0; j < 2 * k; j++) { const an = j / (2 * k) * TAU + Math.PI / 2, rr = j % 2 ? R * 0.45 : R; p.push([Math.cos(an) * rr, Math.sin(an) * rr]); } const o = [[p, true]]; if (nest) o.push([circ(0, 0, R * 0.28, 14), true]); return o; },
          flower: (w, h, nest, k) => { const R = Math.min(w, h) / 2, p = []; for (let j = 0; j < 80; j++) { const an = j / 80 * TAU, rr = R * (0.42 + 0.58 * Math.abs(Math.cos(k * an / 2))); p.push([Math.cos(an) * rr, Math.sin(an) * rr]); } return [[p, true], [circ(0, 0, R * 0.22, 14), true]]; },
          heart: (w, h) => { const p = []; for (let j = 0; j < 60; j++) { const t = j / 60 * TAU; const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); p.push([x / 34 * w, (y + 3) / 30 * h]); } return [[p, true]]; },
          loop: (w, h) => { const p = []; for (let j = 0; j < 72; j++) { const t = j / 72 * TAU, dd = 1 + Math.sin(t) * Math.sin(t); p.push([(w * 0.5) * Math.sin(t) * Math.cos(t) / dd * 1.4, (h / 2) * Math.cos(t) / dd]); } return [[p, true], [circ(0, h * 0.5 + Math.min(w, h) * 0.08, Math.min(w, h) * 0.06, 8), true]]; },
          bead: (w, h, nest) => { const R = Math.min(w, h) * 0.34; const o = [[circ(0, 0, R, 18), true]]; if (nest) o.push([circ(0, 0, R * 0.45, 10), true]); return o; },
          ray: (w, h) => [[[[0, -h / 2], [0, h * 0.3]], false], [dropPts(Math.max(w * 2.2, h * 0.16), h * 0.28, 1, h * 0.36), true]],
          paisley: (w, h) => { const base = dropPts(w * 0.9, h, 1, 0).map(q => [q[0] + w * 0.32 * Math.pow(q[1] / h + 0.5, 2), q[1]]); const sp = []; for (let j = 0; j < 36; j++) { const u = j / 35, an = u * 1.6 * TAU, rr = w * 0.2 * (1 - u * 0.85); sp.push([Math.cos(an) * rr, -h * 0.18 + Math.sin(an) * rr]); } return [[base, true], [sp, false]]; },
        };
        const motifBand = (type, r, bw, col, forceN) => {
          band++;
          const rc = r + bw / 2 + 0.008;
          let n = forceN || S * Math.max(1, Math.round((TAU * rc / (bw * 1.1)) / S));
          if (type === 'ray') n = S * Math.max(2, Math.round(TAU * rc / (bw * 0.22) / S));
          let w = TAU * rc / n * 0.86, h = bw * 0.92;
          if (type !== 'ray' && w > h * 1.3) w = h * 1.3;
          const nest = kr() > 0.35;
          const fill = (type === 'drop' || type === 'lotus' || type === 'heart' || type === 'paisley') && kr() < (leg ? 0.55 : rare ? 0.4 : 0.25);
          const off = band % 2 ? Math.PI / n : 0, kp = Math.max(5, Math.min(8, Math.round(S / 2)));
          for (let k = 0; k < n; k++) {
            const phi = k / n * TAU + off, parts = M[type](w, h, nest, kp);
            parts.forEach(pc => add(place(pc[0], phi, rc), pc[1], col));
            if (fill) fills.push({ pts: place(parts[0][0], phi, rc), c: place([[0, 0]], phi, rc)[0], band, col });
          }
          return rc + bw / 2 + 0.006;
        };
        const sepBand = (type, r, col) => {
          band++;
          if (type === 'ring') { add(circ(0, 0, r), true, col); return r + 0.008; }
          if (type === 'dring') { add(circ(0, 0, r), true, col); add(circ(0, 0, r + 0.016), true, col); return r + 0.024; }
          if (type === 'beads' || type === 'dots') {
            const ra = type === 'beads' ? 0.012 : 0.006, gap = type === 'beads' ? 3.2 : 4.5;
            const nb = S * Math.max(2, Math.round(TAU * (r + ra) / (ra * gap) / S));
            for (let k = 0; k < nb; k++) { const an = k / nb * TAU; add(circ(Math.cos(an) * (r + ra), Math.sin(an) * (r + ra), ra, type === 'beads' ? 12 : 7), true, col); }
            return r + 2 * ra + 0.008;
          }
          if (type === 'scallop') {
            const am = 0.03, ns = S * Math.max(2, Math.round(TAU * r / (am * 2.2) / S)), seg = ns * 16, p = [];
            for (let j = 0; j < seg; j++) { const th = j / seg * TAU, rr = r + am * Math.abs(Math.sin(ns * th / 2)); p.push([Math.cos(th) * rr, Math.sin(th) * rr]); }
            add(p, true, col);
            for (let k = 0; k < ns; k++) { const th = (2 * k + 1) * Math.PI / ns; add(circ(Math.cos(th) * (r + am * 0.45), Math.sin(th) * (r + am * 0.45), am * 0.2, 9), true, col); }
            return r + am + 0.008;
          }
          const am = 0.024, nz = S * Math.max(2, Math.round(TAU * r / (am * 1.6) / S)), p = [];
          for (let j = 0; j < 2 * nz; j++) { const th = j / (2 * nz) * TAU, rr = r + (j % 2 ? am : 0); p.push([Math.cos(th) * rr, Math.sin(th) * rr]); }
          add(p, true, col);
          return r + am + 0.008;
        };
        const outerBand = (type, r, col) => {
          if (type === 'petals') return motifBand('drop', r, 0.2, col, S * (S < 10 ? 2 : 1));
          if (type === 'lotus') return motifBand('lotus', r, 0.2, col, S);
          if (type === 'hearts') return motifBand('heart', r, 0.12, col, S * 2);
          band++;
          if (type === 'spikes') {
            const am = 0.15 + kr() * 0.06, n = S * (kr() > 0.5 ? 2 : 1), p = [], p2 = [];
            for (let j = 0; j < 2 * n; j++) { const th = j / (2 * n) * TAU; p.push([Math.cos(th) * (r + (j % 2 ? 0 : am)), Math.sin(th) * (r + (j % 2 ? 0 : am))]); p2.push([Math.cos(th) * (r + (j % 2 ? 0 : am * 0.5)), Math.sin(th) * (r + (j % 2 ? 0 : am * 0.5))]); }
            add(p, true, col); add(p2, true, col);
            for (let k = 0; k < n; k++) { const th = k / n * TAU; add(circ(Math.cos(th) * (r + am + 0.03), Math.sin(th) * (r + am + 0.03), 0.014, 10), true, col); }
            return r + am + 0.05;
          }
          const am = 0.06, n = S * Math.max(1, Math.round(TAU * r / (am * 2.6) / S)), seg = n * 24, p = [];
          for (let j = 0; j < seg; j++) { const th = j / seg * TAU, rr = r + am * 0.5 + am * 0.5 * Math.sin(n * th); p.push([Math.cos(th) * rr, Math.sin(th) * rr]); }
          add(p, true, col);
          for (let k = 0; k < n; k++) {
            const th = (k + 0.25) / n * TAU, cx = Math.cos(th) * (r + am * 1.55), cy = Math.sin(th) * (r + am * 1.55), dir = k % 2 ? 1 : -1, sp = [];
            for (let j = 0; j < 40; j++) { const u = j / 39, an = th + Math.PI + dir * u * 1.4 * TAU, rr = am * 0.55 * (1 - u * 0.85); sp.push([cx + Math.cos(an) * rr, cy + Math.sin(an) * rr]); }
            add(sp, false, col);
          }
          return r + am * 2.2;
        };
        // centre rosette
        const R0 = 0.12 + kr() * 0.05, kc = Math.max(5, Math.round(S / 2)), ccol = cols[0];
        const ct = pick(['flower', 'star', 'interlace', 'drops']);
        if (ct === 'flower') M.flower(2 * R0, 2 * R0, false, kc).forEach(pc => add(pc[0], pc[1], ccol));
        else if (ct === 'star') { M.star(2 * R0, 2 * R0, true, kc).forEach(pc => add(pc[0], pc[1], ccol)); add(circ(0, 0, R0 * 1.08), true, ccol); }
        else if (ct === 'interlace') { for (let j = 0; j < kc; j++) add(circ(Math.cos(j / kc * TAU) * R0 / 2, Math.sin(j / kc * TAU) * R0 / 2, R0 / 2, 44), true, ccol); }
        else { for (let j = 0; j < kc; j++) M.drop(R0 * 0.62, R0, false).forEach(pc => add(place(pc[0], j / kc * TAU, R0 / 2), pc[1], ccol)); }
        add(circ(0, 0, 0.02, 12), true, ccol);
        let r = R0 + 0.014;
        r = sepBand(pick(['ring', 'dring']), r, cols[1 % cols.length]);
        const inner = ['drop', 'diamond', 'star', 'flower', 'heart', 'loop', 'lotus', 'bead', 'ray', 'paisley'];
        const seps = ['ring', 'dring', 'beads', 'scallop', 'zigzag', 'dots'];
        let prev = '';
        const K = leg ? 4 : rare ? 3 : 2;
        for (let bb = 0; bb < K; bb++) {
          let ty; do { ty = pick(inner); } while (ty === prev); prev = ty;
          r = motifBand(ty, r, 0.1 + kr() * 0.07, cols[(bb + 1) % cols.length]);
          r = sepBand(pick(seps), r, cols[(bb + 2) % cols.length]);
        }
        outerBand(pick(['spikes', 'scroll', 'petals', 'lotus', 'hearts']), r, cols[0]);
        // sample polylines evenly by arc length into points
        const nFill = fills.length ? Math.round(nfg * 0.22) : 0, nLine = nfg - nFill;
        let L = 0;
        for (const pl of polys) { const q = pl.pts, m = q.length, segs = pl.closed ? m : m - 1; for (let s = 0; s < segs; s++) { const p0 = q[s], p1 = q[(s + 1) % m]; L += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]); } }
        const spacing = L / nLine, tmp = [];
        for (const pl of polys) {
          const q = pl.pts, m = q.length, segs = pl.closed ? m : m - 1; let d = 0;
          for (let s = 0; s < segs; s++) {
            const p0 = q[s], p1 = q[(s + 1) % m], sl = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
            while (d < sl) { const f = d / sl; tmp.push([p0[0] + (p1[0] - p0[0]) * f, p0[1] + (p1[1] - p0[1]) * f, pl.band, pl.col, 0]); d += spacing; }
            d -= sl;
          }
        }
        const lines = [];
        if (tmp.length) for (let i = 0; i < nLine; i++) lines.push(tmp[Math.floor(i * tmp.length / nLine)]);
        for (let i = 0; i < nFill; i++) { const fp = fills[Math.floor(kr() * fills.length)], v = fp.pts[Math.floor(kr() * fp.pts.length)], s = Math.sqrt(kr()) * 0.9; lines.push([fp.c[0] + (v[0] - fp.c[0]) * s, fp.c[1] + (v[1] - fp.c[1]) * s, fp.band, fp.col, 1]); }
        this.bx = new Float32Array(nfg); this.by = new Float32Array(nfg); this.kb = new Uint8Array(nfg); this.kfill = new Uint8Array(nfg);
        for (let i = 0; i < nfg; i++) {
          const pt = lines[i] || lines[0] || [0, 0, 0, cols[0], 0];
          this.bx[i] = pt[0]; this.by[i] = pt[1]; this.kb[i] = pt[2]; this.kfill[i] = pt[4];
          this.col[i] = rgb(pt[4] ? mix(pt[3], [255, 255, 255], 0.45) : pt[3]);
        }
        this.kbN = band + 1; this.kbPh = []; this.kbSp = [];
        for (let i = 0; i <= band; i++) { this.kbPh.push(kr() * 0.3); this.kbSp.push((i === 0 ? 0.02 : 0.012 + 0.012 * (i % 3)) * (i % 2 ? -1 : 1)); }
        this.bg = [];
      } else {
        const pal = PAL[sp];
        for (let i = 0; i < nfg; i++) this.col[i] = palColor(pal, this.colorParam(sp, i, nfg));
        const r2 = rngFrom(this.seed + 713), nbg = Math.round(1000 * dens);
        this.bg = [];
        for (let i = 0; i < nbg; i++) { const a = r2() * TAU, rad = Math.sqrt(r2()) * 1.25; this.bg.push({ x: Math.cos(a) * rad, y: Math.sin(a) * rad, ph: r2() * TAU, c: palColor(pal, r2()), a: 0.16, s: 0.7 }); }
      }
      // auto-fit over several time samples
      let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
      for (const ts of [0, 1.2, 2.4, 3.6, 4.8]) {
        this.computeFrame(ts);
        for (let i = 0; i < nfg; i++) { const x = this.gx[i], y = this.gy[i]; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
      }
      this.cx0 = (minX + maxX) / 2; this.cy0 = (minY + maxY) / 2;
      this.fit = 1.8 / (Math.max(maxX - minX, maxY - minY) || 2);
    }
    colorParam(sp, i, n) {
      if (sp === 'bird') return (Math.sin(i / 900) + 1) / 2;
      if (sp === 'butterfly' || sp === 'phoenix') return (Math.sin(i / n * Math.PI * 8) + 1) / 2;
      if (sp === 'jellyfish') return (i % 5 !== 0) ? (i / n) : 0.72;
      return i / n;
    }
    computeFrame(t) {
      const sp = this.species, n = this.nfg, gx = this.gx, gy = this.gy, ga = this.ga, jit = this.jit;
      for (let i = 0; i < n; i++) ga[i] = 1;
      if (sp === 'kolam') {
        for (let i = 0; i < n; i++) { gx[i] = this.bx[i]; gy[i] = this.by[i]; ga[i] = this.kfill[i] ? 0.5 : 1; }
      } else if (sp === 'bird') {
        for (let i = 0; i < n; i++) {
          const ii = i * 1.666;
          const k = 4 * Math.cos(ii / 21), e = ii / 1880 - 20, d = Math.sqrt(k * k + e * e);
          const ks = Math.abs(k) < 0.25 ? (k < 0 ? -0.25 : 0.25) : k;
          const q = 3 * Math.sin(2 * k) + 0.3 / ks + k * Math.sin(ii / 4465) * (9 + 2 * Math.sin(14 * e - 3 * d + 2 * t));
          gx[i] = q + 50 * Math.cos(d - t); gy[i] = -(q * Math.sin(d - t)) - 39 * d;
        }
      } else if (sp === 'phoenix') {
        for (let i = 0; i < n; i++) {
          const th = i / n * Math.PI * 8, u = i / n;
          const r = Math.exp(Math.sin(th)) - 1.7 * Math.cos(4 * th) + Math.pow(Math.sin((2 * th - Math.PI) / 24), 5);
          const flap = 0.5 + 0.5 * Math.sin(t * 2.2);
          if (u < 0.6) { gx[i] = Math.sin(th) * r * (0.5 + 0.5 * flap); gy[i] = -Math.cos(th) * r * 1.15 - 1.2; }
          else { const l = (u - 0.6) / 0.4; gx[i] = (jit[i] - 0.5) * 1.6 + Math.sin(l * 6 - t * 2.4 + i) * 1.3 * l; gy[i] = l * 5.2; ga[i] = (0.5 + 0.5 * Math.sin(t * 3 + i)) * (1 - l * 0.5); }
        }
      } else if (sp === 'butterfly') {
        const flap = 0.5 + 0.5 * Math.abs(Math.sin(t * 1.7));
        for (let i = 0; i < n; i++) {
          const th = i / n * Math.PI * 8;
          const r = Math.exp(Math.sin(th)) - 2 * Math.cos(4 * th) + Math.pow(Math.sin((2 * th - Math.PI) / 24), 5);
          gx[i] = Math.sin(th) * r * flap + Math.cos(th * 3 - t * 2) * 0.22;
          gy[i] = -Math.cos(th) * r + Math.sin(th * 3 - t * 2) * 0.22;
        }
      } else if (sp === 'koi') {
        for (let i = 0; i < n; i++) {
          const u = i / n, ang = i * 0.73, bodyR = Math.sin(Math.PI * Math.min(1, u * 1.04)) * 0.55, tail = u > 0.72 ? (u - 0.72) / 0.28 : 0;
          gx[i] = (u * 2.6 - 1.1) + Math.cos(ang) * bodyR * 0.3;
          gy[i] = Math.sin(ang) * bodyR * (1 - tail * 0.5) + Math.sin(u * 5.5 - t * 2.1) * (0.18 + tail * 0.75);
        }
      } else if (sp === 'jellyfish') {
        const pulse = Math.sin(t * 1.6), bell = 0.55 * (1 + 0.14 * pulse), drift = Math.sin(t * 0.8) * 0.08;
        for (let i = 0; i < n; i++) {
          if (i % 5 !== 0) { const th = Math.PI + (i / n) * Math.PI, rr = bell * (0.9 + 0.1 * jit[i]); gx[i] = Math.cos(th) * rr; gy[i] = Math.sin(th) * rr * 0.62 - 0.26 + drift; }
          else { const s = i % 7, l = i / n; gx[i] = (s / 6 - 0.5) * bell * 1.5 + Math.sin(l * 6.5 - t * 2.3 + s * 1.2) * 0.12 * l; gy[i] = (-0.26 + drift + bell * 0.3) + l * 1.1; ga[i] = 0.7 * (1 - l * 0.35); }
        }
      } else if (sp === 'dragon') {
        for (let i = 0; i < n; i++) {
          const u = i / n, thick = 0.14 * Math.sin(Math.PI * u) + 0.02;
          gx[i] = (u - 0.5) * 3.2 + Math.sin(i * 0.9) * thick * 0.4;
          gy[i] = Math.sin(u * 6.5 - t * 1.6) * 0.8 * (0.3 + u * 0.7) + 0.32 * Math.sin(u * 3 - t * 0.8) + Math.cos(i * 0.9) * thick;
        }

      }
    }
    computePattern(t) {
      const n = this.nfg, px = this.px, py = this.py, R = this.pRings;
      for (let i = 0; i < n; i++) {
        const l = this.pl[i], lay = R[l], th = this.pp[i] * TAU, mm = lay.m;
        let x, y;
        if (lay.type === 'hypo') { const rr = 1 / mm, d = lay.q * rr, k = mm - 1; x = (1 - rr) * Math.cos(th) + d * Math.cos(k * th); y = (1 - rr) * Math.sin(th) - d * Math.sin(k * th); }
        else if (lay.type === 'epi') { const rr = 1 / mm, d = lay.q * rr, k = mm + 1, nz = 1 + 2 * rr; x = ((1 + rr) * Math.cos(th) - d * Math.cos(k * th)) / nz; y = ((1 + rr) * Math.sin(th) - d * Math.sin(k * th)) / nz; }
        else { const rr = 0.7 + 0.3 * Math.abs(Math.cos(mm * th / 2)); x = rr * Math.cos(th); y = rr * Math.sin(th); }
        const rot = lay.ph + lay.dir * t * 0.04, br = lay.R * (1 + 0.02 * Math.sin(t * 0.8 + l)) * (1 + (this.jit[i] - 0.5) * 0.03);
        const c = Math.cos(rot), s = Math.sin(rot);
        px[i] = (x * c - y * s) * br; py[i] = (x * s + y * c) * br;
      }
    }
    frame(now) {
      this._raf = requestAnimationFrame(this.frame.bind(this));
      const playing = (this.getAttribute('playing') || 'true') !== 'false';
      let p = 1;
      if (this.revealT) {
        const dur = this.species === 'kolam' ? 4800 : this.getAttribute('assemble') === 'pattern' ? 3400 : 1600;
        p = (now - this.revealT) / dur; if (p >= 1) { p = 1; this.revealT = 0; }
      }
      if (!playing && p >= 1 && this.drawnOnce && !this.needDraw) return;
      if (playing) this.t += 0.012; else if (!this.drawnOnce) this.t = 0.7;
      this.needDraw = false; this.draw(p); this.drawnOnce = true;
    }
    draw(p) {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      ctx.clearRect(0, 0, W, H);
      const cyF = parseFloat(this.getAttribute('centery') ?? this.getAttribute('center-y') ?? '0.5') || 0.5;
      const cover = this.getAttribute('cover') === 'true', base = (cover ? Math.max(W, H) * 0.92 : Math.min(W, H)) / 2;
      const cx = W / 2, cy = H * cyF, scale = base * this.fit, n = this.nfg;
      const isK = this.species === 'kolam', leg = this.rarity === 'legendary', rare = this.rarity !== 'common';
      const ep = easeOut(Math.min(1, p)), revA = p < 1 ? Math.min(1, p / 0.45) : 1;
      ctx.globalCompositeOperation = 'source-over';
      // faint dust behind avatars
      const ca = Math.cos(this.t * 0.04), sa = Math.sin(this.t * 0.04), bgScale = base * 0.92;
      for (const b of this.bg) {
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(this.t * 1.3 + b.ph));
        const x = b.x * ca - b.y * sa, y = b.x * sa + b.y * ca;
        ctx.globalAlpha = tw * b.a * revA; ctx.fillStyle = b.c;
        ctx.beginPath(); ctx.arc(cx + x * bgScale, cy + y * bgScale, b.s * this.dpr, 0, TAU); ctx.fill();
      }
      const fromPat = p < 1 && !isK && this.getAttribute('assemble') === 'pattern';
      const pscale = base * 0.86;
      if (fromPat) this.computePattern(0.7);
      this.computeFrame(this.t);
      const r = (isK ? 1.0 : rare ? 1.0 : 0.9) * this.dpr, aBase = isK ? 0.92 : leg ? 0.42 : rare ? 0.38 : 0.34;
      const eio = p < 1 ? (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2) : 1;
      const sw = (1 - eio) * 1.6, cs = Math.cos(sw), ss = Math.sin(sw), lim = p * n;
      for (let i = 0; i < n; i++) {
        if (isK && p < 1 && i >= lim) continue;
        let x = (this.gx[i] - this.cx0) * scale, y = (this.gy[i] - this.cy0) * scale;
        let rad = r * (isK ? 0.85 + this.jit[i] * 0.3 : 0.8 + this.jit[i] * 0.6), a = this.ga[i] * aBase, c = this.col[i];
        if (isK) { if (p < 1 && i > lim - n * 0.006) rad *= 2.2; }
        else if (fromPat) {
          const ax = this.px[i] * pscale, ay = this.py[i] * pscale, ix = ax + (x - ax) * eio, iy = ay + (y - ay) * eio;
          x = ix * cs - iy * ss; y = ix * ss + iy * cs;
          a *= 1 + (1 - Math.abs(eio - 0.5) * 2) * 0.8; if (eio < 0.5) c = this.pcol[i];
        } else if (p < 1) {
          const ox = this.rx[i] * scale, oy = this.ry[i] * scale; x = ox + (x - ox) * ep; y = oy + (y - oy) * ep; a *= revA;
        }
        if (a <= 0.015) continue;
        ctx.globalAlpha = Math.min(1, a); ctx.fillStyle = c;
        ctx.beginPath(); ctx.arc(cx + x, cy + y, rad, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
  if (!customElements.get('avatar-canvas')) customElements.define('avatar-canvas', AvatarCanvas);
})();
