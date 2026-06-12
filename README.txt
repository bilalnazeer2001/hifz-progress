================================================
HIFZ PROGRESS — Madrasa Manager (100% Offline)
================================================

WHAT THIS IS
A complete Quran memorization (Hifz) progress tracker for madrasa
teachers. Track daily Sabaq / Sabaqi / Manzil for every student,
and print professional weekly & monthly reports for parents.
The complete Quran (all 114 surahs, 6,236 ayahs) is built in.
No internet is ever needed after setup.

------------------------------------------------
OPTION 1 — SIMPLEST (works immediately, fully offline)
------------------------------------------------
1. Copy this whole folder to the phone / PC.
2. Open "index.html" in Chrome, Edge or Firefox.
That's it. All data saves on that device automatically.

NOTE: On Android, opening local files in Chrome can be fiddly.
The easiest offline method on Android is Option 2 (install once
with internet, then it works forever without internet).

------------------------------------------------
OPTION 2 — INSTALL AS AN APP (recommended)
------------------------------------------------
Host the folder once on any free static host (GitHub Pages works
perfectly — same as your food-order site):

1. Create a GitHub repo, upload all files in this folder.
2. Enable GitHub Pages in repo Settings.
3. Open the site once on each device → Chrome will show
   "Add to Home screen" / "Install app".
4. After installing, the app works COMPLETELY OFFLINE forever
   (the service worker stores everything on the device).

------------------------------------------------
IMPORTANT NOTES
------------------------------------------------
* DATA LIVES ON THE DEVICE. Each phone/PC has its own data.
  Use Settings → Backup to move data between devices.
* TAKE BACKUPS WEEKLY (Settings → Backup data). If the browser
  data is cleared, the backup file is your safety net.
* PDF EXPORT: reports open in the print dialog — choose
  "Save as PDF". This works with no internet.
* Reports show your madrasa name: set it in Settings first.

FILES
index.html ....... the app
styles.css ....... design (green & gold madrasa theme)
app.js ........... all logic
quran-data.js .... complete Quran text + juz map (offline)
sw.js ............ offline service worker
manifest.json .... PWA install config
icon*.png/svg .... app icons
