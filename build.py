"""Build the single-file version of Hifz Progress.

Reads index.html and inlines styles.css, quran-data.js and app.js into it,
removes the PWA-only tags (manifest + icons), and writes
Hifz-Progress-AllInOne.html — one file that works when opened directly,
with no other files needed.

Run with:  python build.py
"""
import re
from pathlib import Path

HERE = Path(__file__).parent
OUT = HERE / "Hifz-Progress-AllInOne.html"


def read(name):
    return (HERE / name).read_text(encoding="utf-8")


def safe_js(src):
    # "</script" inside JS text would end the inline <script> block early;
    # writing it as "<\/script" is identical for the browser's JS engine.
    return src.replace("</script", "<\\/script")


def main():
    html = read("index.html")
    css = read("styles.css")
    quran = safe_js(read("quran-data.js"))
    app = safe_js(read("app.js"))

    replacements = [
        # PWA install tags make no sense in a single local file — drop them.
        (r'\s*<link rel="manifest"[^>]*>', ""),
        (r'\s*<link rel="icon"[^>]*>', ""),
        (r'\s*<link rel="apple-touch-icon"[^>]*>', ""),
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
