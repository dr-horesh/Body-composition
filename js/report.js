// Body-composition report engine.
//  - normalizeMeasurement(raw)  -> canonical measurement object (see samples/*.json)
//  - renderReport(m)            -> { pages: [canvas, ...], template }
//  - buildPdf(canvases)         -> Blob (application/pdf)
// Depends on: js/templates.js (TEMPLATES, selectTemplate), js/layouts.js (LAYOUTS)

const RENDER_SCALE = 2;                       // render at 2x the mockup resolution for crisp text
const VALUE_FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const VALUE_WEIGHT = '700';
const VALUE_COLOR = '#111522';
const LABEL_COLOR = '#14204a';

// ---------------------------------------------------------------- data
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return isFinite(n) ? n : null;
}
function pick(obj, ...paths) {
  for (const p of paths) {
    const v = p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return null;
}

/** Accepts the canonical schema (samples/*.json); a few common alternative key names are tolerated. */
function normalizeMeasurement(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('Measurement data is empty');
  const seg = (name) => ({
    fat_kg: num(pick(raw, `segments.${name}.fat_kg`, `${name}.fat_kg`)),
    muscle_kg: num(pick(raw, `segments.${name}.muscle_kg`, `${name}.muscle_kg`)),
  });
  const m = {
    session_id: pick(raw, 'session_id', 'sessionId', 'session.id'),
    subject: {
      id: pick(raw, 'subject.id', 'patient.id', 'subject_id', 'patient_id'),
      name: pick(raw, 'subject.name', 'patient.name', 'name'),
      gender: pick(raw, 'subject.gender', 'patient.gender', 'gender', 'sex'),
      age: num(pick(raw, 'subject.age', 'patient.age', 'age')),
      height_cm: num(pick(raw, 'subject.height_cm', 'patient.height_cm', 'height_cm')),
      weight_kg: num(pick(raw, 'subject.weight_kg', 'patient.weight_kg', 'weight_kg')),
    },
    test_date: pick(raw, 'test_date', 'date', 'measured_at'),
    total_body_fat_pct: num(pick(raw, 'total_body_fat_pct', 'body_fat_pct', 'total_body_fat_percent')),
    total_muscle_pct: num(pick(raw, 'total_muscle_pct', 'muscle_pct', 'total_muscle_percent')),
    right_arm: seg('right_arm'), left_arm: seg('left_arm'),
    right_leg: seg('right_leg'), left_leg: seg('left_leg'),
    trunk_fat_kg: num(pick(raw, 'segments.trunk.fat_kg', 'trunk.fat_kg', 'trunk_fat_kg')),
    waist_hip_ratio: num(pick(raw, 'waist_hip_ratio', 'whr', 'segments.trunk.whr')),
    subcutaneous_fat: { pct: num(pick(raw, 'subcutaneous_fat.pct', 'subcutaneous_fat_pct')), kg: num(pick(raw, 'subcutaneous_fat.kg', 'subcutaneous_fat_kg')) },
    visceral_fat: { kg: num(pick(raw, 'visceral_fat.kg', 'visceral_fat_kg')), level: num(pick(raw, 'visceral_fat.level', 'visceral_fat_level')) },
    body_fluids: { icf_pct: num(pick(raw, 'body_fluids.icf_pct', 'icf_pct')), ecf_pct: num(pick(raw, 'body_fluids.ecf_pct', 'ecf_pct')) },
    minerals: { kg: num(pick(raw, 'minerals.kg', 'minerals_kg')), pct: num(pick(raw, 'minerals.pct', 'minerals_pct')) },
    bone: { mass_kg: num(pick(raw, 'bone.mass_kg', 'bone_mass_kg')), bmc_kg: num(pick(raw, 'bone.bmc_kg', 'bmc_kg')) },
  };
  // "Total Muscle %" = SKELETAL muscle mass / body weight (not the device's total "muscle mass", which
  // includes non-skeletal lean tissue). If the backend sends skeletal_muscle_kg, the % is computed from it.
  m.skeletal_muscle_kg = num(pick(raw, 'skeletal_muscle_kg', 'skeletal_muscle_mass_kg', 'smm_kg'));
  if (m.skeletal_muscle_kg !== null && m.subject.weight_kg)
    m.total_muscle_pct = Math.round(m.skeletal_muscle_kg / m.subject.weight_kg * 1000) / 10;
  Object.defineProperty(m, '__normalized', { value: true });
  if (!m.subject.gender) throw new Error('Subject gender is missing');
  if (m.total_body_fat_pct === null) throw new Error('Total body fat % is missing');
  return m;
}

// ---------------------------------------------------------------- formatting
const DASH = '—';
function fmt(v, dec) {
  if (v === null || v === undefined) return DASH;
  return Number(v).toFixed(dec);
}
function fmtPct(v) {                       // 23 -> "23%", 23.4 -> "23.4%"
  if (v === null || v === undefined) return DASH;
  const r = Math.round(v * 10) / 10;
  return (Number.isInteger(r) ? r.toFixed(0) : r.toFixed(1)) + '%';
}
const kg = (v) => (v === null || v === undefined ? DASH : `${fmt(v, 1)} kg`);

function fieldTexts(m) {
  return {
    fatPct: fmtPct(m.total_body_fat_pct),
    musclePct: fmtPct(m.total_muscle_pct),
    rArmFat: kg(m.right_arm.fat_kg), rArmMuscle: kg(m.right_arm.muscle_kg),
    lArmFat: kg(m.left_arm.fat_kg), lArmMuscle: kg(m.left_arm.muscle_kg),
    trunkFat: kg(m.trunk_fat_kg),
    whr: fmt(m.waist_hip_ratio, 2),
    subcut: [fmtPct(m.subcutaneous_fat.pct), `(${kg(m.subcutaneous_fat.kg)})`],
    rLegFat: kg(m.right_leg.fat_kg), rLegMuscle: kg(m.right_leg.muscle_kg),
    lLegFat: kg(m.left_leg.fat_kg), lLegMuscle: kg(m.left_leg.muscle_kg),
    minerals: `${kg(m.minerals.kg)} (${fmtPct(m.minerals.pct)})`,
    bone: m.bone.bmc_kg !== null ? `${kg(m.bone.mass_kg)} | BMC ${kg(m.bone.bmc_kg)}` : kg(m.bone.mass_kg),
    fluids: `ICF ${fmtPct(m.body_fluids.icf_pct)} / ECF ${fmtPct(m.body_fluids.ecf_pct)}`,
  };
}

// ---------------------------------------------------------------- drawing helpers
function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y);
  g.closePath();
}
function fitFont(g, text, size, maxW, weight = '700') {
  let s = size;
  do { g.font = `${weight} ${s}px ${VALUE_FONT}`; if (g.measureText(text).width <= maxW) break; s -= 0.5; } while (s > 6);
  return s;
}
function samplePixel(g, x, y) {
  const p = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
  return `rgb(${p[0]},${p[1]},${p[2]})`;
}
/** Lightest of several points (avoids picking up anti-aliased border or text pixels). */
function sampleLightest(g, pts) {
  let best = null, bl = -1;
  for (const [x, y] of pts) {
    const p = g.getImageData(Math.round(x), Math.round(y), 1, 1).data;
    const l = p[0] + p[1] + p[2];
    if (l > bl) { bl = l; best = `rgb(${p[0]},${p[1]},${p[2]})`; }
  }
  return best;
}

/** Blank the inside of an existing value box and write a new value (1 or 2 lines) in it. */
function drawValueInBox(g, box, text, S) {
  const b = (box.border || 2) * S;
  const x = box.x * S, y = box.y * S, w = box.w * S, h = box.h * S;
  const pad = b + 1.5 * S;
  const ins = pad + 2 * S;
  const bg = sampleLightest(g, [[x + ins, y + ins], [x + w - ins, y + ins], [x + ins, y + h - ins], [x + w - ins, y + h - ins], [x + w / 2, y + ins]]);
  g.fillStyle = bg;
  roundRect(g, x + pad, y + pad, w - 2 * pad, h - 2 * pad, 4 * S);
  g.fill();
  g.fillStyle = VALUE_COLOR; g.textAlign = 'center'; g.textBaseline = 'middle';
  const maxW = w - 2 * pad - 4 * S;
  const lines = Array.isArray(text) ? text : [text];
  if (lines.length === 1) {
    const big = box.h > 50;
    fitFont(g, lines[0], (big ? 0.74 : 0.71) * h, maxW, VALUE_WEIGHT);
    g.fillText(lines[0], x + w / 2, y + h / 2 + 1.5 * S);
  } else {
    // two-line box (subcutaneous fat): large % on top, smaller kg below
    const s1 = fitFont(g, lines[0], 0.42 * h, maxW, VALUE_WEIGHT);
    g.fillText(lines[0], x + w / 2, y + h * 0.33);
    fitFont(g, lines[1], Math.min(0.29 * h, s1 * 0.75), maxW, VALUE_WEIGHT);
    g.fillText(lines[1], x + w / 2, y + h * 0.71);
  }
}

/** Replace free text (no box) - used for body fluids. */
function drawFreeText(g, area, text, S) {
  const x = area.x * S, y = area.y * S, w = area.w * S, h = area.h * S;
  g.fillStyle = samplePixel(g, x - 4 * S, y + h / 2);
  g.fillRect(x - 3 * S, y - 4 * S, w + 18 * S, h + 8 * S);
  g.fillStyle = VALUE_COLOR; g.textAlign = 'left'; g.textBaseline = 'middle';
  fitFont(g, text, h * 1.05, w + 6 * S, VALUE_WEIGHT);
  g.fillText(text, x, y + h / 2 + 0.5 * S);
}

/** New element: visceral fat value, placed in the empty lower part of the subcutaneous-fat panel. */
function drawVisceral(g, subcutBox, m, S) {
  const rows = [];
  if (m.visceral_fat.kg !== null) rows.push(['Visceral Fat:', kg(m.visceral_fat.kg)]);
  if (m.visceral_fat.level !== null) rows.push(['Visceral Level:', fmt(m.visceral_fat.level, 0)]);
  if (!rows.length) return;
  const top = subcutBox.y + subcutBox.h + 26;
  rows.forEach(([label, value], i) => {
    const y = top + i * 42;
    g.fillStyle = LABEL_COLOR; g.textAlign = 'left'; g.textBaseline = 'middle';
    g.font = `600 ${20 * S}px ${VALUE_FONT}`;
    g.fillText(label, 724 * S, (y + 17) * S);
    const bx = { x: 872, y, w: 112, h: 35 };
    g.fillStyle = '#ffffff'; roundRect(g, bx.x * S, bx.y * S, bx.w * S, bx.h * S, 6 * S); g.fill();
    g.lineWidth = 2 * S; g.strokeStyle = '#1b1f2e'; g.stroke();
    drawValueInBox(g, { ...bx, border: 2 }, value, S);
  });
}

// ---------------------------------------------------------------- pages
const imageCache = {};
function loadImg(src) {
  if (!imageCache[src]) imageCache[src] = new Promise((res, rej) => {
    const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Cannot load ' + src)); i.src = src;
  });
  return imageCache[src];
}

async function renderMainPage(m, template) {
  const layout = LAYOUTS[template.id];
  if (!layout) throw new Error(`No layout for template ${template.id} (run tools/calibrate.html)`);
  const img = await loadImg(template.image);
  const S = RENDER_SCALE;
  const c = document.createElement('canvas');
  c.width = img.naturalWidth * S; c.height = img.naturalHeight * S;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, 0, 0, c.width, c.height);
  const texts = fieldTexts(m);
  for (const [key, box] of Object.entries(layout.fields)) {
    if (key === 'fluids') drawFreeText(g, box, texts.fluids, S);
    else if (texts[key] !== undefined) drawValueInBox(g, box, texts[key], S);
  }
  drawVisceral(g, layout.fields.subcut, m, S);
  return c;
}

function renderSummaryPage(m, template, width, height) {
  const c = document.createElement('canvas'); c.width = width; c.height = height;
  const g = c.getContext('2d');
  const S = width / 1024;
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, width, height);
  const T = (txt, x, y, size, color = LABEL_COLOR, weight = '600', align = 'left') => {
    g.font = `${weight} ${size * S}px ${VALUE_FONT}`; g.fillStyle = color; g.textAlign = align; g.textBaseline = 'alphabetic';
    g.fillText(txt, x * S, y * S);
  };
  T('Body Composition', 60, 95, 48, '#1a2470', '700');
  T('MEASUREMENT SUMMARY', 964, 92, 24, '#2233cc', '600', 'right');
  g.fillStyle = '#2233aa'; g.fillRect(40 * S, 120 * S, 944 * S, 2 * S);

  const s = m.subject;
  const info = [
    ['Name', s.name ?? DASH], ['ID', s.id ?? DASH],
    ['Gender', String(s.gender).toLowerCase().startsWith('m') || /זכר|גבר/.test(s.gender) ? 'Male' : 'Female'], ['Age', s.age ?? DASH],
    ['Height', s.height_cm !== null ? `${s.height_cm} cm` : DASH], ['Weight', kg(s.weight_kg)],
    ['Test date', m.test_date ?? DASH],
    ['Reference figure', `${template.gender === 'male' ? 'Male' : 'Female'} ${template.fatPct}% body fat`],
    ['Session ID', m.session_id ?? DASH, true],          // full-width row: session IDs can be long
  ];
  let row = 0, col = 0;
  info.forEach(([k, v, full]) => {
    if (full && col === 1) { row++; col = 0; }
    const x = 60 + col * 470, y = 180 + row * 46;
    T(k + ':', x, y, 22, '#5a6386', '600');
    T(String(v), x + 190, y, 22, VALUE_COLOR, '600');
    if (full || col === 1) { row++; col = 0; } else col = 1;
  });

  const rows = [
    ['Total body fat', fmtPct(m.total_body_fat_pct)],
    ['Total muscle (skeletal muscle / weight)', m.skeletal_muscle_kg !== null ? `${fmtPct(m.total_muscle_pct)}  (${kg(m.skeletal_muscle_kg)})` : fmtPct(m.total_muscle_pct)],
    ['Right arm — fat / muscle', `${kg(m.right_arm.fat_kg)}  /  ${kg(m.right_arm.muscle_kg)}`],
    ['Left arm — fat / muscle', `${kg(m.left_arm.fat_kg)}  /  ${kg(m.left_arm.muscle_kg)}`],
    ['Trunk fat mass', kg(m.trunk_fat_kg)],
    ['Waist-hip ratio (WHR)', fmt(m.waist_hip_ratio, 2)],
    ['Subcutaneous fat', `${fmtPct(m.subcutaneous_fat.pct)}  (${kg(m.subcutaneous_fat.kg)})`],
    ['Visceral fat', [m.visceral_fat.kg !== null ? kg(m.visceral_fat.kg) : null, m.visceral_fat.level !== null ? `level ${fmt(m.visceral_fat.level, 0)}` : null].filter(Boolean).join('   ·   ') || DASH],
    ['Right leg — fat / muscle', `${kg(m.right_leg.fat_kg)}  /  ${kg(m.right_leg.muscle_kg)}`],
    ['Left leg — fat / muscle', `${kg(m.left_leg.fat_kg)}  /  ${kg(m.left_leg.muscle_kg)}`],
    ['Body fluids (BIA)', `ICF ${fmtPct(m.body_fluids.icf_pct)}  /  ECF ${fmtPct(m.body_fluids.ecf_pct)}`],
    ['Minerals', `${kg(m.minerals.kg)}  (${fmtPct(m.minerals.pct)})`],
    m.bone.bmc_kg !== null ? ['Bone mass  |  BMC', `${kg(m.bone.mass_kg)}  |  ${kg(m.bone.bmc_kg)}`] : ['Bone mass', kg(m.bone.mass_kg)],
  ];
  const top = 470, rh = 58;
  T('Measured values', 60, top - 24, 28, '#1a2470', '700');
  rows.forEach(([k, v], i) => {
    const y = top + i * rh;
    g.fillStyle = i % 2 ? '#ffffff' : '#eef2fb';
    g.fillRect(60 * S, y * S, 904 * S, rh * S);
    T(k, 84, y + 38, 23, LABEL_COLOR, '600');
    T(v, 940, y + 38, 23, VALUE_COLOR, '700', 'right');
  });
  g.strokeStyle = '#c6cde3'; g.lineWidth = 1.5 * S; g.strokeRect(60 * S, top * S, 904 * S, rows.length * rh * S);
  T('The body figure and illustrations on page 1 are reference images matched by gender and the closest', 60, top + rows.length * rh + 60, 18, '#5a6386', '400');
  T('total body-fat level; all numbers shown are this subject\'s measured values.', 60, top + rows.length * rh + 86, 18, '#5a6386', '400');
  g.fillStyle = '#2233aa'; g.fillRect(40 * S, (1536 - 40) * S, 944 * S, 2 * S);
  return c;
}

async function renderReport(rawOrNormalized, { summaryPage = true } = {}) {
  const m = rawOrNormalized.__normalized ? rawOrNormalized : normalizeMeasurement(rawOrNormalized);
  const template = selectTemplate(m.subject.gender, m.total_body_fat_pct);
  const main = await renderMainPage(m, template);
  const pages = [main];
  if (summaryPage) pages.push(renderSummaryPage(m, template, main.width, main.height));
  return { pages, template, measurement: m };
}

// ---------------------------------------------------------------- minimal PDF writer (JPEG pages)
function dataUrlToBytes(url) {
  const bin = atob(url.split(',')[1]);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** One page per canvas, each page sized to the canvas aspect ratio (width 595pt = A4 width). */
function buildPdf(canvases, { title = 'Body Composition Report', subject = '', quality = 0.92 } = {}) {
  const enc = new TextEncoder();
  const chunks = []; let length = 0; const offsets = [];
  const push = (data) => { const b = typeof data === 'string' ? enc.encode(data) : data; chunks.push(b); length += b.length; };
  const obj = (id, body) => { offsets[id] = length; push(`${id} 0 obj\n`); body(); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'.replace(/[\u0080-\u00ff]/g, ' ')); // header (binary marker kept ASCII-safe)
  const n = canvases.length;
  // ids: 1 catalog, 2 pages, 3 info, then per page: page, content, image
  const pageIds = canvases.map((_, i) => 4 + i * 3);
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${pageIds.map(id => `${id} 0 R`).join(' ')}] >>`));
  const esc = (s) => s.replace(/[\\()]/g, '\\$&').replace(/[^\x20-\x7e]/g, '');
  obj(3, () => push(`<< /Title (${esc(title)}) /Subject (${esc(subject)}) /Producer (Body Composition Report) >>`));
  canvases.forEach((cv, i) => {
    const pid = pageIds[i], cid = pid + 1, iid = pid + 2;
    const W = 595.28, H = +(W * cv.height / cv.width).toFixed(2);
    const jpg = dataUrlToBytes(cv.toDataURL('image/jpeg', quality));
    const content = `q ${W} 0 0 ${H} 0 0 cm /Im${i} Do Q`;
    obj(pid, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im${i} ${iid} 0 R >> >> /Contents ${cid} 0 R >>`));
    obj(cid, () => push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`));
    obj(iid, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${cv.width} /Height ${cv.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
      push(jpg); push('\nendstream');
    });
  });
  const total = 4 + n * 3;
  const xref = length;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let id = 1; id < total; id++) x += String(offsets[id]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

function reportFileName(m) {
  const clean = (s) => s.toString().replace(/[^\w\u0590-\u05FF-]+/g, '_');
  const id = clean(m.subject.id || m.subject.name || 'subject');
  const date = (m.test_date || new Date().toISOString().slice(0, 10)).toString().slice(0, 10);
  return m.session_id ? `body-composition_${clean(m.session_id)}_${id}.pdf` : `body-composition_${id}_${date}.pdf`;
}

/** PDF metadata "Subject": session + subject IDs, so a stored file can be traced back. */
function pdfSubject(m) {
  return `Session ${m.session_id ?? '-'} / Subject ${m.subject.id ?? '-'}`;
}

/** One-call API for embedding: data -> PDF Blob (+ the chosen template). */
async function generateReportPdf(raw, opts) {
  const r = await renderReport(raw, opts);
  return { blob: buildPdf(r.pages, { subject: pdfSubject(r.measurement) }), template: r.template, measurement: r.measurement, fileName: reportFileName(r.measurement), pages: r.pages };
}
