#!/usr/bin/env python3
"""Fail if any page in _site/ links to a local file that doesn't exist.

    python3 scripts/check_links.py      # run after scripts/build.py

Checks href/src/srcset/poster in every .html file. External links (http, mailto, tel…)
are skipped; this keeps internal links, images and scripts from breaking silently.
"""
import pathlib
import re
import sys
from urllib.parse import unquote, urlsplit

SITE = pathlib.Path(__file__).resolve().parent.parent / "_site"
ATTR = re.compile(r'\b(?:href|src|poster)\s*=\s*"([^"]+)"|\bsrcset\s*=\s*"([^"]+)"', re.I)
SKIP = ("http://", "https://", "//", "mailto:", "tel:", "data:", "javascript:", "#", "sms:")


def targets(html):
    for m in ATTR.finditer(html):
        if m.group(1):
            yield m.group(1)
        else:
            for part in m.group(2).split(","):
                yield part.strip().split(" ")[0]


def main():
    broken = []
    pages = list(SITE.rglob("*.html"))
    for page in pages:
        html = page.read_text(encoding="utf-8", errors="replace")
        html = re.sub(r"<script\b[^>]*>.*?</script>", "", html, flags=re.S | re.I)  # skip JS strings
        for url in targets(html):
            if not url or url.startswith(SKIP) or "{{" in url:
                continue
            path = unquote(urlsplit(url).path)
            if not path:
                continue
            target = (SITE / path.lstrip("/")) if path.startswith("/") else (page.parent / path)
            if target.is_dir():
                target = target / "index.html"
            if not target.exists():
                broken.append(f"{page.relative_to(SITE)} → {url}")
    for b in broken:
        print("BROKEN", b)
    print(f"Checked {len(pages)} pages: {len(broken)} broken local link(s).")
    sys.exit(1 if broken else 0)


if __name__ == "__main__":
    main()
