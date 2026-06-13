"""Build the single-file version of Hifz Progress.

Reads index.html and inlines styles.css, quran-data.js and app.js into it,
removes the PWA-only tags (manifest + icons), and writes
Hifz-Progress-AllInOne.html — one file that works when opened directly,
with no other files needed.

Run with:  python build.py
"""
import base64
import re
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "Hifz-Progress-AllInOne.html"
FONT = "fonts/scheherazade-arabic.woff2"


def read(name):
    return (HERE / name).read_text(encoding="utf-8")


def inline_font(css):
    """Replace the bundled-font url() with a base64 data: URI so the
    single-file build needs no separate font file."""
    data = (HERE / FONT).read_bytes()
    b64 = base64.b64encode(data).decode("ascii")
    uri = f"data:font/woff2;base64,{b64}"
    new_css, n = re.subn(
        r'url\("fonts/scheherazade-arabic\.woff2"\)',
        lambda m: f'url("{uri}")', css, count=1)
    if n == 0:
        raise SystemExit("build.py: @font-face url for the Quran font not found in styles.css")
    return new_css


def safe_js(src):
    # "</script" inside JS text would end the inline <script> block early;
    # writing it as "<\/script" is identical for the browser's JS engine.
    return src.replace("</script", "<\\/script")


def main():
    html = read("index.html")
    css = inline_font(read("styles.css"))
    quran = safe_js(read("quran-data.js"))
    app = safe_js(read("app.js"))

    replacements = [
        # PWA install tags make no sense in a single local file — drop them.
        (r'\s*<link rel="manifest"[^>]*>', ""),
        (r'\s*<link rel="icon"[^>]*>', ""),
        (r'\s*<link rel="apple-touch-icon"[^>]*>', ""),
        # Cloud sync needs a real web origin for Google sign-in, which a
        # double-clicked file:// page can't provide — so the single-file
        # build is the offline, device-only version. Strip Firebase out;
        # app.js falls back to its local-only CLOUD stub automatically.
        (r'\s*<script src="vendor/firebase-app-compat\.js"></script>', ""),
        (r'\s*<script src="vendor/firebase-auth-compat\.js"></script>', ""),
        (r'\s*<script src="firebase-config\.js"></script>', ""),
        # Inline the three external files in place of their tags.
        (r'<link rel="stylesheet" href="styles\.css">',
         lambda m: "<style>\n" + css + "\n</style>"),
        (r'<script src="quran-data\.js"></script>',
         lambda m: "<script>\n" + quran + "\n</script>"),
        (r'<script src="app\.js"></script>',
         lambda m: "<script>\n" + app + "\n</script>"),
    ]

    for pattern, repl in replacements:
        new_html, n = re.subn(pattern, repl, html, count=1)
        if n == 0 and not pattern.startswith(r"\s*<link rel="):
            raise SystemExit(f"build.py: could not find expected tag: {pattern}\n"
                             "index.html structure changed — update build.py to match.")
        html = new_html

    OUT.write_text(html, encoding="utf-8")
    size_mb = OUT.stat().st_size / (1024 * 1024)
    print(f"Wrote {OUT.name} ({size_mb:.2f} MB)")


if __name__ == "__main__":
    main()
