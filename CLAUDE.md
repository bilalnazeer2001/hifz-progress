# Hifz Progress — Madrasa Manager

## What this project is
A 100% offline Quran memorization (Hifz) progress tracker for madrasa teachers.
Teachers record each student's daily Sabaq (new lesson), Sabaqi (current juz
revision) and Manzil (old juz revision), and generate weekly/monthly PDF
reports for parents. Used on low-end Android phones, tablets and PCs.
The owner of this project is not a coder — explain changes in plain language,
never assume coding knowledge, and handle all code yourself.

## Hard rules — never break these
1. **Fully offline.** No CDNs, no APIs, no Firebase/Supabase, no Google Fonts,
   no fetch() to the internet. Everything must work with WiFi off forever.
2. **No frameworks.** Vanilla HTML/CSS/JS only. No React, no build step,
   no npm dependencies in the shipped app. No heavy chart libraries —
   charts are hand-written SVG.
3. **Performance first.** Must stay fast on low-end Android. Animate only
   transform/opacity. Must handle 500+ students and years of records.
4. **Never modify `quran-data.js`** (complete Quran text, 114 surahs,
   6,236 ayahs, IndoPak/hafizi script + juz start table + CHARS_PER_LINE
   constant). Switched from Uthmani to IndoPak on 2026-06-13 at the owner's
   request, validated against per-surah ayah counts; the Uthmani version is
   preserved in git history (commit 521b2ea).
5. **Storage is IndexedDB** (database name `hifz_madrasa`). Never switch to
   localStorage for records. Never break backward compatibility with
   existing stored data or backup JSON files — teachers have real data.
6. **PDF export = browser print dialog** (print CSS on `#print-root`).
   Do not add a PDF library.

## Files
- `index.html` — shell (header, tabs, #app container, #print-root)
- `styles.css` — design system. Emerald (#0E7A57/#0A3B2E) + gold (#C9A227)
  theme, light + dark mode via `[data-theme]`, card-based UI, print styles
- `app.js` — ALL logic: Quran engine, IndexedDB layer, router, views
  (dashboard / profile / entry / analytics / settings), reports, charts
- `quran-data.js` — Quran database (DO NOT EDIT)
- `sw.js` — service worker (cache-first). If you add/rename app files,
  update the ASSETS list AND bump the CACHE version string
- `manifest.json`, `icon.svg`, `icon-192.png`, `icon-512.png` — PWA install

## Data model (IndexedDB)
- `students`: {id, name, arabicName, age, parentName, parentPhone, address,
  admissionDate, currentJuz, currentSurah, notes}
- `records` (one per student per date, unique index [studentId, date]):
  {id, studentId, date "YYYY-MM-DD",
   attendance "present|absent|leave|sick" (morning session),
   attendance2 same values (evening session; old records don't have this
   field — a record without attendance2 is a single-session day, see
   attSessions()),
   sabaq:{status "completed|missed|none", mode "portion|lines", surah,
          fromAyah, toAyah, lines, ayahs, estLines},
   sabaqi:{status, juz, amount (fraction of juz, e.g. 0.25), note},
   manzil:{status, items:[{juz, amount}]},
   notes}
- `settings`: {key, value} — madrasa name, teacher name

## Domain concepts
- Quran = 30 juz. Sabaq = new memorization. Sabaqi = revising the current
  juz. Manzil = revising older juz. Lines = standard Madani mushaf lines
  (15/page); estimated as text characters / CHARS_PER_LINE.
- `juzOf(surah, ayah)` and `calcPortion(surah, from, to)` in app.js handle
  all juz/ayah/line math — reuse them, don't reinvent.

## Workflow for every change
1. After editing, run a local server to test: `python3 -m http.server 8080`
   then check http://localhost:8080 (owner will check in their browser).
2. Verify JS with `node --check app.js` before saying a change is done.
3. Rebuild the single-file version after every change — create/maintain
   `build.py` that inlines styles.css, quran-data.js and app.js into
   index.html (replacing the link/script tags, removing manifest/icon links)
   and writes `Hifz-Progress-AllInOne.html`. Both versions must always
   stay in sync.
4. If `sw.js` assets changed, bump the cache version.
5. Keep UI text simple and teacher-friendly. Keep the emerald/gold design
   language consistent. Arabic text uses class `arabic` (system Arabic fonts).

## Testing checklist for risky changes
- Add a student, save a daily entry with a Quran portion, check the
  calculated ayahs/lines, open the profile, generate a weekly report.
- Check both light and dark mode, and a narrow (380px) mobile viewport.
- Confirm backup → restore round-trip still works after any data changes.