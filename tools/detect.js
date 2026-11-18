// Locates the value boxes (light rounded rectangles with a dark border) on a mockup image.
// Each field has an approximate seed position; the box is found by flood-filling its light
// interior (bounded by the dark border). Used by tools/calibrate.html to regenerate
// js/layouts.js whenever a mockup image is added or replaced.

const FIELD_SEEDS = {
  fatPct:     [245, 243], musclePct:  [897, 243],
  rArmFat:    [207, 437], rArmMuscle: [207, 476],
  lArmFat:    [887, 437], lArmMuscle: [887, 476],
  trunkFat:   [110, 658], whr:        [145, 840],
  subcut:     [946, 690],
  rLegFat:    [ 93, 1050], rLegMuscle: [ 98, 1135],
  lLegFat:    [727, 1050], lLegMuscle: [731, 1135],
  minerals:   [568, 1393], bone:       [883, 1393],
};

function loadImage(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}

function analyzeMockup(img) {
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, W, H).data;
  const lum = new Float32Array(W * H);
  for (let i = 0, p = 0; i < W * H; i++, p += 4) lum[i] = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];

  let BARRIER = 170; const LIGHT = 225;
  const stamp = new Int32Array(W * H); let stampId = 0;

  function fill(sx, sy) {
    stampId++;
    const stack = [sy * W + sx]; stamp[sy * W + sx] = stampId;
    let x0 = sx, x1 = sx, y0 = sy, y1 = sy, n = 0;
    while (stack.length) {
      const i = stack.pop(); const x = i % W, y = (i - x) / W; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      if (x1 - x0 > 360 || y1 - y0 > 110 || n > 45000) return null;           // leaked out of a box
      const nb = [i - 1, i + 1, i - W, i + W];
      for (const j of nb) {
        if (j < 0 || j >= W * H || stamp[j] === stampId) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === W - 1)) continue;
        if (lum[j] < BARRIER) continue;
        stamp[j] = stampId; stack.push(j);
      }
    }
    return { x0, y0, x1, y1 };
  }

  function findBox(sx, sy, used) {
    const cands = [];
    const tried = new Set();
    for (let dy = -30; dy <= 30; dy += 3) for (let dx = -60; dx <= 60; dx += 6) {
      const x = sx + dx, y = sy + dy;
      if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1 || lum[y * W + x] < LIGHT) continue;
      const r = fill(x, y);
      if (!r) continue;
      const w = r.x1 - r.x0 + 1, h = r.y1 - r.y0 + 1;
      if (w < 40 || h < 18 || h > 90) continue;
      const key = `${r.x0},${r.y0},${r.x1},${r.y1}`; if (tried.has(key)) continue; tried.add(key);
      if (used.some(u => Math.abs(u.cy - (r.y0 + r.y1) / 2) < 12 && Math.abs(u.cx - (r.x0 + r.x1) / 2) < 30)) continue;
      cands.push({ ...r, dist: Math.hypot((r.x0 + r.x1) / 2 - sx, (r.y0 + r.y1) / 2 - sy) });
    }
    if (!cands.length) return null;
    cands.sort((a, b) => a.dist - b.dist);
    const r = cands[0];
    // measure the border thickness below the interior's top edge (centre column)
    const cx = Math.round((r.x0 + r.x1) / 2);
    let t = 0; while (t < 8 && lum[(r.y0 - 1 - t) * W + cx] < BARRIER + 20) t++;
    const b = Math.max(1, t);
    return { x: r.x0 - b, y: r.y0 - b, w: r.x1 - r.x0 + 1 + 2 * b, h: r.y1 - r.y0 + 1 + 2 * b, border: b, dist: Math.round(r.dist) };
  }

  const fields = {}; const missing = []; const used = [];
  for (const [k, [sx, sy]] of Object.entries(FIELD_SEEDS)) {
    let bx = null;
    // a stricter barrier closes small gaps in hand-drawn borders
    for (const bar of [170, 195, 212]) { BARRIER = bar; bx = findBox(sx, sy, used); if (bx) break; }
    BARRIER = 170;
    if (bx) { fields[k] = bx; used.push({ cx: bx.x + bx.w / 2, cy: bx.y + bx.h / 2 }); } else missing.push(k);
  }
  // Body-fluids text has no box -> bounding box of its dark pixels
  let fx0 = W, fy0 = H, fx1 = 0, fy1 = 0;
  for (let y = 1360; y < 1428; y++) for (let x = 118; x < 362; x++) if (lum[y * W + x] < 120) {
    fx0 = Math.min(fx0, x); fx1 = Math.max(fx1, x); fy0 = Math.min(fy0, y); fy1 = Math.max(fy1, y);
  }
  fields.fluids = { x: fx0, y: fy0, w: fx1 - fx0 + 1, h: fy1 - fy0 + 1 };
  return { W, H, fields, missing };
}
