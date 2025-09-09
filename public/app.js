const els = {
  file1: document.getElementById('file1'),
  file2: document.getElementById('file2'),
  cardBoth: document.getElementById('cardBoth'),
  card1: document.getElementById('card1'),
  card2: document.getElementById('card2'),
  cardSynth: document.getElementById('cardSynth'),
  summary1: document.getElementById('summary1'),
  summary2: document.getElementById('summary2'),
  summarySynth: document.getElementById('summarySynth'),
  table1Uniq: document.getElementById('table1Uniq'),
  table2Uniq: document.getElementById('table2Uniq'),
  tableSynth: document.getElementById('tableSynth'),
  exportSynth: document.getElementById('exportSynth'),
  filterEventName: document.getElementById('filterEventName'),
  filterInstitutionOid: document.getElementById('filterInstitutionOid'),
  loadError: document.getElementById('loadError')
};

let ids1 = [];
let ids2 = [];
let recs1 = [];
let recs2 = [];
let synthIds = [];
let synthRecords = [];
let currentEventFilter = '';
let currentInstitutionFilter = '';
let raw1Text = '';
let raw2Text = '';
let name1 = '';
let name2 = '';

els.file1.addEventListener('change', async () => {
  if (!els.file1.files?.[0]) return;
  await loadAndRender(1, els.file1.files[0]);
  recomputeSynth();
});

els.file2.addEventListener('change', async () => {
  if (!els.file2.files?.[0]) return;
  await loadAndRender(2, els.file2.files[0]);
  recomputeSynth();
});

els.filterEventName.addEventListener('change', () => {
  currentEventFilter = els.filterEventName.value || '';
  recomputeSynth();
});

els.filterInstitutionOid.addEventListener('change', () => {
  currentInstitutionFilter = els.filterInstitutionOid.value || '';
  recomputeSynth();
});

async function loadAndRender(which, file) {
  els.loadError.hidden = true;
  els.loadError.textContent = '';
  try {
    const res = await parseFileToStayIds(file);
    // Ensure the combined tables card is visible when loading files
    els.cardBoth.hidden = false;
    els.cardBoth.classList.remove('collapsed');
    els.cardBoth.classList.add('can-toggle');

    if (which === 1) {
      ids1 = res.ids;
      recs1 = res.records || [];
      raw1Text = res.rawText || '';
      name1 = file.name || '';
      const u1 = unique(ids1);
      els.card1.hidden = false;
      els.card1.classList.remove('collapsed');
      els.summary1.textContent = `${u1.length} stayId uniques`;
      els.table1Uniq.innerHTML = renderIdTable(u1);
      // Populate institution filter as soon as file 1 is loaded
      const instSet1 = new Set(recs1.map(r => String(r.institutionOid || '').trim()).filter(Boolean));
      populateInstitutionFilter(instSet1);
    } else {
      ids2 = res.ids;
      recs2 = res.records || [];
      raw2Text = res.rawText || '';
      name2 = file.name || '';
      const u2 = unique(ids2);
      els.card2.hidden = false;
      els.card2.classList.remove('collapsed');
      els.summary2.textContent = `${u2.length} stayId uniques`;
      els.table2Uniq.innerHTML = renderIdTable(u2);
    }
  } catch (err) {
    els.loadError.hidden = false;
    els.loadError.textContent = `Erreur de lecture (${file.name}): ${String(err)}`;
  }
}

function recomputeSynth() {
  // Only compute once both files are loaded
  if (!(recs1.length && recs2.length)) {
    els.cardSynth.hidden = true;
    els.exportSynth.disabled = true;
    renderSynthChart(0);
    return;
  }

  // Restrict to records whose eventName exists in both files
  const setEN1 = new Set(recs1.map(r => normEventName(r.eventName)).filter(Boolean));
  const setEN2 = new Set(recs2.map(r => normEventName(r.eventName)).filter(Boolean));
  const commonEN = new Set([...setEN1].filter(en => setEN2.has(en)));

  // Populate eventName filter dropdown once
  populateEventFilter(commonEN);

  // Apply selected eventName filter (if any)
  const applyFilter = (r) => {
    const en = normEventName(r.eventName);
    if (!commonEN.has(en)) return false;
    if (currentEventFilter && en !== currentEventFilter) return false;
    if (currentInstitutionFilter) {
      const io = String(r.institutionOid || '').trim();
      if (io !== currentInstitutionFilter) return false;
    }
    return true;
  };
  const f1 = recs1.filter(applyFilter);
  const f2 = recs2.filter(applyFilter);

  // Populate institution filter from filtered records (both files)
  populateInstitutionFilter(new Set([...f1, ...f2].map(r => String(r.institutionOid || '').trim()).filter(Boolean)));

  // Update per-file unique tables based on common eventNames
  const u1 = unique(f1.map(r => r.stayId));
  const u2 = unique(f2.map(r => r.stayId));
  els.summary1.textContent = `${u1.length} stayId uniques (événements communs)`;
  els.table1Uniq.innerHTML = renderIdTable(u1);
  els.summary2.textContent = `${u2.length} stayId uniques (événements communs)`;
  els.table2Uniq.innerHTML = renderIdTable(u2);

  // Build composite keys set from filtered F2
  const set2 = new Set(f2.map(r => compositeKey(r)));

  // Records from F1 that are not present in F2 given the composite key
  const missingRecords = [];
  for (const r of f1) {
    const key = compositeKey(r);
    if (!set2.has(key)) missingRecords.push(r);
  }

  // Unique by stayId; pick first record's details
  const mapByStay = new Map();
  for (const r of missingRecords) {
    const sid = String(r.stayId);
    if (!mapByStay.has(sid)) mapByStay.set(sid, { stayId: sid, eventName: r.eventName, patientOid: r.patientOid });
  }
  const onlyIn1 = Array.from(mapByStay.keys());
  els.cardSynth.hidden = false;
  els.summarySynth.textContent = `${onlyIn1.length} stayId uniques manquants dans F2`;
  synthRecords = Array.from(mapByStay.values());
  els.tableSynth.innerHTML = renderSynthTable(synthRecords);
  synthIds = onlyIn1;
  els.exportSynth.disabled = synthIds.length === 0;

  // Donut percentage: completion = present in both / uniques in F1 (filtered)
  const denom = u1.length || 0;
  const missing = onlyIn1.length;
  const percentComplete = denom ? ((denom - missing) / denom) * 100 : 0;
  renderSynthChart(percentComplete);

  // Build per-eventName stats (within current filters)
  const enKeys = Array.from(new Set(f1.map(r => normEventName(r.eventName)))).sort();
  const statsRows = [];
  for (const en of enKeys) {
    const g1 = f1.filter(r => normEventName(r.eventName) === en);
    const g2 = f2.filter(r => normEventName(r.eventName) === en);
    const label = (g1[0]?.eventName || g2[0]?.eventName || en) + '';
    const uniq1 = unique(g1.map(r => r.stayId));
    const set2En = new Set(g2.map(r => compositeKey(r)));
    const missingEn = unique(g1.filter(r => !set2En.has(compositeKey(r))).map(r => String(r.stayId)));
    const present = Math.max(0, uniq1.length - missingEn.length);
    const percent = uniq1.length ? (present / uniq1.length) * 100 : 0;
    statsRows.push({ eventName: label, totalF1: uniq1.length, present, missing: missingEn.length, percent });
  }
  const statsEl = document.getElementById('tableStats');
  if (statsEl) statsEl.innerHTML = renderStatsTable(statsRows);

  // Collapse two-tables zone once comparison is displayed
  if (els.cardBoth) {
    els.cardBoth.classList.add('collapsed', 'can-toggle');
  }

  // Persist latest state on server
  saveLastState().catch(() => {});
}

els.exportSynth.addEventListener('click', () => {
  if (!synthRecords.length) return;
  const header = ['stayId','eventName','institutionOid','patientOid'];
  const lines = synthRecords.map(r => [r.stayId, r.eventName || '', r.institutionOid || '', r.patientOid || ''].map(csvEscape).join(','));
  const csv = '\uFEFF' + header.join(',') + '\r\n' + lines.join('\r\n');
  downloadCsv(csv, 'synthese_stayId.csv');
});

function csvEscape(v) {
  const s = String(v ?? '');
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadCsv(content, filename) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function renderSynthChart(percent) {
  const p = Math.max(0, Math.min(100, percent));
  const canvas = document.getElementById('donutSynth');
  const label = document.getElementById('donutPercent');
  if (!canvas) return;
  label.textContent = `${p.toFixed(1)}%`;

  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  const cx = w / 2, cy = h / 2;
  const r = Math.min(w, h) / 2 - 8;
  const inner = r - 16;

  // Background ring
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = getCssVar('--md-outline');
  ctx.lineWidth = 14;
  ctx.stroke();

  // Foreground arc (completion percent)
  const start = -Math.PI / 2;
  const sweep = (p / 100) * Math.PI * 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r, start, start + sweep);
  ctx.strokeStyle = getCssVar('--md-success');
  ctx.lineWidth = 14;
  ctx.lineCap = 'round';
  ctx.stroke();

  // Inner fill
  ctx.beginPath();
  ctx.arc(cx, cy, inner, 0, Math.PI * 2);
  ctx.fillStyle = getCssVar('--md-surface-variant');
  ctx.fill();
}

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function renderSynthTable(recs) {
  if (!recs.length) return '<div class="mono" style="color:var(--md-on-surface-variant)">Aucune valeur</div>';
  const rows = recs.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.stayId)}</td>
      <td class="mono">${escapeHtml(r.eventName || '')}</td>
      <td class="mono">${escapeHtml(r.institutionOid || '')}</td>
      <td class="mono">${escapeHtml(r.patientOid || '')}</td>
    </tr>
  `).join('');
  return `
    <table>
      <thead><tr><th>stayId</th><th>eventName</th><th>institutionOid</th><th>patientOid</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

// Legacy version (replaced below). Kept to avoid duplicate declaration.
function renderStatsTableLegacy(rows) {
  if (!rows || !rows.length) return '<div class="mono" style="color:var(--md-on-surface-variant)">Aucune donnée</div>';
  const sorted = rows.slice().sort((a, b) => String(a.eventName).localeCompare(String(b.eventName)));
  const tr = sorted.map(r => `
    <tr>
      <td class="mono">${escapeHtml(r.eventName)}</td>
      <td class="mono" style="text-align:right">${r.totalF1}</td>
      <td class="mono" style="text-align:right">${r.present}</td>
      <td class="mono" style="text-align:right">${r.missing}</td>
      <td class="mono" style="text-align:right">${r.percent.toFixed(1)}%</td>
    </tr>
  `).join('');
  return `
    <table>
      <thead>
        <tr>
          <th>eventName</th>
          <th style="text-align:right">Uniques F1</th>
          <th style="text-align:right">Présents</th>
          <th style="text-align:right">Manquants</th>
          <th style="text-align:right">% Complétude</th>
        </tr>
      </thead>
      <tbody>${tr}</tbody>
    </table>
  `;
}

function renderIdTable(ids) {
  if (!ids.length) return '<div class="mono" style="color:var(--muted)">Aucune valeur</div>';
  const rows = ids.map(x => `<tr><td class="mono">${escapeHtml(x)}</td></tr>`).join('');
  return `
    <table>
      <thead><tr><th>stayId</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function parseFileToStayIds(file) {
  const text = await file.text();
  const trimmed = text.replace(/^\uFEFF/, '').trim();

  // Try JSON array
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed);
    if (!Array.isArray(arr)) throw new Error('JSON non conforme: tableau attendu');
    const { ids, records } = extractFromArray(arr);
    return { ids, records, rawText: text };
  }
  // Try JSON object containing array
  if (trimmed.startsWith('{')) {
    const obj = JSON.parse(trimmed);
    const maybeArr = Array.isArray(obj) ? obj : (Array.isArray(obj.data) ? obj.data : null);
    if (maybeArr) {
      const { ids, records } = extractFromArray(maybeArr);
      return { ids, records, rawText: text };
    }
  }
  // Fallback: CSV
  const rows = parseCsv(trimmed);
  if (!rows.length) return { ids: [] };

  // Direct column stayId / stayID
  const key = pickKey(rows[0] || {}, ['stayId', 'stayID', 'stay_id']);
  if (key) {
    const enKey = pickKey(rows[0] || {}, ['eventName', 'EventName']);
    const etKey = pickKey(rows[0] || {}, ['eventTypeName', 'EventTypeName']);
    const poKey = pickKey(rows[0] || {}, ['patientOid', 'patientOID']);
    const ioKey = pickKey(rows[0] || {}, ['institutionOid', 'InstitutionOid', 'institutionOID']);
    const records = [];
    for (const r of rows) {
      const stayId = String(r[key] ?? '').trim();
      const eventName = String(enKey ? (r[enKey] ?? '') : '').trim();
      const eventTypeName = String(etKey ? (r[etKey] ?? '') : '').trim();
      const patientOid = String(poKey ? (r[poKey] ?? '') : '').trim();
      const institutionOid = String(ioKey ? (r[ioKey] ?? '') : '').trim();
      if (stayId && eventName) {
        records.push({ stayId, eventName, eventTypeName, patientOid, institutionOid });
      }
    }
    const ids = records.map(r => r.stayId);
    return { ids, records, rawText: text };
  }
  // Column with JSON payload
  const jsonCol = pickKey(rows[0] || {}, ['businessContext', 'json', 'payload', 'message']);
  if (jsonCol) {
    const arr = rows.map(r => safeJson(r[jsonCol])).filter(Boolean);
    const { ids, records } = extractFromArray(arr);
    return { ids, records, rawText: text };
  }
  throw new Error('Impossible de trouver la colonne stayId ni un JSON embarqué');
}

// Parse already-loaded text (restored from server)
function parseTextToStayIds(text) {
  const trimmed = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!trimmed) return { ids: [], records: [] };
  if (trimmed.startsWith('[')) {
    const arr = JSON.parse(trimmed);
    const { ids, records } = extractFromArray(arr);
    return { ids, records };
  }
  if (trimmed.startsWith('{')) {
    const obj = JSON.parse(trimmed);
    const maybeArr = Array.isArray(obj) ? obj : (Array.isArray(obj.data) ? obj.data : null);
    if (maybeArr) {
      const { ids, records } = extractFromArray(maybeArr);
      return { ids, records };
    }
  }
  const rows = parseCsv(trimmed);
  if (!rows.length) return { ids: [], records: [] };
  const key = pickKey(rows[0] || {}, ['stayId', 'stayID', 'stay_id']);
  if (key) {
    const enKey = pickKey(rows[0] || {}, ['eventName', 'EventName']);
    const etKey = pickKey(rows[0] || {}, ['eventTypeName', 'EventTypeName']);
    const poKey = pickKey(rows[0] || {}, ['patientOid', 'patientOID']);
    const ioKey = pickKey(rows[0] || {}, ['institutionOid', 'InstitutionOid', 'institutionOID']);
    const records = [];
    for (const r of rows) {
      const stayId = String(r[key] ?? '').trim();
      const eventName = String(enKey ? (r[enKey] ?? '') : '').trim();
      const eventTypeName = String(etKey ? (r[etKey] ?? '') : '').trim();
      const patientOid = String(poKey ? (r[poKey] ?? '') : '').trim();
      const institutionOid = String(ioKey ? (r[ioKey] ?? '') : '').trim();
      if (stayId && eventName) records.push({ stayId, eventName, eventTypeName, patientOid, institutionOid });
    }
    return { ids: records.map(r => r.stayId), records };
  }
  const jsonCol = pickKey(rows[0] || {}, ['businessContext', 'json', 'payload', 'message']);
  if (jsonCol) {
    const arr = rows.map(r => safeJson(r[jsonCol])).filter(Boolean);
    const { ids, records } = extractFromArray(arr);
    return { ids, records };
  }
  return { ids: [], records: [] };
}

async function saveLastState() {
  try {
    const body = {
      files: {},
      filters: { eventName: currentEventFilter, institutionOid: currentInstitutionFilter }
    };
    if (raw1Text) body.files.file1 = { name: name1 || 'file1', content: raw1Text };
    if (raw2Text) body.files.file2 = { name: name2 || 'file2', content: raw2Text };
    if (!body.files.file1 && !body.files.file2) return;
    await fetch('/api/save-state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {}
}

// Restore last state on load
(async function restoreLastState() {
  try {
    const resp = await fetch('/api/last-state');
    if (!resp.ok) return;
    const data = await resp.json();
    const files = data.files || {};
    if (files.file1 && files.file1.content) {
      const { ids, records } = parseTextToStayIds(files.file1.content);
      ids1 = ids; recs1 = records; raw1Text = files.file1.content; name1 = files.file1.name || '';
      const u1 = unique(ids1);
      els.cardBoth.hidden = false;
      els.card1.hidden = false;
      els.summary1.textContent = `${u1.length} stayId uniques`;
      els.table1Uniq.innerHTML = renderIdTable(u1);
      // Populate initial institution list from file1 restore
      const instSet1 = new Set(recs1.map(r => String(r.institutionOid || '').trim()).filter(Boolean));
      populateInstitutionFilter(instSet1);
    }
    if (files.file2 && files.file2.content) {
      const { ids, records } = parseTextToStayIds(files.file2.content);
      ids2 = ids; recs2 = records; raw2Text = files.file2.content; name2 = files.file2.name || '';
      const u2 = unique(ids2);
      els.cardBoth.hidden = false;
      els.card2.hidden = false;
      els.summary2.textContent = `${u2.length} stayId uniques`;
      els.table2Uniq.innerHTML = renderIdTable(u2);
    }
    // restore filters and compute
    if (data.filters) {
      const en = String(data.filters.eventName || '').trim().toLowerCase();
      const io = String(data.filters.institutionOid || '').trim();
      currentEventFilter = en;
      currentInstitutionFilter = io;
    }
    if (recs1.length || recs2.length) {
      recomputeSynth();
    }
  } catch {}
})();

function extractFromArray(arr) {
  const ids = [];
  const records = [];
  for (const it of arr) {
    if (!it || typeof it !== 'object') continue;
    const key = pickKey(it, ['stayId', 'stayID', 'stay_id']);
    const stayId = key && it[key] != null ? String(it[key]).trim() : '';
    const enKey = pickKey(it, ['eventName', 'EventName']);
    const etKey = pickKey(it, ['eventTypeName', 'EventTypeName']);
    const poKey = pickKey(it, ['patientOid', 'patientOID']);
    const ioKey = pickKey(it, ['institutionOid', 'InstitutionOid', 'institutionOID']);
    const eventName = String(enKey && it[enKey] != null ? it[enKey] : '').trim();
    const eventTypeName = String(etKey && it[etKey] != null ? it[etKey] : '').trim();
    const patientOid = String(poKey && it[poKey] != null ? it[poKey] : '').trim();
    const institutionOid = String(ioKey && it[ioKey] != null ? it[ioKey] : '').trim();
    if (stayId && eventName) {
      ids.push(stayId);
      records.push({ stayId, eventName, eventTypeName, patientOid, institutionOid });
    }
  }
  return { ids: ids.filter(Boolean), records };
}

function pickKey(obj, candidates) {
  for (const k of candidates) {
    if (Object.prototype.hasOwnProperty.call(obj, k)) return k;
  }
  return null;
}

function safeJson(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  try { return JSON.parse(s); } catch {}
  // Fallback: try un-doubling quotes if still encoded
  try {
    const repaired = s.replace(/""/g, '"');
    return JSON.parse(repaired);
  } catch {}
  return null;
}

function parseCsv(text) {
  // Basic CSV parser with quotes support
  const lines = text.split(/\r?\n/).filter(l => l.length > 0);
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const row = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = cols[j] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { // escaped quote
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === ',') {
        out.push(cur);
        cur = '';
      } else if (ch === '"') {
        inQuotes = true;
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out.map(s => s.trim());
}

function unique(arr) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function escapeHtml(str) {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function compositeKey(r) {
  const id = String(r.stayId ?? '').trim();
  const en = String(r.eventName ?? '').trim().toLowerCase();
  const et = String(r.eventTypeName ?? '').trim().toLowerCase();
  const io = String(r.institutionOid ?? '').trim().toLowerCase();
  return `${id}|${en}|${et}|${io}`;
}

function normEventName(s) {
  return String(s ?? '').trim().toLowerCase();
}

function populateEventFilter(commonEN) {
  // If empty, clear options
  if (!commonEN || !commonEN.size) {
    els.filterEventName.innerHTML = '<option value="">Tous les eventName (communs)</option>';
    els.filterEventName.value = '';
    currentEventFilter = '';
    return;
  }
  const prev = els.filterEventName.value;
  const options = ['<option value="">Tous les eventName (communs)</option>'];
  const sorted = Array.from(commonEN).sort();
  for (const en of sorted) {
    const selected = (en === prev) ? ' selected' : '';
    options.push(`<option value="${escapeHtml(en)}"${selected}>${escapeHtml(en)}</option>`);
  }
  els.filterEventName.innerHTML = options.join('');
  if (prev && sorted.includes(prev)) {
    els.filterEventName.value = prev;
    currentEventFilter = prev;
  } else if (!sorted.includes(currentEventFilter)) {
    els.filterEventName.value = '';
    currentEventFilter = '';
  }
}

function populateInstitutionFilter(instSet) {
  if (!instSet || instSet.size === 0) {
    els.filterInstitutionOid.innerHTML = '<option value="">Toutes les institutions</option>';
    els.filterInstitutionOid.value = '';
    currentInstitutionFilter = '';
    return;
  }
  const prev = els.filterInstitutionOid.value;
  const options = ['<option value="">Toutes les institutions</option>'];
  const sorted = Array.from(instSet).sort((a, b) => a.localeCompare(b));
  for (const io of sorted) {
    const selected = (io === prev) ? ' selected' : '';
    options.push(`<option value="${escapeHtml(io)}"${selected}>${escapeHtml(io)}</option>`);
  }
  els.filterInstitutionOid.innerHTML = options.join('');
  if (prev && sorted.includes(prev)) {
    els.filterInstitutionOid.value = prev;
    currentInstitutionFilter = prev;
  } else if (!sorted.includes(currentInstitutionFilter)) {
    els.filterInstitutionOid.value = '';
    currentInstitutionFilter = '';
  }
}

// Allow toggling collapsed state by clicking headers
document.getElementById('header1')?.addEventListener('click', () => {
  if (!ids1.length) return;
  els.card1.classList.toggle('collapsed');
});
document.getElementById('header2')?.addEventListener('click', () => {
  if (!ids2.length) return;
  els.card2.classList.toggle('collapsed');
});
document.getElementById('headerBoth')?.addEventListener('click', () => {
  if (!(ids1.length || ids2.length)) return;
  els.cardBoth.classList.toggle('collapsed');
});

// Override stats rendering to show only percentage with a progress bar, sorted by completeness
function renderStatsTable(rows) {
  if (!rows || !rows.length) return '<div class="mono" style="color:var(--md-on-surface-variant)">Aucune donnée</div>';
  const sorted = rows.slice().sort((a, b) => a.percent - b.percent);
  const tr = sorted.map(r => {
    const pct = Math.max(0, Math.min(100, r.percent));
    return `
      <tr>
        <td class="mono label">${escapeHtml(r.eventName)}</td>
        <td style="width:60%">
          <div class="progress" aria-label="${escapeHtml(r.eventName)} complétude">
            <div class="progress-bar" style="width:${pct.toFixed(1)}%"></div>
          </div>
        </td>
        <td class="mono" style="text-align:right; width:80px">${pct.toFixed(1)}%</td>
      </tr>`;
  }).join('');
  return `
    <table class="stats-table">
      <thead>
        <tr>
          <th>eventName</th>
          <th>% Complétude</th>
          <th style="text-align:right"></th>
        </tr>
      </thead>
      <tbody>${tr}</tbody>
    </table>`;
}
