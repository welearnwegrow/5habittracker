// <avatar-canvas> — generative dot-drawn kolams and avatars.
// Attributes:
//   species   kolam | bull | parrot | tiger | deer | elephant | peacock | fish | cobra | tortoise | owl | swan | horse
//   playing   "false" stops avatar motion
//   rarity    common | rare | legendary   (kolam complexity)
//   seed      int                         (deterministic design)
//   reveal    changing value replays the timelapse draw
//   density   dot-count multiplier
//   center-y  0..1 vertical centre        cover "true" = size to the larger side
(function () {
  const ANIMALS = ['bull', 'parrot', 'tiger', 'deer', 'elephant', 'peacock', 'fish', 'cobra', 'tortoise', 'owl', 'swan', 'horse'];
  const ALIAS = { bird: 'parrot', koi: 'fish', butterfly: 'peacock', jellyfish: 'tortoise', phoenix: 'swan', dragon: 'elephant' };
  const SCHEMES = [
    [[47, 138, 153], [168, 184, 42], [124, 196, 176]],
    [[47, 138, 153], [168, 184, 42], [150, 205, 220]],
    [[31, 92, 104], [168, 184, 42], [224, 178, 58]],
    [[91, 184, 201], [47, 138, 153], [190, 205, 90]],
    [[47, 138, 153], [124, 196, 176], [200, 215, 110]],
    [[31, 92, 104], [91, 184, 201], [168, 184, 42], [224, 178, 58]],
  ];
  const TAU = Math.PI * 2;
  const rgb = c => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  const mix = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
  function rngFrom(seed) {
    let a = (seed | 0) ^ 0x9e3779b9;
    return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }


  // shared geometry helpers (x right, y down, roughly -1..1)
  const dropPts = (w, h, sc, oy) => { const p = []; for (let k = 0; k < 48; k++) { const t = k / 48 * TAU; p.push([Math.sin(t) * Math.sin(t / 2) * (w / 2) / 0.77 * sc, Math.cos(t) * (h / 2) * sc + oy]); } return p; };
  const circle = (cx, cy, r, seg) => { const p = []; seg = seg || Math.max(14, Math.round(r * 240)); for (let k = 0; k < seg; k++) { const a = k / seg * TAU; p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return p; };
  const turn = (pts, ang, cx, cy) => { const c = Math.cos(ang), s = Math.sin(ang); return pts.map(q => [cx + q[0] * c - q[1] * s, cy + q[0] * s + q[1] * c]); };
  // teardrop whose tip points along screen angle ang
  const dropAt = (cx, cy, w, h, ang, sc) => turn(dropPts(w, h, sc || 1, 0), ang - Math.PI / 2, cx, cy);
  const spiral = (cx, cy, r, turns, a0, dir) => { const p = []; for (let j = 0; j <= 48; j++) { const u = j / 48, a = a0 + dir * u * turns * TAU, rr = r * (1 - u * 0.85); p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; };
  const flowerAt = (cx, cy, R, k) => { const p = []; for (let j = 0; j < 72; j++) { const a = j / 72 * TAU, rr = R * (0.45 + 0.55 * Math.abs(Math.cos(k * a / 2))); p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } return p; };
  // tiny SVG-style path reader: M, L, C, Z
  function path(spec) {
    const t = spec.trim().split(/[\s,]+/), out = []; let i = 0, cur = [0, 0], closed = false;
    const num = () => parseFloat(t[i++]);
    while (i < t.length) {
      const c = t[i++];
      if (c === 'M' || c === 'L') { cur = [num(), num()]; out.push(cur); }
      else if (c === 'C') { const a = [num(), num()], b = [num(), num()], e = [num(), num()]; for (let k = 1; k <= 24; k++) { const s = k / 24, u = 1 - s; out.push([u * u * u * cur[0] + 3 * u * u * s * a[0] + 3 * u * s * s * b[0] + s * s * s * e[0], u * u * u * cur[1] + 3 * u * u * s * a[1] + 3 * u * s * s * b[1] + s * s * s * e[1]]); } cur = e; }
      else if (c === 'Z') closed = true;
    }
    return { pts: out, closed };
  }
  // Indian folk animals drawn as kolam line art; parts can move (sway, bob, ripple, blink)
  function buildAnimal(sp, seed) {
    const r = rngFrom(seed * 11 + 7), sch = SCHEMES[Math.floor(r() * SCHEMES.length)];
    const O = [31, 92, 104], A = sch[1], B = sch[2] || sch[0];
    const polys = [], fills = [], groups = [{ t: 'none' }];
    let G = 0;
    const grp = g => { groups.push(g); return groups.length - 1; };
    const add = (pts, closed, col) => polys.push({ pts, closed, col, g: G });
    const fill = (pts, col) => { let x = 0, y = 0; pts.forEach(q => { x += q[0]; y += q[1]; }); fills.push({ pts, c: [x / pts.length, y / pts.length], col, g: G }); };
    const P = (spec, col, f) => { const q = path(spec); add(q.pts, q.closed, col); if (f) fill(q.pts, f); return q.pts; };
    const C = (cx, cy, rr, col, f) => { const q = circle(cx, cy, rr); add(q, true, col); if (f) fill(q, f); };
    const D = (cx, cy, w, h, ang, col, f) => { const q = dropAt(cx, cy, w, h, ang); add(q, true, col); if (f) fill(q, f); return q; };
    const UP = -Math.PI / 2;
    if (sp === 'elephant') {
      P('M -0.35 -0.45 C 0.05 -0.62 0.6 -0.55 0.72 -0.15 C 0.8 0.1 0.75 0.3 0.68 0.35 L 0.68 0.7 L 0.5 0.7 L 0.48 0.42 C 0.3 0.46 0.0 0.46 -0.12 0.42 L -0.14 0.7 L -0.32 0.7 L -0.32 0.35 C -0.4 0.3 -0.48 0.25 -0.52 0.2 C -0.6 0.35 -0.62 0.55 -0.75 0.62 C -0.88 0.68 -0.92 0.55 -0.84 0.52 C -0.78 0.5 -0.74 0.4 -0.72 0.3 C -0.7 0.1 -0.78 -0.15 -0.68 -0.32 C -0.6 -0.45 -0.48 -0.5 -0.35 -0.45 Z', O);
      G = grp({ t: 'rot', px: -0.42, py: -0.3, amp: 0.06, f: 1.3 }); P('M -0.42 -0.3 C -0.15 -0.35 -0.12 0.05 -0.3 0.15 C -0.42 0.18 -0.48 0.0 -0.42 -0.3 Z', O, B);
      P('M -0.38 -0.22 C -0.22 -0.25 -0.2 0.0 -0.31 0.07 C -0.38 0.09 -0.42 -0.02 -0.38 -0.22 Z', A);
      G = 0; C(-0.6, -0.2, 0.03, O);
      P('M -0.6 0.15 C -0.64 0.28 -0.72 0.32 -0.8 0.28', A);
      P('M -0.05 -0.53 C 0.15 -0.6 0.35 -0.58 0.5 -0.5 L 0.44 0.08 C 0.26 0.16 0.06 0.16 -0.02 0.08 Z', A, A);
      P('M 0.03 -0.44 C 0.18 -0.49 0.32 -0.48 0.42 -0.42 L 0.38 0.0 C 0.25 0.06 0.1 0.06 0.05 0.0 Z', B);
      add(flowerAt(0.22, -0.22, 0.1, 8), true, O); C(0.22, -0.22, 0.025, O);
      for (let k = 0; k <= 8; k++) { const s = k / 8, u = 1 - s, x = u * u * u * 0.44 + 3 * u * u * s * 0.26 + 3 * u * s * s * 0.06 + s * s * s * -0.02, y = u * u * u * 0.08 + 3 * u * u * s * 0.16 + 3 * u * s * s * 0.16 + s * s * s * 0.08; D(x, y + 0.06, 0.04, 0.07, Math.PI / 2, A); }
      G = grp({ t: 'rot', px: 0.72, py: -0.05, amp: 0.16, f: 1.7 }); P('M 0.72 -0.05 C 0.85 0.05 0.86 0.2 0.82 0.3', O); D(0.82, 0.36, 0.06, 0.1, Math.PI / 2, O, B);
      G = 0; D(-0.6, -0.4, 0.07, 0.11, UP, A, A); [-0.66, -0.6, -0.54].forEach(x => C(x, -0.31, 0.012, A));
      [[-0.32, -0.14], [0.5, 0.68]].forEach(([a, b]) => { for (let k = 0; k < 3; k++) C(a + 0.03 + k * 0.05, 0.66, 0.014, A); for (let k = 0; k < 3; k++) C(b - 0.03 - k * 0.05 + 0.0, 0.66, 0.014, A); });
    } else if (sp === 'peacock') {
      const fx = 0.15, fy = 0.4, n = 11; G = grp({ t: 'rot', px: fx, py: fy, amp: 0.035, f: 0.9 });
      for (let k = 0; k < n; k++) {
        const a = (-170 + k * 160 / (n - 1)) * Math.PI / 180, ca = Math.cos(a), sa = Math.sin(a);
        add([[fx + ca * 0.3, fy + sa * 0.3], [fx + ca * 0.6, fy + sa * 0.6]], false, O);
        for (let j = 0; j < 4; j++) { const rr = 0.36 + j * 0.065, bx = fx + ca * rr, by = fy + sa * rr, bl = 0.05 + j * 0.008; add([[bx - sa * bl - ca * 0.04, by + ca * bl - sa * 0.04], [bx, by], [bx + sa * bl - ca * 0.04, by - ca * bl - sa * 0.04]], false, B); }
        D(fx + ca * 0.68, fy + sa * 0.68, 0.13, 0.17, a, O, B); D(fx + ca * 0.665, fy + sa * 0.665, 0.08, 0.1, a, A, A); C(fx + ca * 0.655, fy + sa * 0.655, 0.018, O);
      }
      G = 0; P('M 0.3 0.5 C 0.1 0.65 -0.15 0.55 -0.15 0.35 C -0.15 0.15 -0.25 0.0 -0.3 -0.15 C -0.32 -0.28 -0.22 -0.35 -0.15 -0.28 C -0.08 -0.2 -0.05 0.0 0.05 0.15 C 0.15 0.25 0.35 0.3 0.3 0.5 Z', O);
      P('M 0.0 0.22 C 0.15 0.17 0.28 0.32 0.22 0.47 C 0.12 0.52 0.0 0.42 0.0 0.22 Z', A, A);
      P('M -0.31 -0.22 L -0.42 -0.2 L -0.31 -0.17', O); C(-0.24, -0.24, 0.02, O);
      G = grp({ t: 'rot', px: -0.2, py: -0.33, amp: 0.12, f: 1.4 }); [[-0.26, -0.46], [-0.2, -0.48], [-0.14, -0.46]].forEach(([x, y]) => { add([[-0.2, -0.33], [x, y]], false, O); D(x, y, 0.03, 0.05, UP, A, A); });
      G = 0; for (let k = 0; k < 5; k++) C(-0.2 + k * 0.035, -0.08 + k * 0.07, 0.014, A);
      P('M 0.05 0.55 L 0.0 0.78 L -0.06 0.8', O); P('M 0.15 0.56 L 0.14 0.78 L 0.08 0.8', O);
    } else if (sp === 'fish') {
      P('M -0.7 0.0 C -0.4 -0.45 0.25 -0.42 0.45 0.0 C 0.25 0.42 -0.4 0.45 -0.7 0.0 Z', O);
      G = grp({ t: 'rot', px: 0.45, py: 0, amp: 0.12, f: 2.2 }); P('M 0.45 0.0 C 0.6 -0.1 0.7 -0.35 0.85 -0.4 C 0.78 -0.15 0.78 0.15 0.85 0.4 C 0.7 0.35 0.6 0.1 0.45 0.0 Z', O, B);
      for (let k = 0; k < 4; k++) P('M 0.5 0.0 C 0.6 ' + (-0.06 - k * 0.07) + ' 0.68 ' + (-0.14 - k * 0.07) + ' 0.76 ' + (-0.16 - k * 0.06), A), P('M 0.5 0.0 C 0.6 ' + (0.06 + k * 0.07) + ' 0.68 ' + (0.14 + k * 0.07) + ' 0.76 ' + (0.16 + k * 0.06), A);
      G = 0; C(-0.5, -0.05, 0.045, O); C(-0.5, -0.05, 0.018, O, A);
      P('M -0.35 -0.25 C -0.25 -0.1 -0.25 0.1 -0.35 0.25', O);
      P('M -0.1 -0.31 C 0.0 -0.52 0.15 -0.5 0.2 -0.32', O, B); P('M 0.0 0.31 C 0.05 0.46 0.15 0.46 0.18 0.3', O, B);
      [[-0.2, [-0.18, -0.06, 0.06, 0.18]], [-0.05, [-0.18, -0.06, 0.06, 0.18]], [0.1, [-0.12, 0.0, 0.12]], [0.25, [-0.06, 0.06]]].forEach(([x, ys]) => ys.forEach(y => { const p = []; for (let j = 0; j <= 16; j++) { const a = -Math.PI / 2 + j / 16 * Math.PI; p.push([x + Math.cos(a) * 0.06, y + Math.sin(a) * 0.06]); } add(p, false, A); }));
      [[-0.85, -0.25], [-0.92, -0.1], [-0.88, 0.1]].forEach(([x, y], i) => { G = grp({ t: 'rise', amp: 0.35, f: 0.35, ph: i / 3 }); C(x, y, 0.025 + i * 0.008, B); }); G = 0;
    } else if (sp === 'parrot') {
      P('M -0.2 -0.45 C 0.05 -0.55 0.2 -0.3 0.18 0.0 C 0.16 0.25 0.05 0.4 -0.05 0.45 C -0.2 0.35 -0.28 0.05 -0.3 -0.2 C -0.32 -0.35 -0.28 -0.42 -0.2 -0.45 Z', O);
      P('M -0.29 -0.32 C -0.42 -0.34 -0.46 -0.2 -0.38 -0.12 C -0.37 -0.17 -0.34 -0.22 -0.28 -0.22', O, A);
      C(-0.18, -0.33, 0.028, O); C(-0.18, -0.33, 0.055, A);
      P('M -0.29 -0.12 C -0.18 -0.05 -0.02 -0.1 0.14 -0.22', A);
      P('M -0.05 -0.18 C 0.14 -0.18 0.18 0.15 0.06 0.36 C -0.06 0.22 -0.12 0.0 -0.05 -0.18 Z', O, B);
      for (let k = 0; k < 4; k++) { const y = -0.06 + k * 0.1, w = 0.08 - k * 0.012; add([[0.02 - w, y], [0.04, y + 0.06], [0.04 + w, y]], false, A); }
      G = grp({ t: 'rot', px: -0.05, py: 0.42, amp: 0.07, f: 1.1 }); P('M -0.02 0.42 C 0.02 0.6 0.08 0.75 0.16 0.92', O); P('M -0.08 0.42 C -0.06 0.62 -0.02 0.78 0.04 0.95', O); P('M 0.16 0.92 L 0.04 0.95', O);
      G = 0; P('M -0.7 0.48 C -0.3 0.44 0.3 0.52 0.7 0.46', O);
      [[-0.55, 0.465, -2.2], [-0.4, 0.46, 2.3], [0.35, 0.49, -0.9], [0.52, 0.48, 0.9]].forEach(([x, y, a], i) => { G = grp({ t: 'rot', px: x, py: y, amp: 0.18, f: 1.6, ph: i }); D(x + Math.cos(a) * 0.07, y + Math.sin(a) * 0.07, 0.07, 0.13, a, A, A); }); G = 0;
      C(-0.12, 0.45, 0.03, O); C(-0.02, 0.46, 0.03, O);
    } else if (sp === 'swan') {
      G = grp({ t: 'bob', ax: 0, ay: 0.018, f: 1.1 }); P('M -0.12 0.22 C -0.1 0.55 0.5 0.6 0.72 0.25 C 0.62 0.28 0.56 0.1 0.66 -0.05 C 0.5 0.05 0.35 0.02 0.2 0.12 C 0.1 0.18 0.0 0.14 -0.02 0.16', O);
      P('M -0.12 0.22 C -0.36 0.05 -0.2 -0.3 -0.38 -0.48', O); P('M -0.02 0.16 C -0.24 0.0 -0.08 -0.34 -0.28 -0.56', O);
      P('M -0.38 -0.48 C -0.46 -0.52 -0.42 -0.64 -0.32 -0.62 C -0.28 -0.6 -0.27 -0.58 -0.28 -0.56', O);
      P('M -0.42 -0.53 L -0.56 -0.5 L -0.41 -0.49', O, A); C(-0.36, -0.57, 0.018, O);
      add(spiral(-0.26, -0.68, 0.06, 1.3, Math.PI, 1), false, A);
      P('M 0.02 0.26 C 0.2 0.06 0.44 0.06 0.56 0.2 C 0.42 0.32 0.18 0.36 0.02 0.26 Z', O, B);
      [[0.16, 0.2], [0.28, 0.18], [0.4, 0.19]].forEach(([x, y]) => D(x, y, 0.06, 0.12, -0.3, A, A));
      add(spiral(0.66, -0.12, 0.09, 1.4, Math.PI / 2, -1), false, O);
      G = grp({ t: 'wave', amp: 0.02, k: 14, f: 2 }); for (let w = 0; w < 2; w++) { const p = []; for (let j = 0; j <= 80; j++) { const x = -0.6 + j / 80 * 1.4; p.push([x, 0.64 + w * 0.08 + Math.sin(x * 18 + w) * 0.025]); } add(p, false, w ? B : A); }
    } else if (sp === 'tortoise') {
      const sh = circle(0, 0.02, 1, 120).map(q => [q[0] * 0.42, 0.02 + (q[1] - 0.02) * 0.5]); add(sh, true, O); fill(sh, B);
      const rim = []; for (let j = 0; j < 240; j++) { const a = j / 240 * TAU, m = 1 + 0.05 * Math.abs(Math.sin(12 * a)); rim.push([Math.cos(a) * 0.48 * m, 0.02 + Math.sin(a) * 0.56 * m]); } add(rim, true, A);
      const hex = (cx, cy, rr) => { const p = []; for (let j = 0; j < 6; j++) { const a = j / 6 * TAU + Math.PI / 6; p.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); } add(p, true, O); C(cx, cy, rr * 0.18, A); };
      hex(0, 0.02, 0.13); for (let j = 0; j < 6; j++) { const a = j / 6 * TAU; hex(Math.cos(a) * 0.25, 0.02 + Math.sin(a) * 0.29, 0.1); }
      G = grp({ t: 'bob', ax: 0, ay: 0.02, f: 1.2 }); D(0, -0.66, 0.2, 0.26, UP, O, B); C(-0.04, -0.7, 0.014, O); C(0.04, -0.7, 0.014, O); G = 0;
      [[-0.42, -0.36, -2.4], [0.42, -0.36, -0.75], [-0.4, 0.42, 2.4], [0.4, 0.42, 0.75]].forEach(([x, y, a], i) => { G = grp({ t: 'rot', px: x - Math.cos(a) * 0.1, py: y - Math.sin(a) * 0.1, amp: 0.22, f: 1.4, ph: i % 2 ? Math.PI : 0 }); D(x, y, 0.16, 0.24, a, O, B); C(x + Math.cos(a) * 0.04, y + Math.sin(a) * 0.04, 0.015, A); }); G = 0;
      D(0, 0.64, 0.06, 0.1, Math.PI / 2, O);
    } else if (sp === 'tiger') {
      P('M -0.45 -0.2 C -0.2 -0.32 0.35 -0.32 0.55 -0.18 C 0.66 -0.1 0.66 0.08 0.58 0.14 L 0.6 0.45 L 0.48 0.45 L 0.44 0.18 C 0.25 0.22 0.0 0.22 -0.2 0.18 L -0.22 0.45 L -0.34 0.45 L -0.36 0.14 C -0.42 0.08 -0.46 -0.05 -0.45 -0.2 Z', O);
      P('M -0.45 -0.2 C -0.52 -0.36 -0.72 -0.36 -0.78 -0.22 C -0.82 -0.1 -0.76 0.04 -0.62 0.06 C -0.54 0.06 -0.47 0.0 -0.45 -0.1', O);
      D(-0.7, -0.37, 0.06, 0.08, UP - 0.3, O, B); D(-0.55, -0.37, 0.06, 0.08, UP + 0.3, O, B);
      C(-0.68, -0.21, 0.022, O); D(-0.79, -0.13, 0.04, 0.05, Math.PI / 2, O, A);
      [[-0.86, -0.16], [-0.87, -0.1], [-0.85, -0.04]].forEach(([x, y]) => add([[-0.78, -0.11], [x, y]], false, O));
      for (let k = 0; k < 7; k++) { const x = -0.28 + k * 0.12; D(x, -0.2, 0.05, 0.16, Math.PI / 2, A, A); if (k % 2 === 0) D(x + 0.06, 0.12, 0.04, 0.12, UP, A, A); }
      [-0.64, -0.56].forEach(x => D(x, -0.3, 0.025, 0.06, Math.PI / 2, A));
      [-0.28, 0.54].forEach(x => C(x, 0.46, 0.035, O));
      G = grp({ t: 'rot', px: 0.6, py: -0.12, amp: 0.18, f: 1.5 });
      P('M 0.6 -0.12 C 0.8 -0.2 0.82 -0.45 0.7 -0.5', O); add(spiral(0.68, -0.53, 0.05, 1.2, 0, -1), false, A); G = 0;
    } else if (sp === 'cobra') {
      [[0, 0.5, 0.52, 0.14], [0, 0.34, 0.42, 0.12], [0, 0.2, 0.3, 0.09]].forEach(([x, y, rx, ry], i) => { const q = circle(0, 0, 1, 90).map(v => [x + v[0] * rx, y + v[1] * ry]); add(q, true, O); for (let k = 0; k < 9 - i * 2; k++) C(x - rx * 0.7 + k * rx * 1.4 / (8 - i * 2), y, 0.014, A); });
      G = grp({ t: 'rot', px: 0, py: 0.2, amp: 0.06, f: 0.8 });
      P('M -0.1 -0.15 C -0.12 0.0 -0.16 0.1 -0.1 0.2', O); P('M 0.1 -0.15 C 0.1 0.0 0.14 0.1 0.1 0.2', O);
      for (let k = 0; k < 4; k++) add([[-0.1, -0.1 + k * 0.08], [0.1, -0.1 + k * 0.08]], false, A);
      P('M 0 -0.75 C 0.3 -0.72 0.36 -0.35 0.12 -0.15 L -0.12 -0.15 C -0.36 -0.35 -0.3 -0.72 0 -0.75 Z', O, B);
      P('M 0 -0.65 C 0.2 -0.62 0.24 -0.38 0.08 -0.24 L -0.08 -0.24 C -0.24 -0.38 -0.2 -0.62 0 -0.65 Z', A);
      C(-0.08, -0.42, 0.045, O, A); C(0.08, -0.42, 0.045, O, A); P('M -0.04 -0.42 C -0.02 -0.36 0.02 -0.36 0.04 -0.42', O);
      D(0, -0.72, 0.16, 0.2, UP, O, B); C(-0.035, -0.73, 0.014, O); C(0.035, -0.73, 0.014, O);
      P('M 0 -0.82 L 0 -0.9', A); P('M 0 -0.9 L -0.03 -0.95', A); P('M 0 -0.9 L 0.03 -0.95', A);
      G = 0;
    } else if (sp === 'bull') {
      P('M -0.3 -0.15 C -0.1 -0.35 0.45 -0.3 0.65 -0.05 C 0.75 0.1 0.72 0.3 0.6 0.38 L -0.35 0.38 C -0.45 0.3 -0.45 0.05 -0.3 -0.15 Z', O);
      P('M -0.2 -0.22 C -0.12 -0.42 0.08 -0.4 0.1 -0.28', O);
      P('M -0.3 -0.15 C -0.45 -0.2 -0.6 -0.12 -0.68 0.05 C -0.72 0.15 -0.62 0.22 -0.52 0.18 C -0.45 0.1 -0.38 0.0 -0.33 -0.02', O);
      P('M -0.42 -0.2 C -0.48 -0.35 -0.42 -0.45 -0.32 -0.48', O); P('M -0.5 -0.17 C -0.6 -0.3 -0.58 -0.42 -0.5 -0.46', O);
      D(-0.47, -0.12, 0.06, 0.12, Math.PI + 0.5, O, B); C(-0.56, -0.02, 0.02, O); C(-0.64, 0.12, 0.015, O);
      for (let k = 0; k < 7; k++) { const s = k / 6; C(-0.42 + s * 0.16, 0.02 + s * 0.2 + Math.sin(s * Math.PI) * 0.03, 0.018, A); }
      G = grp({ t: 'rot', px: -0.3, py: 0.2, amp: 0.2, f: 1.3 }); add([[-0.3, 0.2], [-0.31, 0.26]], false, O); D(-0.31, 0.3, 0.07, 0.09, Math.PI / 2, O, A); G = 0;
      P('M 0.05 -0.28 C 0.2 -0.31 0.35 -0.29 0.45 -0.22 L 0.42 0.2 C 0.3 0.25 0.15 0.25 0.05 0.2 Z', A, A);
      add(flowerAt(0.25, -0.03, 0.09, 8), true, O); C(0.25, -0.03, 0.022, O);
      for (let k = 0; k < 6; k++) D(0.07 + k * 0.07, 0.25, 0.035, 0.06, Math.PI / 2, O);
      P('M -0.22 0.38 C -0.26 0.28 -0.08 0.27 0.0 0.38', O); P('M 0.36 0.38 C 0.32 0.28 0.5 0.27 0.56 0.36', O);
      G = grp({ t: 'rot', px: 0.66, py: 0.1, amp: 0.15, f: 1.6 }); P('M 0.66 0.1 C 0.8 0.2 0.82 0.32 0.72 0.4', O); D(0.71, 0.45, 0.05, 0.09, Math.PI / 2, O, B); G = 0;
    } else if (sp === 'horse') {
      P('M -0.3 -0.1 C -0.1 -0.2 0.3 -0.2 0.45 -0.1 C 0.55 -0.02 0.55 0.15 0.48 0.2 L 0.5 0.6 L 0.4 0.6 L 0.36 0.25 C 0.2 0.28 0.0 0.28 -0.18 0.25 L -0.2 0.6 L -0.3 0.6 L -0.3 0.2 C -0.36 0.12 -0.36 0.0 -0.3 -0.1 Z', O);
      P('M -0.3 -0.1 C -0.35 -0.3 -0.42 -0.45 -0.5 -0.55 C -0.6 -0.5 -0.72 -0.38 -0.78 -0.3 C -0.8 -0.24 -0.74 -0.2 -0.68 -0.24 C -0.6 -0.3 -0.5 -0.32 -0.42 -0.25 C -0.4 -0.1 -0.36 0.0 -0.3 0.05', O);
      D(-0.48, -0.6, 0.05, 0.1, UP + 0.2, O, B); C(-0.58, -0.42, 0.02, O);
      P('M -0.62 -0.42 C -0.56 -0.36 -0.48 -0.36 -0.44 -0.3', A); C(-0.74, -0.28, 0.012, O);
      for (let k = 0; k < 6; k++) { const s = k / 5; G = grp({ t: 'rot', px: -0.48 + s * 0.17, py: -0.52 + s * 0.38, amp: 0.15, f: 1.8, ph: k * 0.6 }); D(-0.44 + s * 0.17, -0.52 + s * 0.38, 0.05, 0.11, -0.2, A, A); }
      G = 0;
      P('M -0.05 -0.18 C 0.1 -0.2 0.25 -0.2 0.32 -0.16 L 0.3 0.12 C 0.2 0.16 0.05 0.16 -0.04 0.12 Z', A, A);
      for (let k = 0; k < 5; k++) D(-0.02 + k * 0.08, 0.17, 0.035, 0.07, Math.PI / 2, O, B);
      G = grp({ t: 'rot', px: 0.48, py: -0.05, amp: 0.12, f: 1.4 });
      P('M 0.48 -0.05 C 0.68 0.0 0.7 0.3 0.62 0.45', O); P('M 0.48 -0.03 C 0.62 0.05 0.62 0.28 0.56 0.42', A); P('M 0.49 -0.07 C 0.74 -0.02 0.78 0.25 0.7 0.4', A); G = 0;
    } else if (sp === 'deer') {
      P('M -0.3 -0.05 C -0.1 -0.15 0.3 -0.15 0.42 -0.05 C 0.5 0.02 0.5 0.14 0.44 0.18 L 0.46 0.62 L 0.38 0.62 L 0.34 0.22 C 0.18 0.25 0.0 0.25 -0.16 0.22 L -0.18 0.62 L -0.26 0.62 L -0.26 0.16 C -0.32 0.1 -0.34 0.02 -0.3 -0.05 Z', O);
      P('M -0.3 -0.05 C -0.34 -0.2 -0.36 -0.3 -0.38 -0.4 C -0.46 -0.42 -0.6 -0.36 -0.66 -0.3 C -0.62 -0.26 -0.52 -0.26 -0.44 -0.3 C -0.4 -0.2 -0.34 -0.06 -0.26 0.02', O);
      C(-0.48, -0.34, 0.018, O); C(-0.65, -0.3, 0.012, O);
      P('M -0.4 -0.42 C -0.42 -0.55 -0.38 -0.68 -0.3 -0.78', O); add([[-0.41, -0.55], [-0.5, -0.64]], false, O); add([[-0.37, -0.67], [-0.44, -0.78]], false, O);
      P('M -0.38 -0.42 C -0.3 -0.52 -0.22 -0.6 -0.12 -0.64', O); add([[-0.28, -0.54], [-0.26, -0.66]], false, O); add([[-0.19, -0.6], [-0.14, -0.72]], false, O);
      G = grp({ t: 'rot', px: -0.34, py: -0.42, amp: 0.2, f: 0.9 }); D(-0.28, -0.44, 0.05, 0.1, -0.3, O, B); G = 0;
      const rs = rngFrom(seed + 5); for (let k = 0; k < 22; k++) { const x = -0.22 + rs() * 0.6, y = -0.06 + rs() * 0.22; C(x, y, 0.016 + rs() * 0.01, A, A); }
      G = grp({ t: 'rot', px: 0.44, py: -0.05, amp: 0.35, f: 2.4 }); D(0.48, -0.02, 0.05, 0.1, 0.4, O, B); G = 0;
    } else {
      P('M 0 -0.55 C 0.35 -0.55 0.45 -0.2 0.42 0.15 C 0.4 0.45 0.2 0.6 0 0.6 C -0.2 0.6 -0.4 0.45 -0.42 0.15 C -0.45 -0.2 -0.35 -0.55 0 -0.55 Z', O);
      D(-0.28, -0.6, 0.08, 0.16, UP - 0.4, O, B); D(0.28, -0.6, 0.08, 0.16, UP + 0.4, O, B);
      P('M -0.34 -0.36 C -0.2 -0.48 -0.05 -0.42 0 -0.32 C 0.05 -0.42 0.2 -0.48 0.34 -0.36', A);
      [-0.16, 0.16].forEach(x => { C(x, -0.24, 0.13, O, B); G = grp({ t: 'blink', px: x, py: -0.24, f: 0.22 }); C(x, -0.24, 0.065, O); C(x, -0.24, 0.025, O, A); G = 0; });
      D(0, -0.1, 0.07, 0.11, Math.PI / 2, O, A);
      for (let row = 0; row < 4; row++) { const y = 0.05 + row * 0.11, cnt = row > 1 ? 4 : 5; for (let k = 0; k < cnt; k++) { const x = (k - (cnt - 1) / 2) * 0.12, p = []; for (let j = 0; j <= 14; j++) { const t = j / 14 * Math.PI; p.push([x + Math.cos(t) * 0.05, y + Math.sin(t) * 0.05]); } add(p, false, A); } }
      [-1, 1].forEach(s => { G = grp({ t: 'rot', px: s * 0.4, py: -0.1, amp: 0.06, f: 1.0, ph: s > 0 ? Math.PI : 0 }); P('M ' + (s * 0.4) + ' -0.1 C ' + (s * 0.62) + ' 0.0 ' + (s * 0.6) + ' 0.32 ' + (s * 0.38) + ' 0.45', O); P('M ' + (s * 0.4) + ' 0.0 C ' + (s * 0.52) + ' 0.08 ' + (s * 0.5) + ' 0.28 ' + (s * 0.38) + ' 0.36', A); G = 0; });
      [-0.12, 0.12].forEach(x => [-0.04, 0, 0.04].forEach(d => add([[x, 0.58], [x + d, 0.66]], false, O)));
      P('M -0.65 0.66 C -0.3 0.62 0.3 0.7 0.65 0.64', O);
      [[-0.5, 0.645, -2.3], [0.48, 0.66, -0.8]].forEach(([x, y, a]) => D(x + Math.cos(a) * 0.07, y + Math.sin(a) * 0.07, 0.07, 0.13, a, A, A));
    }
    // centre and size the animal, then frame it like a kolam medallion
    let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9;
    polys.forEach(pl => pl.pts.forEach(q => { if (q[0] < mnX) mnX = q[0]; if (q[0] > mxX) mxX = q[0]; if (q[1] < mnY) mnY = q[1]; if (q[1] > mxY) mxY = q[1]; }));
    const ox = (mnX + mxX) / 2, oy = (mnY + mxY) / 2; let far = 0;
    polys.forEach(pl => pl.pts.forEach(q => { far = Math.max(far, Math.hypot(q[0] - ox, q[1] - oy)); }));
    const k = 0.74 / far, tf = q => [(q[0] - ox) * k, (q[1] - oy) * k];
    polys.forEach(pl => { pl.pts = pl.pts.map(tf); }); fills.forEach(f => { f.pts = f.pts.map(tf); f.c = tf(f.c); });
    groups.forEach(g => { if (g.px !== undefined) { const q = tf([g.px, g.py]); g.px = q[0]; g.py = q[1]; } if (g.ax !== undefined) { g.ax *= k; g.ay *= k; } if (g.t === 'wave') { g.amp *= k; g.k /= k; } if (g.t === 'rise') g.amp *= k; });
    // mehndi detailing: an inner echo line and an outer dot row on every main outline
    const mains = polys.filter(pl => pl.closed && pl.col === O);
    mains.forEach(pl => {
      const q = pl.pts; let per = 0, cx = 0, cy = 0;
      for (let i = 0; i < q.length; i++) { const b = q[(i + 1) % q.length]; per += Math.hypot(b[0] - q[i][0], b[1] - q[i][1]); cx += q[i][0]; cy += q[i][1]; }
      if (per < 0.5) return;
      cx /= q.length; cy /= q.length; G = pl.g;
      const toward = (v, d) => { const dx = cx - v[0], dy = cy - v[1], l = Math.hypot(dx, dy) || 1; return [v[0] + dx / l * d, v[1] + dy / l * d]; };
      add(q.map(v => toward(v, 0.022)), true, A);
      let acc = 0;
      for (let i = 0; i < q.length; i++) { const b = q[(i + 1) % q.length], sl = Math.hypot(b[0] - q[i][0], b[1] - q[i][1]); acc += sl; if (acc > 0.055) { acc = 0; add(circle(...toward(q[i], -0.026), 0.008, 8), true, B); } }
    });
    G = 0;
    // frame: slowly turning lotus petals, a ring line and a counter-turning bead ring
    G = grp({ t: 'spin', sp: 0.04 });
    for (let j = 0; j < 24; j++) { const a = j / 24 * TAU, q = dropAt(Math.cos(a) * 0.865, Math.sin(a) * 0.865, 0.045, 0.07, a); add(q, true, A); fill(q, A); }
    G = 0; add(circle(0, 0, 0.93, 200), true, A);
    G = grp({ t: 'spin', sp: -0.025 });
    for (let j = 0; j < 60; j++) { const a = j / 60 * TAU; add(circle(Math.cos(a) * 0.985, Math.sin(a) * 0.985, 0.014, 10), true, B); }
    G = 0; add(circle(0, 0, 0.815, 180), true, B);
    for (let j = 0; j < 48; j++) { const a = j / 48 * TAU; add(circle(Math.cos(a) * 0.795, Math.sin(a) * 0.795, 0.006, 6), true, A); }
    // outer bel border: curls that turn with the petals
    G = groups.findIndex(g => g.t === 'spin');
    for (let j = 0; j < 24; j++) { const a = (j + 0.5) / 24 * TAU, cx = Math.cos(a) * 1.06, cy = Math.sin(a) * 1.06; add(spiral(cx, cy, 0.035, 1.1, a + Math.PI, j % 2 ? 1 : -1), false, A); add(circle(Math.cos(a) * 1.11, Math.sin(a) * 1.11, 0.01, 8), true, B); }
    return { polys, fills, groups };
  }
  class AvatarCanvas extends HTMLElement {
    static get observedAttributes() { return ['species', 'rarity', 'seed', 'playing', 'reveal', 'density', 'center-y', 'centery', 'cover']; }
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
      else if (name === 'playing' || name === 'center-y' || name === 'centery' || name === 'cover') this.needDraw = true;
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
      let sp = this.getAttribute('species') || 'kolam';
      sp = ALIAS[sp] || sp; if (sp !== 'kolam' && !ANIMALS.includes(sp)) sp = 'peacock';
      this.species = sp;
      this.rarity = this.getAttribute('rarity') || 'common';
      this.seed = parseInt(this.getAttribute('seed') || '1', 10) || 1;
      const dens = parseFloat(this.getAttribute('density') || '1') || 1;
      const target = Math.max(800, Math.round((sp === 'kolam' ? 14000 : 21000) * dens));
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
        // local motif space: x = along the ring, y = outward from centre
        const place = (local, phi, rc) => { const cr = Math.cos(phi), sr = Math.sin(phi); return local.map(q => [(rc + q[1]) * cr - q[0] * sr, (rc + q[1]) * sr + q[0] * cr]); };
        const rot = (pts, ang, px, py) => { const c = Math.cos(ang), s = Math.sin(ang); return pts.map(q => { const x = q[0] - px, y = q[1] - py; return [px + x * c - y * s, py + x * s + y * c]; }); };
        // teardrop / petal: pointed tip outward, rounded base inward
        const dropPts = (w, h, sc, oy) => { const p = []; for (let k = 0; k < 48; k++) { const t = k / 48 * TAU; p.push([Math.sin(t) * Math.sin(t / 2) * (w / 2) / 0.77 * sc, Math.cos(t) * (h / 2) * sc + oy]); } return p; };
        const kp = Math.max(5, Math.min(8, Math.round(S / 2)));
        // Indian motif vocabulary (from mehndi, rangoli and kolam references)
        const M = {
          // mehndi leaf: petal with an inner echo and chevron veins
          mehndi: (w, h) => {
            const o = [[dropPts(w, h, 1, 0), true], [dropPts(w, h, 0.62, -h * 0.1), true]];
            for (let j = 0; j < 3; j++) { const y0 = -h * 0.3 + j * h * 0.13, s = 0.26 - j * 0.05; o.push([[[-w * s, y0], [0, y0 + h * 0.09], [w * s, y0]], false]); }
            return o;
          },
          // lotus (padma): centre petal, two side petals, inner echo
          lotus: (w, h) => { const hs = h * 0.74, piv = -h / 2; const side = d => rot(dropPts(w * 0.42, hs, 1, piv + hs / 2), d * 0.6, 0, piv); return [[dropPts(w * 0.5, h, 1, 0), true], [side(1), true], [side(-1), true], [dropPts(w * 0.5, h, 0.45, -h * 0.16), true]]; },
          // mango / paisley (manga, kalka) with inner echo, curl and eye
          paisley: (w, h) => {
            const bend = q => [q[0] + w * 0.32 * Math.pow(q[1] / h + 0.5, 2), q[1]];
            const base = dropPts(w * 0.9, h, 1, 0).map(bend), inner = dropPts(w * 0.9, h, 0.6, -h * 0.1).map(bend), sp = [];
            for (let j = 0; j < 36; j++) { const u = j / 35, an = u * 1.6 * TAU, rr = w * 0.16 * (1 - u * 0.85); sp.push([Math.cos(an) * rr, -h * 0.2 + Math.sin(an) * rr]); }
            return [[base, true], [inner, true], [sp, false]];
          },
          // peacock feather eye (mayil)
          peacock: (w, h) => { const m = Math.min(w, h); return [[dropPts(w, h, 1, 0), true], [dropPts(w, h, 0.6, -h * 0.12), true], [circ(0, -h * 0.16, m * 0.13, 12), true]]; },
          // tulsi sprig: a stem with three leaves
          sprig: (w, h) => {
            const lw = w * 0.34, lh = h * 0.4, piv = [0, -h * 0.02];
            const leaf = (ang) => rot(dropPts(lw, lh, 1, piv[1] + lh / 2), ang, piv[0], piv[1]);
            return [[[[0, -h / 2], [0, h * 0.1]], false], [dropPts(lw, lh, 1, h * 0.28), true], [leaf(0.8), true], [leaf(-0.8), true], [circ(0, -h / 2, Math.min(w, h) * 0.05, 8), true]];
          },
          // sikku: the looping line of a kolam drawn around a pulli dot
          sikku: (w, h) => { const p = []; for (let j = 0; j < 72; j++) { const t = j / 72 * TAU, dd = 1 + Math.sin(t) * Math.sin(t); p.push([(w * 0.5) * Math.sin(t) * Math.cos(t) / dd * 1.4, (h / 2) * Math.cos(t) / dd]); } const m = Math.min(w, h); return [[p, true], [circ(-w * 0.2, 0, m * 0.05, 8), true], [circ(w * 0.2, 0, m * 0.05, 8), true]]; },
          // pookolam flower
          flower: (w, h) => { const R = Math.min(w, h) / 2, p = []; for (let j = 0; j < 80; j++) { const an = j / 80 * TAU, rr = R * (0.42 + 0.58 * Math.abs(Math.cos(kp * an / 2))); p.push([Math.cos(an) * rr, Math.sin(an) * rr]); } return [[p, true], [circ(0, 0, R * 0.22, 14), true]]; },
          // peacock feather spoke with chevron barbs
          feather: (w, h) => {
            const o = [[[[0, -h / 2], [0, h / 2]], false]];
            for (let j = 0; j < 5; j++) { const y = -h / 2 + h * (0.12 + 0.12 * j), bw = w * 0.4 * (0.7 + j * 0.08); o.push([[[-bw, y + h * 0.1], [0, y], [bw, y + h * 0.1]], false]); }
            const ew = Math.min(w * 0.7, h * 0.22); o.push([dropPts(ew, ew * 1.3, 1, h / 2 - ew * 0.45), true]); o.push([circ(0, h / 2 - ew * 0.6, ew * 0.18, 8), true]);
            return o;
          },
          // pulli (dot) with ring
          bead: (w, h, nest) => { const R = Math.min(w, h) * 0.34; const o = [[circ(0, 0, R, 18), true]]; if (nest) o.push([circ(0, 0, R * 0.4, 10), true]); return o; },
          // kolam rhombus around a pulli dot
          diamond: (w, h) => { const d = s => [[0, h / 2 * s], [w / 2 * s, 0], [0, -h / 2 * s], [-w / 2 * s, 0]]; return [[d(1), true], [d(0.6), true], [circ(0, 0, Math.min(w, h) * 0.07, 8), true]]; },
          // large outer lotus petal
          bigpetal: (w, h) => [[dropPts(w, h, 1, 0), true], [dropPts(w, h, 0.7, -h * 0.08), true]],
        };
        const FILLABLE = { mehndi: 1, lotus: 1, paisley: 1, peacock: 1, bigpetal: 1 };
        const motifBand = (type, r, bw, col, forceN, forceFill) => {
          band++;
          const rc = r + bw / 2 + 0.008;
          let n = forceN || S * Math.max(1, Math.round((TAU * rc / (bw * 1.1)) / S));
          let w = TAU * rc / n * (type === 'bigpetal' ? 0.98 : 0.86), h = bw * 0.92;
          if (type !== 'feather' && type !== 'bigpetal' && w > h * 1.25) w = h * 1.25;
          const fill = forceFill || (FILLABLE[type] && kr() < (leg ? 0.5 : rare ? 0.38 : 0.25));
          const off = band % 2 ? Math.PI / n : 0;
          for (let k = 0; k < n; k++) {
            const phi = k / n * TAU + off, parts = M[type](w, h, kr() > 0.4);
            parts.forEach(pc => add(place(pc[0], phi, rc), pc[1], col));
            if (fill) fills.push({ pts: place(parts[0][0], phi, rc), c: place([[0, -h * 0.1]], phi, rc)[0], band, col });
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
          if (type === 'dashes') {
            const nd = S * Math.max(2, Math.round(TAU * r / 0.05 / S));
            for (let k = 0; k < nd; k++) { const p = [], a0 = k / nd * TAU; for (let j = 0; j <= 6; j++) { const an = a0 + j / 6 * (TAU / nd) * 0.55; p.push([Math.cos(an) * r, Math.sin(an) * r]); } add(p, false, col); }
            return r + 0.01;
          }
          if (type === 'drops') {
            const nd = S * Math.max(2, Math.round(TAU * r / 0.034 / S)), dir = kr() > 0.5 ? 1 : -1;
            for (let k = 0; k < nd; k++) { const loc = dropPts(0.016, 0.03, 1, 0).map(q => [q[0], q[1] * dir]); add(place(loc, k / nd * TAU, r + 0.017), true, col); }
            return r + 0.04;
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
          if (type === 'petals') return motifBand('bigpetal', r, 0.17, col, S * Math.max(1, Math.round(18 / S)), true);
          if (type === 'mehndi') return motifBand('mehndi', r, 0.2, col, S * (S < 10 ? 2 : 1));
          if (type === 'feathers') return motifBand('feather', r, 0.22, col, S * 2);
          band++;
          if (type === 'arches') {
            const am = 0.07 + kr() * 0.03, n = S * Math.max(1, Math.round(TAU * r / (am * 2.4) / S)), seg = n * 28, p = [], p2 = [];
            for (let j = 0; j < seg; j++) { const th = j / seg * TAU, u = (th * n / TAU) % 1, k = Math.pow(Math.sin(Math.PI * u), 0.7); p.push([Math.cos(th) * (r + am * k), Math.sin(th) * (r + am * k)]); p2.push([Math.cos(th) * (r + am * 0.55 * k), Math.sin(th) * (r + am * 0.55 * k)]); }
            add(p, true, col); add(p2, true, col);
            for (let k = 0; k < n; k++) { const th = (k + 0.5) / n * TAU; add(circ(Math.cos(th) * (r + am + 0.022), Math.sin(th) * (r + am + 0.022), 0.011, 10), true, col); }
            return r + am + 0.04;
          }
          // scroll: a wave with a curl in every crest (bel border)
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
        // centre: bindu dot inside a lotus, flower, interlaced circles or chakra
        const R0 = 0.12 + kr() * 0.05, ccol = cols[0];
        const ct = pick(['lotus', 'lotus', 'flower', 'interlace', 'chakra']);
        if (ct === 'lotus') {
          const pw = TAU * R0 * 0.55 / kp * 1.05;
          for (let j = 0; j < kp; j++) M.bigpetal(pw, R0 * 0.78, false).forEach(pc => add(place(pc[0], (j + 0.5) / kp * TAU, R0 * 0.6), pc[1], ccol));
          for (let j = 0; j < kp; j++) add(place(dropPts(pw * 0.75, R0 * 0.55, 1, 0), j / kp * TAU, R0 * 0.42), true, ccol);
          add(circ(0, 0, R0 * 0.16, 20), true, ccol);
        } else if (ct === 'flower') M.flower(2 * R0, 2 * R0).forEach(pc => add(pc[0], pc[1], ccol));
        else if (ct === 'interlace') { for (let j = 0; j < kp; j++) add(circ(Math.cos(j / kp * TAU) * R0 / 2, Math.sin(j / kp * TAU) * R0 / 2, R0 / 2, 44), true, ccol); }
        else {
          const ns = kp * 2; add(circ(0, 0, R0 * 0.28, 24), true, ccol); add(circ(0, 0, R0, 60), true, ccol);
          for (let j = 0; j < ns; j++) { const an = j / ns * TAU; add([[Math.cos(an) * R0 * 0.28, Math.sin(an) * R0 * 0.28], [Math.cos(an) * R0 * 0.88, Math.sin(an) * R0 * 0.88]], false, ccol); add(circ(Math.cos(an + Math.PI / ns) * R0 * 0.72, Math.sin(an + Math.PI / ns) * R0 * 0.72, R0 * 0.06, 8), true, ccol); }
        }
        add(circ(0, 0, 0.02, 12), true, ccol);
        let r = R0 + 0.014;
        r = sepBand(pick(['ring', 'dring', 'dots']), r, cols[1 % cols.length]);
        const inner = ['mehndi', 'lotus', 'paisley', 'peacock', 'sprig', 'sikku', 'flower', 'feather', 'bead', 'diamond', 'mehndi', 'lotus', 'paisley'];
        const seps = ['ring', 'dring', 'beads', 'dots', 'scallop', 'dashes', 'drops'];
        let prev = '', prevSep = '';
        const K = leg ? 4 : rare ? 3 : 2;
        for (let bb = 0; bb < K; bb++) {
          let ty; do { ty = pick(inner); } while (ty === prev); prev = ty;
          r = motifBand(ty, r, (ty === 'feather' ? 0.14 : 0.1) + kr() * 0.07, cols[(bb + 1) % cols.length]);
          let sp; do { sp = pick(seps); } while (sp === prevSep); prevSep = sp;
          r = sepBand(sp, r, cols[(bb + 2) % cols.length]);
        }
        outerBand(pick(['petals', 'scroll', 'arches', 'mehndi', 'feathers', 'petals', 'scroll', 'arches']), r, cols[0]);
        this.sample(polys, fills, target, kr);
      } else {
        const a = buildAnimal(sp, this.seed);
        this.sample(a.polys, a.fills, target, rngFrom(this.seed + 99), a.groups);
      }
    }
    // lay dots evenly along every line (rice-flour style), then scatter fill dots inside filled shapes
    sample(polys, fills, target, rnd, groups) {
      this.groups = groups || [{ t: 'none' }];
      const nFill = fills.length ? Math.round(target * 0.16) : 0, nLine = target - nFill;
      let L = 0;
      for (const pl of polys) { const q = pl.pts, m = q.length, segs = pl.closed ? m : m - 1; for (let s = 0; s < segs; s++) { const a = q[s], b = q[(s + 1) % m]; L += Math.hypot(b[0] - a[0], b[1] - a[1]); } }
      const step = L / nLine, pts = [];
      for (const pl of polys) {
        const q = pl.pts, m = q.length, segs = pl.closed ? m : m - 1; let d = 0;
        for (let s = 0; s < segs; s++) {
          const a = q[s], b = q[(s + 1) % m], sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
          while (d < sl) { const f = d / sl; pts.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, pl.col, 0, pl.g || 0]); d += step; }
          d -= sl;
        }
      }
      for (let i = 0; i < nFill; i++) { const fp = fills[Math.floor(rnd() * fills.length)], v = fp.pts[Math.floor(rnd() * fp.pts.length)], s = Math.sqrt(rnd()) * 0.88; pts.push([fp.c[0] + (v[0] - fp.c[0]) * s, fp.c[1] + (v[1] - fp.c[1]) * s, fp.col, 1, fp.g || 0]); }
      const n = pts.length;
      this.nfg = n; this.step = step;
      this.bx = new Float32Array(n); this.by = new Float32Array(n); this.kfill = new Uint8Array(n); this.kg = new Uint8Array(n); this.jit = new Float32Array(n); this.col = new Array(n);
      let mnX = 1e9, mxX = -1e9, mnY = 1e9, mxY = -1e9;
      for (let i = 0; i < n; i++) {
        const p = pts[i]; this.bx[i] = p[0]; this.by[i] = p[1]; this.kfill[i] = p[3]; this.kg[i] = p[4]; this.jit[i] = rnd();
        this.col[i] = rgb(p[3] ? mix(p[2], [255, 255, 255], 0.45) : mix(p[2], [255, 255, 255], this.jit[i] * 0.14));
        if (p[0] < mnX) mnX = p[0]; if (p[0] > mxX) mxX = p[0]; if (p[1] < mnY) mnY = p[1]; if (p[1] > mxY) mxY = p[1];
      }
      this.cx0 = (mnX + mxX) / 2; this.cy0 = (mnY + mxY) / 2;
      this.fit = 1.8 / (Math.max(mxX - mnX, mxY - mnY) || 2);
    }
    frame(now) {
      this._raf = requestAnimationFrame(this.frame.bind(this));
      let p = 1;
      if (this.revealT) { p = (now - this.revealT) / (this.species === 'kolam' ? 4800 : 5600); if (p >= 1) { p = 1; this.revealT = 0; this.needDraw = true; } }
      // avatars keep moving (about 30 fps); kolams stay still once drawn
      const live = this.species !== 'kolam' && this.getAttribute('playing') !== 'false';
      if (live && now - (this._last || 0) > 40) this.needDraw = true;
      if (p >= 1 && this.drawnOnce && !this.needDraw) return;
      this._last = now; this.needDraw = false; this.draw(p, now / 1000); this.drawnOnce = true;
    }
    // timelapse: dots appear in drawing order; a brighter pen tip leads the line
    draw(p, t) {
      t = t || 0;
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height, dpr = this.dpr;
      if (!this.off) this.off = document.createElement('canvas');
      if (this.off.width !== W || this.off.height !== H) { this.off.width = W; this.off.height = H; }
      const o = this.off.getContext('2d');
      o.clearRect(0, 0, W, H);
      const cyF = parseFloat(this.getAttribute('centery') ?? this.getAttribute('center-y') ?? '0.5') || 0.5;
      const cover = this.getAttribute('cover') === 'true', base = (cover ? Math.max(W, H) * 0.92 : Math.min(W, H)) / 2;
      const cx = W / 2, cy = H * cyF, scale = base * this.fit, n = this.nfg, lim = p < 1 ? p * n : n, tip = n * 0.004;
      const rad = Math.max(0.7 * dpr, Math.min(2.4 * dpr, this.step * scale * 0.85));
      const G = this.groups.map(g => {
        if (g.t === 'rot') { const a = g.amp * Math.sin(t * g.f * TAU / 2 + (g.ph || 0)); return { t: 1, c: Math.cos(a), s: Math.sin(a), px: g.px, py: g.py }; }
        if (g.t === 'spin') { const a = g.sp * t; return { t: 1, c: Math.cos(a), s: Math.sin(a), px: 0, py: 0 }; }
        if (g.t === 'bob') { const w = Math.sin(t * g.f * TAU / 2 + (g.ph || 0)); return { t: 2, dx: g.ax * w, dy: g.ay * w }; }
        if (g.t === 'wave') return { t: 3, amp: g.amp, k: g.k, w: t * g.f };
        if (g.t === 'rise') return { t: 4, amp: g.amp, u: t * g.f + g.ph };
        if (g.t === 'blink') { const u = (t * g.f) % 1, sy = u < 0.04 ? Math.abs(1 - u / 0.02) : 1; return { t: 5, sy: Math.max(0.08, sy), py: g.py }; }
        return { t: 0 };
      });
      const breathe = this.species === 'kolam' ? 1 : 1 + 0.008 * Math.sin(t * 1.3);
      for (let i = 0; i < lim; i++) {
        let x = this.bx[i], y = this.by[i], r = rad * (0.9 + this.jit[i] * 0.2), a = this.kfill[i] ? 0.38 : 0.9;
        const m = G[this.kg[i]];
        if (m.t === 1) { const dx = x - m.px, dy = y - m.py; x = m.px + dx * m.c - dy * m.s; y = m.py + dx * m.s + dy * m.c; }
        else if (m.t === 2) { x += m.dx; y += m.dy; }
        else if (m.t === 3) y += m.amp * Math.sin(x * m.k + m.w);
        else if (m.t === 4) { const u = (m.u % 1 + 1) % 1; y -= u * m.amp; a *= 1 - u; }
        else if (m.t === 5) y = m.py + (y - m.py) * m.sy;
        if (p < 1 && i > lim - tip) { r *= 1.8; a = 1; }
        if (a <= 0.02) continue;
        o.globalAlpha = a; o.fillStyle = this.col[i];
        o.beginPath(); o.arc(cx + (x * breathe - this.cx0) * scale, cy + (y * breathe - this.cy0) * scale, r, 0, TAU); o.fill();
      }
      o.globalAlpha = 1;
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      ctx.shadowColor = 'rgba(31,61,68,0.22)'; ctx.shadowBlur = 3 * dpr; ctx.shadowOffsetY = 1.2 * dpr;
      ctx.drawImage(this.off, 0, 0);
      ctx.restore();
    }
  }
  if (!customElements.get('avatar-canvas')) customElements.define('avatar-canvas', AvatarCanvas);
})();
