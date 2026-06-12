/* ============================================================
   Hifz Progress — Madrasa Manager (100% offline)
   Vanilla JS · IndexedDB · no external dependencies
   ============================================================ */
"use strict";

/* ================= QURAN ENGINE ================= */
// QURAN, JUZ_STARTS, CHARS_PER_LINE come from quran-data.js (local file)

const FRACTIONS = [
  {v: 0.125, t: "1/8 Juz"}, {v: 0.25, t: "1/4 Juz"}, {v: 0.375, t: "3/8 Juz"},
  {v: 0.5,   t: "1/2 Juz"}, {v: 0.625, t: "5/8 Juz"}, {v: 0.75, t: "3/4 Juz"},
  {v: 0.875, t: "7/8 Juz"}, {v: 1, t: "Full Juz"}
];
function fracLabel(v){
  const f = FRACTIONS.find(f => Math.abs(f.v - v) < 0.001);
  return f ? f.t : (Math.round(v * 100) / 100) + " Juz";
}

function surah(n){ return QURAN[n - 1]; }

// global ordinal of an ayah (1-based across whole Quran)
const SURAH_OFFSET = (() => {
  const off = [0]; let c = 0;
  for (const s of QURAN){ c += s.v.length; off.push(c); }
  return off;
})();
function globalIndex(s, a){ return SURAH_OFFSET[s - 1] + a; }

function juzOf(s, a){
  const g = globalIndex(s, a);
  let j = 1;
  for (let i = 0; i < 30; i++){
    if (g >= globalIndex(JUZ_STARTS[i][0], JUZ_STARTS[i][1])) j = i + 1;
  }
  return j;
}
function juzEndGlobal(j){
  return j === 30 ? SURAH_OFFSET[114]
       : globalIndex(JUZ_STARTS[j][0], JUZ_STARTS[j][1]) - 1;
}

// portion calculation: total ayahs + estimated mushaf lines + texts
function calcPortion(s, a1, a2){
  const sur = surah(s);
  if (!sur || a1 < 1 || a2 > sur.v.length || a1 > a2) return null;
  let chars = 0;
  const texts = [];
  for (let i = a1; i <= a2; i++){
    chars += sur.v[i - 1].length;
    texts.push({n: i, t: sur.v[i - 1]});
  }
  const lines = Math.max(0.5, Math.round((chars / CHARS_PER_LINE) * 2) / 2);
  return {ayahs: a2 - a1 + 1, lines, texts, juz: juzOf(s, a1), juzEndIncluded: globalIndex(s, a2) >= juzEndGlobal(juzOf(s, a2))};
}

/* ================= SMALL HELPERS ================= */
const $  = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const todayStr = () => new Date().toLocaleDateString("en-CA"); // YYYY-MM-DD local
const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString(undefined, {day:"numeric", month:"short", year:"numeric"});
const fmtDateShort = d => new Date(d + "T00:00:00").toLocaleDateString(undefined, {day:"numeric", month:"short"});

let toastTimer;
function toast(msg){
  const t = $("#toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), 2400);
}

/* ================= INDEXEDDB LAYER ================= */
let db;
function openDB(){
  return new Promise((res, rej) => {
    const req = indexedDB.open("hifz_madrasa", 1);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains("students")){
        d.createObjectStore("students", {keyPath: "id", autoIncrement: true});
      }
      if (!d.objectStoreNames.contains("records")){
        const r = d.createObjectStore("records", {keyPath: "id", autoIncrement: true});
        r.createIndex("byStudent", "studentId");
        r.createIndex("byStudentDate", ["studentId", "date"], {unique: true});
        r.createIndex("byDate", "date");
      }
      if (!d.objectStoreNames.contains("settings")){
        d.createObjectStore("settings", {keyPath: "key"});
      }
    };
    req.onsuccess = () => { db = req.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}
function tx(store, mode, fn){
  return new Promise((res, rej) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
    t.onerror = () => rej(t.error);
  });
}
const dbPut = (store, val) => tx(store, "readwrite", s => s.put(val));
const dbDel = (store, key) => tx(store, "readwrite", s => s.delete(key));
function dbAll(store){
  return new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function dbGet(store, key){
  return new Promise((res, rej) => {
    const r = db.transaction(store).objectStore(store).get(key);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
function recordsOf(studentId){
  return new Promise((res, rej) => {
    const r = db.transaction("records").objectStore("records").index("byStudent").getAll(studentId);
    r.onsuccess = () => res(r.result.sort((a, b) => a.date < b.date ? -1 : 1));
    r.onerror = () => rej(r.error);
  });
}
function recordOf(studentId, date){
  return new Promise((res, rej) => {
    const r = db.transaction("records").objectStore("records").index("byStudentDate").get([studentId, date]);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function getSetting(key, def){
  const v = await dbGet("settings", key);
  return v ? v.value : def;
}
const setSetting = (key, value) => dbPut("settings", {key, value});

/* ================= RECORD AGGREGATION ================= */
function summarize(records){
  const sum = {
    lines: 0, ayahs: 0, sabaqDays: 0, sabaqMissed: 0,
    sabaqi: 0, sabaqiDays: 0, sabaqiMissed: 0,
    manzil: 0, manzilDays: 0, manzilMissed: 0,
    present: 0, absent: 0, leave: 0, sick: 0, total: records.length,
    juzCompleted: [], juzTouched: new Set()
  };
  for (const r of records){
    sum[r.attendance] = (sum[r.attendance] || 0) + 1;
    if (r.sabaq){
      if (r.sabaq.status === "completed"){
        sum.sabaqDays++;
        sum.lines += r.sabaq.estLines || 0;
        sum.ayahs += r.sabaq.ayahs || 0;
        if (r.sabaq.mode === "portion"){
          sum.juzTouched.add(juzOf(r.sabaq.surah, r.sabaq.fromAyah));
          const p = calcPortion(r.sabaq.surah, r.sabaq.fromAyah, r.sabaq.toAyah);
          if (p && p.juzEndIncluded) sum.juzCompleted.push({juz: juzOf(r.sabaq.surah, r.sabaq.toAyah), date: r.date});
        }
      } else if (r.sabaq.status === "missed") sum.sabaqMissed++;
    }
    if (r.sabaqi){
      if (r.sabaqi.status === "completed"){ sum.sabaqiDays++; sum.sabaqi += r.sabaqi.amount || 0; }
      else if (r.sabaqi.status === "missed") sum.sabaqiMissed++;
    }
    if (r.manzil){
      if (r.manzil.status === "completed"){
        sum.manzilDays++;
        for (const it of (r.manzil.items || [])) sum.manzil += it.amount || 0;
      } else if (r.manzil.status === "missed") sum.manzilMissed++;
    }
  }
  sum.attendancePct = sum.total ? Math.round((sum.present / sum.total) * 100) : 0;
  return sum;
}
function lastSabaqPortion(records){
  for (let i = records.length - 1; i >= 0; i--){
    const s = records[i].sabaq;
    if (s && s.status === "completed" && s.mode === "portion") return {...s, date: records[i].date};
  }
  return null;
}

/* ================= STATE & ROUTER ================= */
const state = {view: "dashboard", studentId: null, search: "", juzFilter: ""};
let SETTINGS = {madrasa: "", teacher: ""};

function nav(view, extra = {}){
  Object.assign(state, {view}, extra);
  render();
  window.scrollTo({top: 0});
}
function setTab(name){
  $$("#mainTabs .tab").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
}

async function render(){
  const app = $("#app");
  app.innerHTML = "";
  if (state.view === "dashboard"){ setTab("dashboard"); await renderDashboard(app); }
  else if (state.view === "profile"){ setTab("dashboard"); await renderProfile(app); }
  else if (state.view === "entry"){ setTab("dashboard"); await renderEntry(app); }
  else if (state.view === "analytics"){ setTab("analytics"); await renderAnalytics(app); }
  else if (state.view === "settings"){ setTab("settings"); await renderSettings(app); }
}

/* ================= DASHBOARD ================= */
const ICONS = {
  students: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.7-3.2 3.2-5 6.2-5s5.5 1.8 6.2 5"/><circle cx="17" cy="9.5" r="2.6"/><path d="M16 14.8c2.6.1 4.5 1.6 5.2 4.2"/></svg>',
  present: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M8 12.3l2.6 2.7L16 9.5"/></svg>',
  absent: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/></svg>',
  book: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 6c-1.8-1.6-4.4-2-8-2v14c3.6 0 6.2.4 8 2 1.8-1.6 4.4-2 8-2V4c-3.6 0-6.2.4-8 2zM12 6v14"/></svg>',
  cal: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v3.5M16 3v3.5"/></svg>'
};
function statCard(icon, num, label, tone = ""){
  return `<div class="stat"><div class="ic ${tone}">${ICONS[icon]}</div>
    <div><div class="num ${tone === "gold" ? "gold" : ""}">${num}</div><div class="lbl">${label}</div></div></div>`;
}
function juzSpine(currentJuz, big = false){
  let cells = "";
  for (let i = 1; i <= 30; i++){
    cells += `<span class="${i < currentJuz ? "done" : i === currentJuz ? "now" : ""}" title="Juz ${i}"></span>`;
  }
  return `<div class="juz-spine${big ? " big" : ""}" role="img" aria-label="Juz ${currentJuz} of 30">${cells}</div>`;
}
function attChip(sum){
  if (!sum.total) return `<span class="chip mut">New student</span>`;
  const p = sum.attendancePct;
  return `<span class="chip ${p >= 85 ? "ok" : p >= 65 ? "mid" : "bad"}">${p}% attendance</span>`;
}

async function renderDashboard(app){
  const students = await dbAll("students");
  const allRecords = await dbAll("records");
  const recBy = {};
  for (const r of allRecords) (recBy[r.studentId] = recBy[r.studentId] || []).push(r);
  for (const k in recBy) recBy[k].sort((a, b) => a.date < b.date ? -1 : 1);

  const today = todayStr();
  const todayRecs = allRecords.filter(r => r.date === today);
  const presentToday = todayRecs.filter(r => r.attendance === "present").length;
  const absentToday = todayRecs.filter(r => r.attendance !== "present").length;
  const weekAgo = new Date(Date.now() - 6 * 864e5).toLocaleDateString("en-CA");
  const monthKey = today.slice(0, 7);
  let weekLines = 0, monthLines = 0;
  for (const r of allRecords){
    if (r.sabaq?.status === "completed"){
      if (r.date >= weekAgo) weekLines += r.sabaq.estLines || 0;
      if (r.date.startsWith(monthKey)) monthLines += r.sabaq.estLines || 0;
    }
  }

  const filtered = students.filter(st => {
    const q = state.search.toLowerCase();
    const okQ = !q || st.name.toLowerCase().includes(q) || (st.parentName || "").toLowerCase().includes(q) || (st.parentPhone || "").includes(q);
    const okJ = !state.juzFilter || st.currentJuz == state.juzFilter;
    return okQ && okJ;
  }).sort((a, b) => a.name.localeCompare(b.name));

  const greeting = new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening";

  app.innerHTML = `
    <div class="hero">
      <div class="arabic">السَّلَامُ عَلَيْكُمْ وَرَحْمَةُ اللهِ</div>
      <h1>${greeting}${SETTINGS.teacher ? ", " + esc(SETTINGS.teacher) : ""}</h1>
      <p>${fmtDate(today)} &nbsp;·&nbsp; ${students.length} student${students.length === 1 ? "" : "s"} enrolled &nbsp;·&nbsp; ${presentToday} marked present today</p>
      <div class="hero-actions"><button class="btn gold" id="addStudentBtn">+ Add Student</button></div>
    </div>

    <div class="grid-stats">
      ${statCard("students", students.length, "Total students")}
      ${statCard("present", presentToday, "Present today")}
      ${statCard("absent", absentToday, "Absent / leave today", "red")}
      ${statCard("book", Math.round(weekLines * 10) / 10, "Lines this week", "gold")}
      ${statCard("cal", Math.round(monthLines * 10) / 10, "Lines this month", "gold")}
    </div>

    <div class="row spread" style="margin-bottom:14px">
      <input class="search-input" id="searchBox" placeholder="Search by name, parent or phone…" value="${esc(state.search)}">
      <select id="juzFilter" class="search-input" style="flex:0 0 150px">
        <option value="">All Juz</option>
        ${Array.from({length: 30}, (_, i) => `<option value="${i + 1}" ${state.juzFilter == i + 1 ? "selected" : ""}>Juz ${i + 1}</option>`).join("")}
      </select>
    </div>

    ${filtered.length ? `<div class="students-grid">${filtered.map(st => {
      const sum = summarize(recBy[st.id] || []);
      const juz = st.currentJuz || 1;
      const pct = Math.round(((juz - 1) / 30) * 100);
      return `
      <div class="student-card" data-id="${st.id}">
        <div class="sc-top" data-act="open">
          <div class="avatar-lg">${esc((st.name[0] || "?").toUpperCase())}</div>
          <div style="min-width:0">
            <div class="sc-name">${esc(st.name)} ${st.arabicName ? `<span class="arabic">${esc(st.arabicName)}</span>` : ""}</div>
            <div class="sc-meta">Age ${esc(st.age || "—")} · <a href="tel:${esc(st.parentPhone || "")}" onclick="event.stopPropagation()" title="Call ${esc(st.parentName || "parent")}">${esc(st.parentName || "—")}</a></div>
          </div>
          <span class="badge-juz">Juz ${juz}</span>
        </div>
        <div>
          <div class="bar"><span style="width:${Math.max(pct, 2)}%"></span></div>
          <div class="sc-progress-row"><span>${pct}% of Quran (${juz - 1}/30 juz)</span>${attChip(sum)}</div>
        </div>
        <div class="sc-actions">
          <button class="btn sm gold" data-act="entry">+ Progress</button>
          <button class="btn sm ghost" data-act="open">Profile</button>
          <button class="btn sm ghost sc-menu-btn" data-act="menu" aria-label="More options" title="More options">⋮</button>
        </div>
        <div class="sc-menu" hidden>
          <button data-act="weekly">Weekly report</button>
          <button data-act="monthly">Monthly report</button>
          <button data-act="edit">Edit student</button>
          <button data-act="del" class="del">Delete student</button>
        </div>
      </div>`;
    }).join("")}</div>`
    : `<div class="card"><div class="empty">
        <span class="arabic">وَلَقَدْ يَسَّرْنَا الْقُرْآنَ لِلذِّكْرِ</span>
        ${students.length ? "No students match your search." : "No students yet. Tap <b>+ Add Student</b> above to begin."}
      </div></div>`}`;

  $("#searchBox").addEventListener("input", e => {
    state.search = e.target.value;
    render();
    requestAnimationFrame(() => { const b = $("#searchBox"); b.focus(); b.setSelectionRange(b.value.length, b.value.length); });
  });
  $("#juzFilter").addEventListener("change", e => { state.juzFilter = e.target.value; render(); });
  $("#addStudentBtn").addEventListener("click", () => studentForm());

  $$(".student-card", app).forEach(card => {
    const id = Number(card.dataset.id);
    card.addEventListener("click", async e => {
      const act = e.target.closest("[data-act]")?.dataset.act;
      if (!act) return;
      if (act === "menu"){
        const menu = $(".sc-menu", card);
        const open = menu.hidden;
        $$(".sc-menu", app).forEach(m => m.hidden = true);
        menu.hidden = !open;
        if (open){
          // first click outside (or on a menu item) closes it again
          setTimeout(() => document.addEventListener("click", () => { menu.hidden = true; }, {once: true}), 0);
        }
        return;
      }
      if (act === "open") nav("profile", {studentId: id});
      else if (act === "entry") nav("entry", {studentId: id, entryDate: todayStr()});
      else if (act === "edit") studentForm(await dbGet("students", id));
      else if (act === "weekly") reportDialog("weekly", id);
      else if (act === "monthly") reportDialog("monthly", id);
      else if (act === "del"){
        const st = await dbGet("students", id);
        if (confirm(`Delete ${st.name} and ALL of their progress records? This cannot be undone.`)){
          const recs = await recordsOf(id);
          for (const r of recs) await dbDel("records", r.id);
          await dbDel("students", id);
          toast("Student deleted");
          render();
        }
      }
    });
  });
}
/* ================= STUDENT FORM (add / edit) ================= */
function studentForm(st = null){
  const isEdit = !!st;
  st = st || {name:"", arabicName:"", age:"", parentName:"", parentPhone:"", address:"",
              admissionDate: todayStr(), currentJuz: 1, currentSurah: 1, notes:""};
  openModal(`
    <h2>${isEdit ? "Edit Student" : "Add Student"}</h2>
    <div class="form-grid">
      <div class="field"><label>Student Name *</label><input id="f_name" value="${esc(st.name)}" required></div>
      <div class="field"><label>Arabic Name (optional)</label><input id="f_ar" class="arabic" dir="rtl" value="${esc(st.arabicName)}"></div>
      <div class="field"><label>Age</label><input id="f_age" type="number" min="3" max="60" value="${esc(st.age)}"></div>
      <div class="field"><label>Parent Name</label><input id="f_parent" value="${esc(st.parentName)}"></div>
      <div class="field"><label>Parent Contact Number</label><input id="f_phone" type="tel" value="${esc(st.parentPhone)}"></div>
      <div class="field"><label>Admission Date</label><input id="f_adm" type="date" value="${esc(st.admissionDate)}"></div>
      <div class="field"><label>Current Juz</label>
        <select id="f_juz">${Array.from({length:30},(_,i)=>`<option value="${i+1}" ${st.currentJuz==i+1?"selected":""}>Juz ${i+1}</option>`).join("")}</select>
      </div>
      <div class="field"><label>Current Surah</label>
        <select id="f_surah">${QURAN.map(s=>`<option value="${s.n}" ${st.currentSurah==s.n?"selected":""}>${s.n}. ${esc(s.en)} — ${esc(s.ar)}</option>`).join("")}</select>
      </div>
    </div>
    <div class="field"><label>Address</label><input id="f_addr" value="${esc(st.address)}"></div>
    <div class="field"><label>Notes</label><textarea id="f_notes">${esc(st.notes)}</textarea></div>
    <div class="row" style="justify-content:flex-end">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn gold" id="saveStudent">${isEdit ? "Save Changes" : "Add Student"}</button>
    </div>
  `);
  $("#saveStudent").addEventListener("click", async () => {
    const name = $("#f_name").value.trim();
    if (!name){ toast("Student name is required"); return; }
    const data = {
      ...(isEdit ? {id: st.id} : {}),
      name, arabicName: $("#f_ar").value.trim(), age: $("#f_age").value,
      parentName: $("#f_parent").value.trim(), parentPhone: $("#f_phone").value.trim(),
      address: $("#f_addr").value.trim(), admissionDate: $("#f_adm").value || todayStr(),
      currentJuz: Number($("#f_juz").value), currentSurah: Number($("#f_surah").value),
      notes: $("#f_notes").value.trim()
    };
    await dbPut("students", data);
    closeModal();
    toast(isEdit ? "Student updated" : "Student added");
    render();
  });
}

function openModal(html){
  $("#modalRoot").innerHTML = `<div class="modal-back"><div class="modal">${html}</div></div>`;
  $(".modal-back").addEventListener("click", e => {
    if (e.target.classList.contains("modal-back") || e.target.closest("[data-close]")) closeModal();
  });
}
function closeModal(){ $("#modalRoot").innerHTML = ""; }

/* ================= STUDENT PROFILE ================= */
function ring(pct, color, size = 86, label = ""){
  const stroke = 9, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const off = c * (1 - Math.min(pct, 100) / 100);
  return `<div class="ring-box">
    <svg class="ring" width="${size}" height="${size}">
      <circle class="track" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${stroke}"/>
      <circle class="meter" cx="${size/2}" cy="${size/2}" r="${r}" stroke-width="${stroke}"
        stroke="${color}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"/>
    </svg>
    <div class="ring-center">${label || Math.round(pct) + "%"}</div>
  </div>`;
}
function describeRecord(r){
  const parts = [];
  const att = {present:"Present", absent:"Absent", leave:"Leave", sick:"Sick"}[r.attendance];
  parts.push(att);
  if (r.sabaq && r.sabaq.status === "completed"){
    if (r.sabaq.mode === "portion"){
      const s = surah(r.sabaq.surah);
      parts.push(`Sabaq: ${s.en} ${r.sabaq.fromAyah}–${r.sabaq.toAyah} (${r.sabaq.ayahs} ayahs, ~${r.sabaq.estLines} lines)`);
    } else parts.push(`Sabaq: ${r.sabaq.estLines} lines`);
  } else if (r.sabaq && r.sabaq.status === "missed") parts.push("Sabaq missed");
  if (r.sabaqi && r.sabaqi.status === "completed") parts.push(`Sabaqi: Juz ${r.sabaqi.juz} · ${fracLabel(r.sabaqi.amount)}`);
  else if (r.sabaqi && r.sabaqi.status === "missed") parts.push("Sabaqi missed");
  if (r.manzil && r.manzil.status === "completed" && r.manzil.items?.length)
    parts.push("Manzil: " + r.manzil.items.map(it => `Juz ${it.juz} ${fracLabel(it.amount)}`).join(", "));
  else if (r.manzil && r.manzil.status === "missed") parts.push("Manzil missed");
  if (r.notes) parts.push(`Note: ${r.notes}`);
  return parts.join(" · ");
}

async function renderProfile(app){
  const st = await dbGet("students", state.studentId);
  if (!st){ nav("dashboard"); return; }
  const records = await recordsOf(st.id);
  const sum = summarize(records);
  const last = lastSabaqPortion(records);
  const juz = st.currentJuz || 1;
  const quranPct = ((juz - 1) / 30) * 100;

  const days = [], dayVals = [];
  for (let i = 6; i >= 0; i--){
    const d = new Date(Date.now() - i * 864e5).toLocaleDateString("en-CA");
    days.push(fmtDateShort(d));
    const r = records.find(x => x.date === d);
    dayVals.push(r && r.sabaq?.status === "completed" ? (r.sabaq.estLines || 0) : 0);
  }
  const months = [], monthVals = [];
  for (let i = 5; i >= 0; i--){
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i);
    const key = d.toLocaleDateString("en-CA").slice(0, 7);
    months.push(d.toLocaleDateString(undefined, {month:"short"}));
    monthVals.push(records.filter(r => r.date.startsWith(key) && r.sabaq?.status === "completed")
                          .reduce((a, r) => a + (r.sabaq.estLines || 0), 0));
  }

  app.innerHTML = `
    <button class="back-link" id="backBtn">‹ All students</button>
    <div class="row spread" style="align-items:flex-start;margin-bottom:16px">
      <div class="row" style="gap:14px">
        <div class="avatar-lg" style="width:62px;height:62px;font-size:1.5rem">${esc((st.name[0] || "?").toUpperCase())}</div>
        <div>
          <h1 class="page-title" style="margin:0">${esc(st.name)} ${st.arabicName ? `<span class="arabic" style="font-size:1.05rem;color:var(--ink-soft)">${esc(st.arabicName)}</span>` : ""}</h1>
          <p class="page-sub" style="margin:0">Admitted ${fmtDate(st.admissionDate)} · Age ${esc(st.age || "—")} · <span class="badge-juz" style="margin:0">Juz ${juz}</span></p>
        </div>
      </div>
      <div class="row">
        <button class="btn gold" id="goEntry">+ Daily Progress</button>
        <button class="btn ghost" id="goWeekly">Weekly Report</button>
        <button class="btn ghost" id="goMonthly">Monthly Report</button>
        <button class="btn ghost" id="goEdit">Edit</button>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:14px">
      <div class="card ring-card">
        ${ring(quranPct, "var(--gold)")}
        <div><div class="ring-num">${juz - 1} of 30 juz</div><div class="ring-lbl">Quran completed</div></div>
      </div>
      <div class="card ring-card">
        ${ring(sum.attendancePct, "var(--emerald)")}
        <div><div class="ring-num">${sum.present} / ${sum.total} days</div><div class="ring-lbl">Attendance</div></div>
      </div>
    </div>

    <div class="card" style="margin-bottom:14px">
      <h3>Hifz journey <span class="sub">each segment is one juz</span></h3>
      ${juzSpine(juz, true)}
      <div class="spine-legend">
        <span><i style="background:var(--gold)"></i>Completed (${juz - 1})</span>
        <span><i style="background:var(--emerald)"></i>Current juz</span>
        <span><i style="background:var(--line)"></i>Remaining</span>
      </div>
      ${last ? `<div class="hint" style="margin-top:13px">
        <b>Stopped at:</b> ${esc(surah(last.surah).en)} (<span class="arabic">${esc(surah(last.surah).ar)}</span>) ayah ${last.toAyah} on ${fmtDateShort(last.date)} —
        <b>continues from ayah ${last.toAyah < surah(last.surah).v.length ? last.toAyah + 1 : "1 of next surah"}</b>
      </div>` : ""}
    </div>

    <div class="grid-stats">
      ${statCard("book", Math.round(sum.lines * 10) / 10, "Lines memorized", "gold")}
      ${statCard("book", sum.ayahs, "Ayahs memorized", "gold")}
      ${statCard("cal", Math.round(sum.sabaqi * 100) / 100, "Sabaqi · juz revised")}
      ${statCard("cal", Math.round(sum.manzil * 100) / 100, "Manzil · juz revised")}
    </div>

    <div class="grid grid-2" style="margin-bottom:14px">
      <div class="card"><h3>This week <span class="sub">lines per day</span></h3><div class="chart-wrap">${barChart(dayVals, days)}</div></div>
      <div class="card"><h3>Last 6 months <span class="sub">lines</span></h3><div class="chart-wrap">${barChart(monthVals, months, true)}</div></div>
    </div>

    <div class="grid grid-2">
      <div class="card">
        <h3>Personal information</h3>
        <table class="tbl">
          <tr><td>Parent</td><td>${esc(st.parentName || "—")}</td></tr>
          <tr><td>Contact</td><td><a href="tel:${esc(st.parentPhone)}">${esc(st.parentPhone || "—")}</a></td></tr>
          <tr><td>Address</td><td>${esc(st.address || "—")}</td></tr>
          <tr><td>Current surah</td><td>${esc(surah(st.currentSurah || 1).en)} — <span class="arabic">${esc(surah(st.currentSurah || 1).ar)}</span></td></tr>
          <tr><td>Attendance detail</td><td>${sum.present} present · ${sum.absent} absent · ${sum.leave} leave · ${sum.sick} sick</td></tr>
          <tr><td>Notes</td><td>${esc(st.notes || "—")}</td></tr>
        </table>
      </div>
      <div class="card">
        <h3>Recent activity</h3>
        ${records.length ? `<ul class="timeline">${records.slice(-8).reverse().map(r => `
          <li><div class="t-date">${fmtDate(r.date)}</div><div class="t-body">${esc(describeRecord(r))}</div></li>`).join("")}</ul>`
        : `<div class="empty">No records yet — start with <b>+ Daily Progress</b>.</div>`}
      </div>
    </div>`;

  $("#backBtn").addEventListener("click", () => nav("dashboard"));
  $("#goEntry").addEventListener("click", () => nav("entry", {studentId: st.id, entryDate: todayStr()}));
  $("#goEdit").addEventListener("click", () => studentForm(st));
  $("#goWeekly").addEventListener("click", () => reportDialog("weekly", st.id));
  $("#goMonthly").addEventListener("click", () => reportDialog("monthly", st.id));
}

/* ================= DAILY PROGRESS ENTRY ================= */
async function renderEntry(app){
  const st = await dbGet("students", state.studentId);
  if (!st){ nav("dashboard"); return; }
  const records = await recordsOf(st.id);
  const last = lastSabaqPortion(records);
  const date = state.entryDate || todayStr();
  const existing = await recordOf(st.id, date);

  // editable working copy
  const rec = existing ? JSON.parse(JSON.stringify(existing)) : {
    studentId: st.id, date, attendance: "present",
    sabaq: {status: "completed", mode: "portion", surah: last ? last.surah : (st.currentSurah || 1),
            fromAyah: last ? Math.min(last.toAyah + 1, surah(last.surah).v.length) : 1,
            toAyah: last ? Math.min(last.toAyah + 1, surah(last.surah).v.length) : 1, lines: "", ayahs: 0, estLines: 0},
    sabaqi: {status: "completed", juz: st.currentJuz || 1, amount: 0.25},
    manzil: {status: "completed", items: [{juz: Math.max(1, (st.currentJuz || 1) - 1), amount: 0.5}]},
    notes: ""
  };
  if (!rec.sabaq) rec.sabaq = {status:"none", mode:"portion", surah:1, fromAyah:1, toAyah:1};
  if (!rec.sabaqi) rec.sabaqi = {status:"none", juz: st.currentJuz || 1, amount: 0.25};
  if (!rec.manzil) rec.manzil = {status:"none", items: []};

  const statusSeg = (sec, current) => `
    <div class="seg section-status" data-sec="${sec}">
      <button data-v="completed" class="${current === "completed" ? "active" : ""}">Completed</button>
      <button data-v="missed" class="${current === "missed" ? "active missed" : ""}">Missed</button>
      <button data-v="none" class="${current === "none" ? "active" : ""}">Not assigned</button>
    </div>`;

  app.innerHTML = `
    <button class="back-link" id="backBtn">‹ ${esc(st.name)}</button>
    <h1 class="page-title">Daily Progress — ${esc(st.name)}</h1>
    <p class="page-sub">${existing ? "Editing existing record for this date." : "New record."} All data is saved on this device.</p>

    ${last ? `<div class="hint"><b>Last sabaq:</b> ${esc(surah(last.surah).en)} ayah ${last.fromAyah}–${last.toAyah} (${fmtDateShort(last.date)}). Continue from ayah ${last.toAyah + 1 <= surah(last.surah).v.length ? last.toAyah + 1 : "next surah"}.</div>` : ""}

    <div class="card" style="margin-bottom:12px">
      <div class="row spread">
        <div class="field" style="margin:0"><label>Date</label><input type="date" id="recDate" value="${date}" max="${todayStr()}"></div>
        <div>
          <label style="font-size:.8rem;font-weight:600;color:var(--ink-soft);display:block;margin-bottom:4px">Attendance</label>
          <div class="seg" id="attSeg">
            ${["present","absent","leave","sick"].map(a => `<button data-v="${a}" class="${rec.attendance === a ? "active" + (a === "absent" ? " absent" : "") : ""}">${a[0].toUpperCase() + a.slice(1)}</button>`).join("")}
          </div>
        </div>
      </div>
    </div>

    <div id="lessonArea">
    <div class="card lesson-card">
      <div class="row spread"><h3>New Lesson — Sabaq</h3>${statusSeg("sabaq", rec.sabaq.status)}</div>
      <div data-body="sabaq" ${rec.sabaq.status !== "completed" ? 'style="display:none"' : ""}>
        <div class="seg" id="sabaqMode" style="margin:8px 0">
          <button data-v="portion" class="${rec.sabaq.mode === "portion" ? "active" : ""}">Select Quran portion</button>
          <button data-v="lines" class="${rec.sabaq.mode === "lines" ? "active" : ""}">Enter lines only</button>
        </div>
        <div id="portionBox" ${rec.sabaq.mode !== "portion" ? 'style="display:none"' : ""}>
          <div class="field"><label>Search & select surah</label>
            <input id="surahSearch" placeholder="Type to search surah… e.g. Baqarah" autocomplete="off">
            <select id="selSurah" size="1" style="margin-top:6px;width:100%;padding:10px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2)"></select>
          </div>
          <div class="row">
            <div class="field" style="flex:1"><label>Starting ayah</label><select id="selFrom"></select></div>
            <div class="field" style="flex:1"><label>Ending ayah</label><select id="selTo"></select></div>
          </div>
          <div class="calc-line" id="calcLine"></div>
          <div class="quran-preview arabic" id="quranPreview"></div>
        </div>
        <div id="linesBox" ${rec.sabaq.mode !== "lines" ? 'style="display:none"' : ""}>
          <div class="field"><label>Number of new lines memorized today</label>
            <input id="sabaqLines" type="number" min="0" step="0.5" value="${rec.sabaq.mode === "lines" ? esc(rec.sabaq.lines || rec.sabaq.estLines || "") : ""}">
          </div>
        </div>
      </div>
    </div>

    <div class="card lesson-card">
      <div class="row spread"><h3>Current Juz Revision — Sabaqi</h3>${statusSeg("sabaqi", rec.sabaqi.status)}</div>
      <div data-body="sabaqi" ${rec.sabaqi.status !== "completed" ? 'style="display:none"' : ""}>
        <div class="row" style="margin-top:8px">
          <div class="field" style="flex:1"><label>Juz number</label>
            <select id="sabaqiJuz">${Array.from({length:30},(_,i)=>`<option value="${i+1}" ${rec.sabaqi.juz==i+1?"selected":""}>Juz ${i+1}</option>`).join("")}</select>
          </div>
          <div class="field" style="flex:1"><label>Amount revised</label>
            <select id="sabaqiAmt">${FRACTIONS.map(f=>`<option value="${f.v}" ${Math.abs(rec.sabaqi.amount-f.v)<.001?"selected":""}>${f.t}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field"><label>Portion note (optional, e.g. "first half" or "page 2–6")</label>
          <input id="sabaqiNote" value="${esc(rec.sabaqi.note || "")}">
        </div>
      </div>
    </div>

    <div class="card lesson-card">
      <div class="row spread"><h3>Old Juz Revision — Manzil</h3>${statusSeg("manzil", rec.manzil.status)}</div>
      <div data-body="manzil" ${rec.manzil.status !== "completed" ? 'style="display:none"' : ""}>
        <div id="manzilItems" style="margin-top:8px"></div>
        <button class="btn sm ghost" id="addManzil">+ Add another juz</button>
      </div>
    </div>
    </div>

    <div class="card">
      <div class="field"><label>Teacher notes for today</label><textarea id="recNotes">${esc(rec.notes || "")}</textarea></div>
      <div class="row" style="justify-content:flex-end">
        ${existing ? `<button class="btn ghost" id="delRecord" style="color:var(--danger)">Delete record</button>` : ""}
        <button class="btn gold" id="saveRecord">Save Day</button>
      </div>
    </div>`;

  /* ---- wire up ---- */
  $("#backBtn").addEventListener("click", () => nav("profile", {studentId: st.id}));
  $("#recDate").addEventListener("change", e => nav("entry", {studentId: st.id, entryDate: e.target.value}));

  $("#attSeg").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    rec.attendance = b.dataset.v;
    $$("#attSeg button").forEach(x => x.className = x === b ? "active" + (b.dataset.v === "absent" ? " absent" : "") : "");
    if (rec.attendance !== "present"){
      // absent / leave / sick: lessons default to missed
      ["sabaq","sabaqi","manzil"].forEach(sec => { if (rec[sec].status === "completed") setSecStatus(sec, "missed"); });
    }
  });

  function setSecStatus(sec, v){
    rec[sec].status = v;
    const segEl = $(`.section-status[data-sec="${sec}"]`);
    $$("button", segEl).forEach(b => b.className = b.dataset.v === v ? "active" + (v === "missed" ? " missed" : "") : "");
    $(`[data-body="${sec}"]`).style.display = v === "completed" ? "" : "none";
  }
  $$(".section-status").forEach(seg => seg.addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    setSecStatus(seg.dataset.sec, b.dataset.v);
  }));

  $("#sabaqMode").addEventListener("click", e => {
    const b = e.target.closest("button"); if (!b) return;
    rec.sabaq.mode = b.dataset.v;
    $$("#sabaqMode button").forEach(x => x.classList.toggle("active", x === b));
    $("#portionBox").style.display = rec.sabaq.mode === "portion" ? "" : "none";
    $("#linesBox").style.display = rec.sabaq.mode === "lines" ? "" : "none";
  });

  /* surah picker with search */
  function fillSurahSelect(filter = ""){
    const q = filter.toLowerCase();
    const list = QURAN.filter(s => !q || s.en.toLowerCase().includes(q) || s.ar.includes(filter) || String(s.n) === q);
    $("#selSurah").innerHTML = list.map(s => `<option value="${s.n}" ${rec.sabaq.surah == s.n ? "selected" : ""}>${s.n}. ${esc(s.en)} — ${esc(s.ar)} (${s.v.length} ayahs)</option>`).join("");
    if (list.length && !list.some(s => s.n == rec.sabaq.surah)){ rec.sabaq.surah = list[0].n; fillAyahSelects(true); }
  }
  function fillAyahSelects(reset){
    const sur = surah(rec.sabaq.surah);
    if (reset){ rec.sabaq.fromAyah = 1; rec.sabaq.toAyah = 1; }
    rec.sabaq.fromAyah = Math.min(rec.sabaq.fromAyah || 1, sur.v.length);
    rec.sabaq.toAyah = Math.min(Math.max(rec.sabaq.toAyah || 1, rec.sabaq.fromAyah), sur.v.length);
    const opts = sel => Array.from({length: sur.v.length}, (_, i) => `<option value="${i+1}" ${sel === i+1 ? "selected" : ""}>Ayah ${i+1}</option>`).join("");
    $("#selFrom").innerHTML = opts(rec.sabaq.fromAyah);
    $("#selTo").innerHTML = opts(rec.sabaq.toAyah);
    updatePortion();
  }
  function updatePortion(){
    const p = calcPortion(rec.sabaq.surah, rec.sabaq.fromAyah, rec.sabaq.toAyah);
    if (!p) return;
    rec.sabaq.ayahs = p.ayahs;
    rec.sabaq.estLines = p.lines;
    $("#calcLine").innerHTML = `Total ayahs: <b>${p.ayahs}</b> · Estimated lines: <b>~${p.lines}</b> · Juz <b>${p.juz}</b>${p.juzEndIncluded ? ' · <b style="color:var(--gold)">reaches end of juz ✦</b>' : ""}`;
    $("#quranPreview").innerHTML = p.texts.map(v => `${esc(v.t)}<span class="vnum">${v.n}</span>`).join(" ");
  }
  if (rec.sabaq.mode !== "lines" || true){ fillSurahSelect(); fillAyahSelects(false); }
  $("#surahSearch").addEventListener("input", e => fillSurahSelect(e.target.value));
  $("#selSurah").addEventListener("change", e => { rec.sabaq.surah = Number(e.target.value); fillAyahSelects(true); });
  $("#selFrom").addEventListener("change", e => {
    rec.sabaq.fromAyah = Number(e.target.value);
    if (rec.sabaq.toAyah < rec.sabaq.fromAyah) rec.sabaq.toAyah = rec.sabaq.fromAyah;
    fillAyahSelects(false);
  });
  $("#selTo").addEventListener("change", e => {
    rec.sabaq.toAyah = Number(e.target.value);
    if (rec.sabaq.toAyah < rec.sabaq.fromAyah){ rec.sabaq.fromAyah = rec.sabaq.toAyah; }
    fillAyahSelects(false);
  });

  /* manzil items */
  function drawManzil(){
    $("#manzilItems").innerHTML = rec.manzil.items.map((it, i) => `
      <div class="manzil-item" data-i="${i}">
        <div class="field"><label>Juz revised</label>
          <select data-f="juz">${Array.from({length:30},(_,j)=>`<option value="${j+1}" ${it.juz==j+1?"selected":""}>Juz ${j+1}</option>`).join("")}</select></div>
        <div class="field"><label>Amount</label>
          <select data-f="amount">${FRACTIONS.map(f=>`<option value="${f.v}" ${Math.abs(it.amount-f.v)<.001?"selected":""}>${f.t}</option>`).join("")}</select></div>
        <button class="btn sm ghost" data-f="rm" style="color:var(--danger)">✕</button>
      </div>`).join("");
  }
  drawManzil();
  $("#manzilItems").addEventListener("change", e => {
    const item = e.target.closest(".manzil-item"); if (!item) return;
    const it = rec.manzil.items[Number(item.dataset.i)];
    if (e.target.dataset.f === "juz") it.juz = Number(e.target.value);
    if (e.target.dataset.f === "amount") it.amount = Number(e.target.value);
  });
  $("#manzilItems").addEventListener("click", e => {
    if (e.target.dataset.f === "rm"){
      rec.manzil.items.splice(Number(e.target.closest(".manzil-item").dataset.i), 1);
      drawManzil();
    }
  });
  $("#addManzil").addEventListener("click", () => {
    rec.manzil.items.push({juz: 1, amount: 0.25});
    drawManzil();
  });

  /* save */
  $("#saveRecord").addEventListener("click", async () => {
    rec.date = $("#recDate").value || todayStr();
    rec.notes = $("#recNotes").value.trim();
    if (rec.sabaqi.status === "completed"){
      rec.sabaqi.juz = Number($("#sabaqiJuz").value);
      rec.sabaqi.amount = Number($("#sabaqiAmt").value);
      rec.sabaqi.note = $("#sabaqiNote").value.trim();
    }
    if (rec.sabaq.status === "completed" && rec.sabaq.mode === "lines"){
      rec.sabaq.lines = Number($("#sabaqLines").value || 0);
      rec.sabaq.estLines = rec.sabaq.lines;
      rec.sabaq.ayahs = 0;
      if (!rec.sabaq.lines){ toast("Enter the number of lines memorized"); return; }
    }
    if (rec.manzil.status === "completed" && !rec.manzil.items.length){
      toast("Add at least one juz to Manzil, or mark it Missed / Not assigned"); return;
    }
    // protect the byStudentDate unique index if the date was changed
    const clash = await recordOf(st.id, rec.date);
    if (clash && clash.id !== rec.id){
      if (!confirm(`A record already exists for ${fmtDate(rec.date)}. Replace it?`)) return;
      await dbDel("records", clash.id);
    }
    await dbPut("records", rec);
    // auto-advance student's current juz / surah from sabaq portion
    if (rec.sabaq.status === "completed" && rec.sabaq.mode === "portion"){
      const j = juzOf(rec.sabaq.surah, rec.sabaq.toAyah);
      const upd = {...st};
      let changed = false;
      if (j > (st.currentJuz || 1)){ upd.currentJuz = j; changed = true; }
      if (rec.sabaq.surah !== st.currentSurah){ upd.currentSurah = rec.sabaq.surah; changed = true; }
      if (changed) await dbPut("students", upd);
    }
    toast("Saved — " + fmtDate(rec.date));
    nav("profile", {studentId: st.id});
  });
  if (existing){
    $("#delRecord").addEventListener("click", async () => {
      if (confirm("Delete this day's record?")){
        await dbDel("records", existing.id);
        toast("Record deleted");
        nav("profile", {studentId: st.id});
      }
    });
  }
}

/* ================= LIGHTWEIGHT SVG CHARTS ================= */
function barChart(values, labels, gold = false){
  const n = values.length;
  if (!n) return "";
  const W = Math.max(280, n * 44), H = 150, pad = 18, bw = (W - pad * 2) / n * 0.62;
  const max = Math.max(...values, 1);
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" role="img">`;
  svg += `<line x1="${pad}" y1="${H - 26}" x2="${W - pad}" y2="${H - 26}" class="chart-grid"/>`;
  values.forEach((v, i) => {
    const x = pad + (i + 0.5) * ((W - pad * 2) / n) - bw / 2;
    const h = Math.round((v / max) * (H - 60));
    const y = H - 26 - h;
    svg += `<rect x="${x}" y="${y}" width="${bw}" height="${Math.max(h, v > 0 ? 2 : 0)}" rx="3" class="bar-fill${gold ? " gold" : ""}"/>`;
    if (v > 0) svg += `<text x="${x + bw / 2}" y="${y - 4}" text-anchor="middle" class="chart-val">${Math.round(v * 10) / 10}</text>`;
    svg += `<text x="${x + bw / 2}" y="${H - 12}" text-anchor="middle" class="chart-label">${esc(labels[i])}</text>`;
  });
  return svg + "</svg>";
}
function lineChart(values, labels){
  const n = values.length;
  if (!n) return "";
  const W = Math.max(280, n * 50), H = 150, pad = 22;
  const max = Math.max(...values, 1);
  const pt = i => [pad + i * ((W - pad * 2) / Math.max(n - 1, 1)), H - 26 - (values[i] / max) * (H - 60)];
  let path = values.map((_, i) => (i ? "L" : "M") + pt(i).map(v => Math.round(v)).join(",")).join(" ");
  let svg = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" role="img">`;
  svg += `<line x1="${pad}" y1="${H - 26}" x2="${W - pad}" y2="${H - 26}" class="chart-grid"/>`;
  svg += `<path d="${path}" class="chart-line"/>`;
  values.forEach((v, i) => {
    const [x, y] = pt(i);
    svg += `<circle cx="${x}" cy="${y}" r="3.5" class="chart-dot"/>`;
    svg += `<text x="${x}" y="${y - 7}" text-anchor="middle" class="chart-val">${Math.round(v * 10) / 10}</text>`;
    svg += `<text x="${x}" y="${H - 12}" text-anchor="middle" class="chart-label">${esc(labels[i])}</text>`;
  });
  return svg + "</svg>";
}

/* ================= REPORTS (offline PDF via print) ================= */
function reportDialog(kind, studentId){
  const isWeek = kind === "weekly";
  openModal(`
    <h2>${isWeek ? "Weekly" : "Monthly"} Report</h2>
    <div class="field">
      <label>${isWeek ? "Pick any date in the week (week runs Mon–Sun)" : "Month"}</label>
      <input id="rp_when" type="${isWeek ? "date" : "month"}" value="${isWeek ? todayStr() : todayStr().slice(0, 7)}">
    </div>
    <div class="field"><label>Teacher remarks</label><textarea id="rp_remarks" placeholder="e.g. Excellent fluency this ${isWeek ? "week" : "month"}, tajweed improving…"></textarea></div>
    ${isWeek ? "" : `
    <div class="field"><label>Strengths</label><input id="rp_strength" placeholder="e.g. Strong daily revision habit"></div>
    <div class="field"><label>Areas for improvement</label><input id="rp_improve" placeholder="e.g. Needs steadier attendance"></div>`}
    <p class="page-sub">The report opens in the print dialog — choose <b>Save as PDF</b> to export, or pick your printer to print. Works fully offline.</p>
    <div class="row" style="justify-content:flex-end">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn gold" id="rp_go">Generate Report</button>
    </div>`);
  $("#rp_go").addEventListener("click", async () => {
    const when = $("#rp_when").value;
    const opts = {
      remarks: $("#rp_remarks").value.trim(),
      strength: $("#rp_strength")?.value.trim() || "",
      improve: $("#rp_improve")?.value.trim() || ""
    };
    closeModal();
    if (isWeek) await weeklyReport(studentId, when, opts);
    else await monthlyReport(studentId, when, opts);
  });
}
function reportShell(inner){
  $("#print-root").innerHTML = `<div class="report">${inner}</div>`;
  setTimeout(() => window.print(), 60);
}
function reportHead(type, range){
  return `<div class="r-band">
    <div class="r-logo"><svg viewBox="0 0 512 512"><rect width="512" height="512" rx="110" fill="#0A3B2E"/><path d="M310 96a160 160 0 1 0 0 320 196 196 0 0 1 0-320z" fill="#C9A227"/><circle cx="368" cy="160" r="26" fill="#C9A227"/></svg></div>
    <div>
      <div class="r-madrasa">${esc(SETTINGS.madrasa || "Madrasa Hifz-ul-Quran")}</div>
      <div class="r-type">${type} · ${esc(range)}</div>
    </div>
    <div class="r-bismillah">بِسْمِ اللَّهِ<br>الرَّحْمَٰنِ الرَّحِيمِ</div>
  </div>`;
}
function summaryCards(items){
  return `<div class="r-cards">${items.map(i =>
    `<div class="r-card ${i.gold ? "gold" : ""}"><b>${i.v}</b><span>${i.l}</span></div>`).join("")}</div>`;
}
function reportFoot(remarks){
  return `
    <div class="r-sec">Teacher Remarks</div>
    <div class="r-remarks">${esc(remarks || "")}</div>
    <div class="sig-row">
      <div class="sig">Teacher's Signature${SETTINGS.teacher ? `<br>${esc(SETTINGS.teacher)}` : ""}</div>
      <div class="sig">Parent's Signature</div>
    </div>
    <p style="text-align:center;font-size:10px;color:#777;margin-top:18px">Generated ${fmtDate(todayStr())} · Hifz Progress Manager</p>`;
}
function rangeRecords(records, from, to){
  return records.filter(r => r.date >= from && r.date <= to);
}
function recordRowsTable(recs){
  if (!recs.length) return "<p>No daily records in this period.</p>";
  return `<table><tr><th>Date</th><th>Attendance</th><th>Sabaq (new lesson)</th><th>Sabaqi</th><th>Manzil</th></tr>
    ${recs.map(r => {
      let sb = "—";
      if (r.sabaq?.status === "completed")
        sb = r.sabaq.mode === "portion"
          ? `${esc(surah(r.sabaq.surah).en)} ${r.sabaq.fromAyah}–${r.sabaq.toAyah} (~${r.sabaq.estLines} lines)`
          : `${r.sabaq.estLines} lines`;
      else if (r.sabaq?.status === "missed") sb = "Missed";
      let sq = r.sabaqi?.status === "completed" ? `Juz ${r.sabaqi.juz} · ${fracLabel(r.sabaqi.amount)}` : r.sabaqi?.status === "missed" ? "Missed" : "—";
      let mz = r.manzil?.status === "completed" && r.manzil.items?.length
        ? r.manzil.items.map(it => `J${it.juz} ${fracLabel(it.amount)}`).join(", ")
        : r.manzil?.status === "missed" ? "Missed" : "—";
      return `<tr><td>${fmtDateShort(r.date)}</td><td>${r.attendance[0].toUpperCase() + r.attendance.slice(1)}</td><td>${sb}</td><td>${sq}</td><td>${mz}</td></tr>`;
    }).join("")}</table>`;
}

async function weeklyReport(studentId, anyDate, opts){
  const st = await dbGet("students", studentId);
  const d = new Date(anyDate + "T00:00:00");
  const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const sunday = new Date(monday); sunday.setDate(monday.getDate() + 6);
  const from = monday.toLocaleDateString("en-CA"), to = sunday.toLocaleDateString("en-CA");
  const recs = rangeRecords(await recordsOf(studentId), from, to);
  const s = summarize(recs);
  reportShell(`
    ${reportHead("Weekly Hifz Report", fmtDate(from) + " — " + fmtDate(to))}
    <table>
      <tr><th>Student</th><td>${esc(st.name)}${st.arabicName ? " · " + esc(st.arabicName) : ""}</td><th>Current Juz</th><td>${st.currentJuz}</td></tr>
      <tr><th>Parent</th><td>${esc(st.parentName || "—")}</td><th>Contact</th><td>${esc(st.parentPhone || "—")}</td></tr>
    </table>
    ${summaryCards([
      {v: Math.round(s.lines * 10) / 10, l: "Lines memorized", gold: true},
      {v: s.ayahs, l: "Ayahs memorized", gold: true},
      {v: s.attendancePct + "%", l: "Attendance"},
      {v: Math.round((s.sabaqi + s.manzil) * 100) / 100, l: "Juz revised"}
    ])}
    <div class="r-sec">Attendance</div>
    <table><tr><th>Present</th><th>Absent</th><th>Leave</th><th>Sick</th><th>Attendance %</th></tr>
    <tr><td>${s.present}</td><td>${s.absent}</td><td>${s.leave}</td><td>${s.sick}</td><td>${s.attendancePct}%</td></tr></table>
    <div class="r-sec">Summary of the Week</div>
    <table>
      <tr><th>New lesson (Sabaq)</th><td>${Math.round(s.lines * 10) / 10} lines · ${s.ayahs} ayahs · ${s.sabaqDays} day(s) completed · ${s.sabaqMissed} missed</td></tr>
      <tr><th>Current juz revision (Sabaqi)</th><td>${Math.round(s.sabaqi * 100) / 100} juz revised · ${s.sabaqiDays} day(s) · ${s.sabaqiMissed} missed</td></tr>
      <tr><th>Old juz revision (Manzil)</th><td>${Math.round(s.manzil * 100) / 100} juz revised · ${s.manzilDays} day(s) · ${s.manzilMissed} missed</td></tr>
      <tr><th>Missed days (absent)</th><td>${s.absent}</td></tr>
    </table>
    <div class="r-sec">Daily Detail</div>
    ${recordRowsTable(recs)}
    ${reportFoot(opts.remarks)}`);
}

async function monthlyReport(studentId, monthKey, opts){
  const st = await dbGet("students", studentId);
  const all = await recordsOf(studentId);
  const recs = all.filter(r => r.date.startsWith(monthKey));
  const s = summarize(recs);
  const before = summarize(all.filter(r => r.date < monthKey + "-01"));
  const newJuz = [...s.juzTouched].filter(j => !before.juzTouched.has(j));
  const monthName = new Date(monthKey + "-01T00:00:00").toLocaleDateString(undefined, {month: "long", year: "numeric"});
  // weekly breakdown chart (lines per week of month)
  const weeks = [0, 0, 0, 0, 0];
  for (const r of recs){
    if (r.sabaq?.status === "completed"){
      const w = Math.min(4, Math.floor((Number(r.date.slice(8)) - 1) / 7));
      weeks[w] += r.sabaq.estLines || 0;
    }
  }
  const maxW = Math.max(...weeks, 1);
  const chart = `<table><tr><th>Week</th><th>Lines memorized</th></tr>${weeks.map((v, i) =>
    `<tr><td>Week ${i + 1}</td><td><div style="background:#0A3B2E;height:11px;border-radius:3px;width:${Math.round(v / maxW * 100)}%;min-width:${v > 0 ? 4 : 0}px;display:inline-block;vertical-align:middle"></div> ${Math.round(v * 10) / 10}</td></tr>`).join("")}</table>`;
  reportShell(`
    ${reportHead("Monthly Hifz Report", monthName)}
    <table>
      <tr><th>Student</th><td>${esc(st.name)}${st.arabicName ? " · " + esc(st.arabicName) : ""}</td><th>Age</th><td>${esc(st.age || "—")}</td></tr>
      <tr><th>Parent</th><td>${esc(st.parentName || "—")}</td><th>Contact</th><td>${esc(st.parentPhone || "—")}</td></tr>
      <tr><th>Admission</th><td>${fmtDate(st.admissionDate)}</td><th>Current Juz</th><td>Juz ${st.currentJuz} of 30</td></tr>
    </table>
    ${summaryCards([
      {v: Math.round(s.lines * 10) / 10, l: "Lines memorized", gold: true},
      {v: s.ayahs, l: "Ayahs memorized", gold: true},
      {v: s.attendancePct + "%", l: "Attendance"},
      {v: Math.round(s.sabaqi * 100) / 100, l: "Sabaqi (juz)"},
      {v: Math.round(s.manzil * 100) / 100, l: "Manzil (juz)"}
    ])}
    <div class="r-sec">Month at a Glance</div>
    <table>
      <tr><th>Attendance</th><td>${s.attendancePct}% (${s.present} present / ${s.total} days recorded)</td></tr>
      <tr><th>New lessons completed</th><td>${s.sabaqDays} day(s)</td></tr>
      <tr><th>Total lines memorized</th><td>${Math.round(s.lines * 10) / 10}</td></tr>
      <tr><th>Total ayahs memorized</th><td>${s.ayahs}</td></tr>
      <tr><th>Current juz revision (Sabaqi)</th><td>${Math.round(s.sabaqi * 100) / 100} juz over ${s.sabaqiDays} day(s)</td></tr>
      <tr><th>Old juz revision (Manzil)</th><td>${Math.round(s.manzil * 100) / 100} juz over ${s.manzilDays} day(s)</td></tr>
      <tr><th>Juz completed this month</th><td>${s.juzCompleted.length ? s.juzCompleted.map(j => `Juz ${j.juz} (${fmtDateShort(j.date)})`).join(", ") : "—"}</td></tr>
      <tr><th>New juz started</th><td>${newJuz.length ? newJuz.map(j => "Juz " + j).join(", ") : "—"}</td></tr>
    </table>
    <div class="r-sec">Performance by Week</div>
    ${chart}
    <div class="r-sec">Strengths</div><div class="r-remarks">${esc(opts.strength)}</div>
    <div class="r-sec">Areas for Improvement</div><div class="r-remarks">${esc(opts.improve)}</div>
    ${reportFoot(opts.remarks)}`);
}

/* ================= ANALYTICS ================= */
async function renderAnalytics(app){
  const students = await dbAll("students");
  const allRecords = await dbAll("records");
  const monthKey = state.anaMonth || todayStr().slice(0, 7);
  const recBy = {};
  for (const r of allRecords) (recBy[r.studentId] = recBy[r.studentId] || []).push(r);

  const perStudent = students.map(st => {
    const recs = (recBy[st.id] || []).filter(r => r.date.startsWith(monthKey));
    const s = summarize(recs);
    return {st, s};
  });

  // growth: total lines per week, last 8 weeks (all students)
  const wkLabels = [], wkVals = [];
  for (let i = 7; i >= 0; i--){
    const end = new Date(Date.now() - i * 7 * 864e5);
    const start = new Date(end.getTime() - 6 * 864e5);
    const a = start.toLocaleDateString("en-CA"), b = end.toLocaleDateString("en-CA");
    wkLabels.push(fmtDateShort(b));
    wkVals.push(allRecords.filter(r => r.date >= a && r.date <= b && r.sabaq?.status === "completed")
                          .reduce((x, r) => x + (r.sabaq.estLines || 0), 0));
  }

  const ranked = perStudent.filter(p => p.s.total > 0).sort((a, b) => b.s.lines - a.s.lines);
  const attention = perStudent.filter(p =>
    p.s.total > 0 && (p.s.attendancePct < 70 || p.s.sabaqMissed + p.s.sabaqiMissed + p.s.manzilMissed >= 4));

  app.innerHTML = `
    <h1 class="page-title">Analytics</h1>
    <div class="row spread" style="margin-bottom:14px">
      <p class="page-sub" style="margin:0">Whole-madrasa view for the selected month.</p>
      <input type="month" id="anaMonth" class="search-input" style="flex:0 0 170px" value="${monthKey}">
    </div>

    <div class="card" style="margin-bottom:12px">
      <h3>Memorization growth — lines per week (all students, last 8 weeks)</h3>
      <div class="chart-wrap">${lineChart(wkVals, wkLabels)}</div>
    </div>

    <div class="grid grid-2" style="margin-bottom:12px">
      <div class="card">
        <h3>Attendance this month (%)</h3>
        <div class="chart-wrap">${barChart(perStudent.map(p => p.s.attendancePct), perStudent.map(p => p.st.name.split(" ")[0]))}</div>
      </div>
      <div class="card">
        <h3>Lines memorized this month</h3>
        <div class="chart-wrap">${barChart(perStudent.map(p => Math.round(p.s.lines)), perStudent.map(p => p.st.name.split(" ")[0]), true)}</div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:12px">
      <div class="card">
        <h3>Revision consistency this month</h3>
        <table class="tbl"><tr><th>Student</th><th>Sabaqi days</th><th>Manzil days</th><th>Missed</th></tr>
          ${perStudent.map(p => `<tr><td>${esc(p.st.name)}</td><td>${p.s.sabaqiDays}</td><td>${p.s.manzilDays}</td>
            <td>${p.s.sabaqMissed + p.s.sabaqiMissed + p.s.manzilMissed}</td></tr>`).join("") || "<tr><td colspan=4>No data</td></tr>"}
        </table>
      </div>
      <div class="card">
        <h3>Top performers ✦</h3>
        ${ranked.slice(0, 5).map((p, i) => `
          <div class="row spread" style="padding:7px 0;border-bottom:1px solid var(--line)">
            <span><b style="color:var(--gold)">${i + 1}.</b> ${esc(p.st.name)}</span>
            <span class="chip mut">${Math.round(p.s.lines)} lines · ${p.s.attendancePct}%</span>
          </div>`).join("") || `<div class="empty">No records this month yet.</div>`}
      </div>
    </div>

    <div class="card">
      <h3>Students needing attention</h3>
      ${attention.length ? attention.map(p => `
        <div class="row spread" style="padding:7px 0;border-bottom:1px solid var(--line)">
          <span>${esc(p.st.name)} <span class="chip bad">${p.s.attendancePct < 70 ? p.s.attendancePct + "% attendance" : "frequent misses"}</span></span>
          <button class="btn sm" data-open="${p.st.id}">Open profile</button>
        </div>`).join("")
      : `<div class="empty">All students are keeping up this month. ما شاء الله</div>`}
    </div>`;

  $("#anaMonth").addEventListener("change", e => { state.anaMonth = e.target.value; render(); });
  $$("[data-open]", app).forEach(b => b.addEventListener("click", () => nav("profile", {studentId: Number(b.dataset.open)})));
}

/* ================= SETTINGS / BACKUP ================= */
function download(filename, text, type = "application/json"){
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], {type}));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function csvCell(v){ v = String(v ?? ""); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }

async function renderSettings(app){
  app.innerHTML = `
    <h1 class="page-title">Settings</h1>
    <p class="page-sub">Everything is stored on this device — no internet needed.</p>

    <div class="card" style="margin-bottom:12px">
      <h3>Madrasa details (shown on reports)</h3>
      <div class="form-grid">
        <div class="field"><label>Madrasa name</label><input id="set_madrasa" value="${esc(SETTINGS.madrasa)}"></div>
        <div class="field"><label>Teacher name</label><input id="set_teacher" value="${esc(SETTINGS.teacher)}"></div>
      </div>
      <button class="btn gold" id="saveSettings">Save details</button>
    </div>

    <div class="card" style="margin-bottom:12px">
      <h3>Backup & restore</h3>
      <p class="page-sub">Take a backup regularly and keep the file safe (e.g. copy to a pen drive or another phone). Restoring replaces all current data.</p>
      <div class="row">
        <button class="btn" id="backupBtn">⬇ Backup data (.json)</button>
        <button class="btn ghost" id="restoreBtn">⬆ Restore from backup</button>
        <input type="file" id="restoreFile" accept=".json" hidden>
      </div>
    </div>

    <div class="card" style="margin-bottom:12px">
      <h3>Export</h3>
      <div class="row">
        <button class="btn ghost" id="csvStudents">Students → CSV / Excel</button>
        <button class="btn ghost" id="csvRecords">Daily records → CSV / Excel</button>
      </div>
      <p class="page-sub" style="margin-top:8px">CSV files open directly in Excel, LibreOffice and Google Sheets.</p>
    </div>

    <div class="card" style="border-color:var(--danger)">
      <h3 style="color:var(--danger)">Danger zone</h3>
      <button class="btn danger" id="wipeBtn">Delete ALL data</button>
    </div>`;

  $("#saveSettings").addEventListener("click", async () => {
    SETTINGS.madrasa = $("#set_madrasa").value.trim();
    SETTINGS.teacher = $("#set_teacher").value.trim();
    await setSetting("madrasa", SETTINGS.madrasa);
    await setSetting("teacher", SETTINGS.teacher);
    $("#brandName").textContent = SETTINGS.madrasa || "Hifz Progress";
    toast("Saved");
  });

  $("#backupBtn").addEventListener("click", async () => {
    const data = {
      app: "hifz-progress", version: 1, exported: new Date().toISOString(),
      settings: SETTINGS,
      students: await dbAll("students"),
      records: await dbAll("records")
    };
    download(`hifz-backup-${todayStr()}.json`, JSON.stringify(data));
    toast("Backup downloaded");
  });

  $("#restoreBtn").addEventListener("click", () => $("#restoreFile").click());
  $("#restoreFile").addEventListener("change", async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.app !== "hifz-progress") throw new Error("Not a Hifz Progress backup file");
      if (!confirm(`Restore backup from ${data.exported?.slice(0, 10)}? This replaces ALL current data (${data.students.length} students, ${data.records.length} records).`)) return;
      await tx("students", "readwrite", s => s.clear());
      await tx("records", "readwrite", s => s.clear());
      for (const st of data.students) await dbPut("students", st);
      for (const r of data.records) await dbPut("records", r);
      if (data.settings){ SETTINGS = {...SETTINGS, ...data.settings};
        await setSetting("madrasa", SETTINGS.madrasa); await setSetting("teacher", SETTINGS.teacher); }
      toast("Backup restored");
      nav("dashboard");
    } catch (err){ alert("Restore failed: " + err.message); }
    e.target.value = "";
  });

  $("#csvStudents").addEventListener("click", async () => {
    const students = await dbAll("students");
    const head = ["Name","Arabic Name","Age","Parent","Phone","Address","Admission","Current Juz","Current Surah","Notes"];
    const rows = students.map(s => [s.name, s.arabicName, s.age, s.parentName, s.parentPhone, s.address, s.admissionDate, s.currentJuz, surah(s.currentSurah || 1).en, s.notes]);
    download(`students-${todayStr()}.csv`, "\uFEFF" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\n"), "text/csv");
  });
  $("#csvRecords").addEventListener("click", async () => {
    const students = await dbAll("students");
    const byId = Object.fromEntries(students.map(s => [s.id, s.name]));
    const records = (await dbAll("records")).sort((a, b) => a.date < b.date ? -1 : 1);
    const head = ["Date","Student","Attendance","Sabaq Status","Sabaq Portion","Sabaq Lines","Sabaq Ayahs","Sabaqi Status","Sabaqi Juz","Sabaqi Amount","Manzil Status","Manzil Detail","Notes"];
    const rows = records.map(r => [
      r.date, byId[r.studentId] || r.studentId, r.attendance,
      r.sabaq?.status || "", r.sabaq?.mode === "portion" ? `${surah(r.sabaq.surah).en} ${r.sabaq.fromAyah}-${r.sabaq.toAyah}` : "",
      r.sabaq?.estLines || "", r.sabaq?.ayahs || "",
      r.sabaqi?.status || "", r.sabaqi?.juz || "", r.sabaqi?.status === "completed" ? fracLabel(r.sabaqi.amount) : "",
      r.manzil?.status || "", (r.manzil?.items || []).map(it => `Juz ${it.juz} ${fracLabel(it.amount)}`).join("; "),
      r.notes || ""
    ]);
    download(`daily-records-${todayStr()}.csv`, "\uFEFF" + [head, ...rows].map(r => r.map(csvCell).join(",")).join("\n"), "text/csv");
  });

  $("#wipeBtn").addEventListener("click", async () => {
    if (!confirm("Delete ALL students, records and settings? This cannot be undone.")) return;
    if (!confirm("Are you absolutely sure? Take a backup first if you might need this data.")) return;
    await tx("students", "readwrite", s => s.clear());
    await tx("records", "readwrite", s => s.clear());
    await tx("settings", "readwrite", s => s.clear());
    SETTINGS = {madrasa: "", teacher: ""};
    toast("All data deleted");
    nav("dashboard");
  });
}

/* ================= THEME ================= */
function applyTheme(t){
  document.documentElement.dataset.theme = t;
  localStorage.setItem("hifz_theme", t);
}

/* ================= INIT ================= */
(async function init(){
  applyTheme(localStorage.getItem("hifz_theme") ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  $("#themeToggle").addEventListener("click", () =>
    applyTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));

  await openDB();
  SETTINGS.madrasa = await getSetting("madrasa", "");
  SETTINGS.teacher = await getSetting("teacher", "");
  if (SETTINGS.madrasa) $("#brandName").textContent = SETTINGS.madrasa;

  $("#mainTabs").addEventListener("click", e => {
    const t = e.target.closest(".tab"); if (!t) return;
    nav(t.dataset.tab);
  });

  window.addEventListener("afterprint", () => { $("#print-root").innerHTML = ""; });

  // offline support: register service worker when served over http(s)
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")){
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }

  render();
})();
