// Registry of the mockup images. `fatPct` is the total body-fat % the mockup illustrates.
// To add a mockup: put the image in assets/mockups, add a line here, then re-run tools/calibrate.html.
const TEMPLATES = [
  { id: 'female_10', gender: 'female', fatPct: 10, image: 'assets/mockups/female_10.webp' },
  { id: 'female_20', gender: 'female', fatPct: 20, image: 'assets/mockups/female_20.webp' },
  { id: 'female_30', gender: 'female', fatPct: 30, image: 'assets/mockups/female_30.webp' },
  { id: 'female_40', gender: 'female', fatPct: 40, image: 'assets/mockups/female_40.webp' },
  { id: 'female_50', gender: 'female', fatPct: 50, image: 'assets/mockups/female_50.webp' },
  { id: 'female_60', gender: 'female', fatPct: 60, image: 'assets/mockups/female_60.webp' },
  { id: 'male_10',   gender: 'male',   fatPct: 10, image: 'assets/mockups/male_10.webp' },
  { id: 'male_20',   gender: 'male',   fatPct: 20, image: 'assets/mockups/male_20.webp' },
  { id: 'male_30',   gender: 'male',   fatPct: 30, image: 'assets/mockups/male_30.webp' },
  { id: 'male_40',   gender: 'male',   fatPct: 40, image: 'assets/mockups/male_40.webp' },
];

/**
 * Picks the mockup for a subject: same gender, closest illustrated body-fat %.
 * Mockups are 10 points apart, so a measurement within +/-5% of a mockup maps to it.
 * An exact midpoint (e.g. 25%) goes to the higher-fat mockup. Values outside the
 * range map to the nearest end (e.g. male 47% -> male_40).
 */
function selectTemplate(gender, fatPct) {
  const g = String(gender || '').toLowerCase();
  const sex = ['m', 'male', 'man', 'זכר', 'גבר'].includes(g) ? 'male'
            : ['f', 'female', 'woman', 'נקבה', 'אישה', 'אשה'].includes(g) ? 'female' : null;
  if (!sex) throw new Error(`Unknown gender "${gender}" (expected male/female)`);
  const v = Number(fatPct);
  if (!isFinite(v)) throw new Error('Total body fat % is missing or not a number');
  let best = null;
  for (const t of TEMPLATES.filter(t => t.gender === sex)) {
    const d = Math.abs(t.fatPct - v);
    if (!best || d < best.d - 1e-9 || (Math.abs(d - best.d) < 1e-9 && t.fatPct > best.t.fatPct)) best = { t, d };
  }
  return best.t;
}
