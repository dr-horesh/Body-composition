// UI wiring: session ID (from backend / URL / user) -> that session's measurements -> preview -> PDF.
(() => {
  const $ = (id) => document.getElementById(id);
  let current = null;     // { raw, result, source }
  let loadSeq = 0;        // ignores late responses from an older request

  const setStatus = (msg, isErr = false) => { $('status').textContent = msg; $('status').className = 'status' + (isErr ? ' err' : ''); };
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  $('summaryChk').checked = APP_CONFIG.summaryPage;

  const url = (path) => APP_CONFIG.backendBaseUrl.replace(/\/$/, '') + path;
  async function getJson(path) {
    const res = await fetch(url(path), { headers: APP_CONFIG.headers });
    if (!res.ok) {
      let detail = ''; try { detail = (await res.json()).error || ''; } catch { }
      throw new Error(`השרת החזיר ${res.status}${detail ? ' — ' + detail : ''}`);
    }
    return res.json();
  }

  // ------------------------------------------------------------ session API
  async function fetchCurrentSession() {
    if (!APP_CONFIG.currentSessionPath) throw new Error('currentSessionPath לא מוגדר ב-config.js');
    const s = mapCurrentSession(await getJson(APP_CONFIG.currentSessionPath));
    if (!s.session_id) throw new Error('השרת לא החזיר Session ID');
    return s;
  }

  async function fetchSessionMeasurement(sessionId, subjectId) {
    let path = APP_CONFIG.measurementPath
      .replace('{sessionId}', encodeURIComponent(sessionId))
      .replace('{subjectId}', encodeURIComponent(subjectId || ''));
    if (subjectId && !APP_CONFIG.measurementPath.includes('{subjectId}'))
      path += (path.includes('?') ? '&' : '?') + 'subject=' + encodeURIComponent(subjectId);
    const raw = mapBackendResponse(await getJson(path));
    if (!raw || typeof raw !== 'object') throw new Error('תשובה ריקה מהשרת');

    // Make sure the data belongs to the requested session / subject
    const gotSession = raw.session_id ?? raw.sessionId ?? raw.session?.id;
    const gotSubject = raw.subject?.id ?? raw.patient?.id ?? raw.subject_id ?? raw.patient_id;
    if (APP_CONFIG.strictSessionMatch) {
      if (gotSession != null && String(gotSession) !== String(sessionId))
        throw new Error(`הנתונים שהתקבלו שייכים לסשן ${gotSession} ולא לסשן ${sessionId}`);
      if (subjectId && gotSubject != null && String(gotSubject) !== String(subjectId))
        throw new Error(`הנתונים שהתקבלו שייכים לנבדק ${gotSubject} ולא לנבדק ${subjectId}`);
    }
    if (gotSession == null) raw.session_id = sessionId;   // backend omitted it - stamp the requested one
    return raw;
  }

  async function loadSession(sessionId, subjectId, { download = false } = {}) {
    sessionId = String(sessionId || '').trim(); subjectId = String(subjectId || '').trim();
    if (!sessionId) return setStatus('יש להזין Session ID', true);
    $('sessionId').value = sessionId; $('subjectId').value = subjectId;
    const seq = ++loadSeq;
    clearReport();
    setStatus(`טוען את סשן ${sessionId}…`);
    try {
      const raw = await fetchSessionMeasurement(sessionId, subjectId);
      if (seq !== loadSeq) return;
      await show(raw, 'Session ' + sessionId, seq);
      if (download && current) downloadPdf();
    } catch (e) {
      if (seq === loadSeq) setStatus('שגיאה: ' + e.message, true);
    }
  }

  async function loadIdList() {
    if (!APP_CONFIG.listPath) return;
    try {
      const list = await getJson(APP_CONFIG.listPath);
      $('ids').innerHTML = list.map(s => {
        const id = typeof s === 'object' ? (s.session_id ?? s.sessionId) : s;
        const label = typeof s === 'object' ? [s.subject_id, s.subject_name, s.test_date].filter(Boolean).join(' · ') : '';
        return `<option value="${esc(id)}">${esc(label)}</option>`;
      }).join('');
    } catch { /* list is optional */ }
  }

  // ------------------------------------------------------------ report
  function clearReport() {
    current = null; $('pdfBtn').disabled = true; $('fileName').textContent = ''; $('info').innerHTML = '';
    $('preview').innerHTML = '<div class="empty">טוען…</div>';
  }

  async function show(raw, source, seq = ++loadSeq) {
    setStatus('מפיק דוח…');
    try {
      const result = await renderReport(raw, { summaryPage: $('summaryChk').checked });
      if (seq !== loadSeq) return;
      current = { raw, result, source };
      const { template: t, measurement: m } = result;
      const pv = $('preview'); pv.innerHTML = '';
      result.pages.forEach(c => pv.appendChild(c));
      $('info').innerHTML =
        `Session ID: <b dir="ltr">${esc(m.session_id ?? '—')}</b><br>` +
        `נבדק: <b>${esc(m.subject.name ?? '—')}</b> (<span dir="ltr">${esc(m.subject.id ?? '—')}</span>)<br>` +
        `מין: <b>${t.gender === 'male' ? 'גבר' : 'אישה'}</b> · אחוז שומן נמדד: <b>${m.total_body_fat_pct}%</b><br>` +
        `תמונה שנבחרה: <b>${t.gender === 'male' ? 'גבר' : 'אישה'} ${t.fatPct}%</b> (הפרש ${Math.abs(m.total_body_fat_pct - t.fatPct).toFixed(1)}%)`;
      $('fileName').textContent = reportFileName(m);
      $('pdfBtn').disabled = false;
      setStatus(`הדוח מוכן (${source})`);
    } catch (e) {
      if (seq !== loadSeq) return;
      current = null; $('pdfBtn').disabled = true;
      $('preview').innerHTML = '<div class="empty">אין דוח</div>';
      setStatus('שגיאה: ' + e.message, true);
    }
  }

  function downloadPdf() {
    if (!current) return;
    const m = current.result.measurement;
    const blob = buildPdf(current.result.pages, { subject: pdfSubject(m) });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = reportFileName(m);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  // ------------------------------------------------------------ events
  $('currentBtn').onclick = async () => {
    setStatus('מבקש את הסשן הפעיל מהשרת…');
    try { const s = await fetchCurrentSession(); await loadSession(s.session_id, s.subject_id); }
    catch (e) { setStatus('שגיאה: ' + e.message, true); }
  };
  $('fetchBtn').onclick = () => loadSession($('sessionId').value, $('subjectId').value);
  $('sessionId').onkeydown = $('subjectId').onkeydown = (e) => { if (e.key === 'Enter') $('fetchBtn').click(); };
  $('jsonBtn').onclick = () => {
    try { show(mapBackendResponse(JSON.parse($('jsonText').value)), 'JSON'); }
    catch (e) { setStatus('JSON לא תקין: ' + e.message, true); }
  };
  $('fileInput').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { show(mapBackendResponse(JSON.parse(await f.text())), f.name); }
    catch (err) { setStatus('קובץ לא תקין: ' + err.message, true); }
  };
  $('summaryChk').onchange = () => { if (current) show(current.raw, current.source); };
  $('pdfBtn').onclick = downloadPdf;

  // Deep link from the backend / other systems:
  //   index.html?session=<SESSION_ID>[&subject=<SUBJECT_ID>][&download=1]
  //   index.html?session=current   -> ask the backend for the open session
  loadIdList();
  const qs = new URLSearchParams(location.search);
  const qSession = qs.get('session') || qs.get('session_id') || qs.get('sessionId');
  const download = qs.get('download') === '1';
  if (qSession === 'current') {
    fetchCurrentSession().then(s => loadSession(s.session_id, s.subject_id, { download }))
      .catch(e => setStatus('שגיאה: ' + e.message, true));
  } else if (qSession) {
    loadSession(qSession, qs.get('subject') || qs.get('subject_id') || '', { download });
  }

  // Embedding API
  window.BodyCompositionReport = {
    loadSession,                                                     // (sessionId, subjectId?, {download}) -> shows the report
    generateForSession: async (sessionId, subjectId) => generateReportPdf(await fetchSessionMeasurement(sessionId, subjectId)),
    generate: generateReportPdf, selectTemplate, normalize: normalizeMeasurement,
  };
})();
