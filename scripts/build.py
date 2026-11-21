#!/usr/bin/env python3
"""Assemble the whole website into _site/ — exactly what GitHub Pages publishes.

    pip install -r requirements.txt
    python3 scripts/build.py
    python3 -m http.server 8000 -d _site      # preview at http://localhost:8000/

Layout of the published site (URLs are stable; do not change them casually):
    /                    OASIS main site            ← oasis-site/
    /VENGuard/…          redirects to https://www.venguard.tech/… (the VenGuard site moved to its own
                         repository, oasisnextbd/venguard-website, in November 2026)
    /Rod_Bondhu/         Rod Bondhu website (bn)    ← rodbondhu/ (built by rodbondhu/tools/build.py)
    /Rod_Bondhu/en/      Rod Bondhu website (en)
    /Rod_Bondhu/app/     Rod Bondhu live dryer app  ← rodbondhu/app/
    /team/               redirects to https://www.venguard.tech/team/ (the VenGuard team dashboard)
"""
import json
import pathlib
import shutil
import subprocess
import sys

REPO = pathlib.Path(__file__).resolve().parent.parent
OUT = REPO / "_site"


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(REPO / "oasis-site", OUT)
    subprocess.run([sys.executable, str(REPO / "rodbondhu/tools/build.py"), str(OUT / "Rod_Bondhu")], check=True)
    write_venguard_redirects()
    write_sitemap_index()
    (OUT / ".nojekyll").write_text("")  # serve files as-is (no Jekyll processing)
    files = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"Site assembled in {OUT.relative_to(REPO)}/ ({files} files)")


def write_sitemap_index():
    """/sitemap.xml lists the OASIS page and the Rod Bondhu sitemap, so Search Console needs one address."""
    base = "https://oasisnextbd.github.io/OASIS_official_website"
    (OUT / "sitemap-oasis.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <url><loc>{base}/</loc></url>\n</urlset>\n", encoding="utf-8")
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        f"  <sitemap><loc>{base}/sitemap-oasis.xml</loc></sitemap>\n"
        f"  <sitemap><loc>{base}/Rod_Bondhu/sitemap.xml</loc></sitemap>\n</sitemapindex>\n", encoding="utf-8")


# The VenGuard site and team dashboard moved to https://www.venguard.tech (repository
# oasisnextbd/venguard-website). Old links, ads and dealer QR stickers point here, so every page
# that existed keeps an address that forwards to the same page there, query string included
# (dealer codes travel in ?dealer=…). Anything not listed is caught by oasis-site/404.html.
VENGUARD = "https://www.venguard.tech"
VENGUARD_PAGES = (
    "", "about", "agro-marine", "app", "app-guide", "contact", "cookies", "dealers", "faq", "guides",
    "home-kit", "how-it-works", "landlords", "landlords-restaurants", "pre-order", "pre-order/thank-you",
    "privacy", "products", "refund-policy", "restaurants", "terms",
)


def redirect_page(target):
    t = html_escape(target)
    return (
        '<!DOCTYPE html>\n<html lang="bn"><head><meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        f'<title>VenGuard · www.venguard.tech</title>\n<link rel="canonical" href="{t}">\n'
        f'<meta http-equiv="refresh" content="0; url={t}">\n'
        f"<script>location.replace({json.dumps(target)} + location.search + location.hash);</script>\n"
        '</head><body style="font-family:system-ui,sans-serif;padding:24px">\n'
        f'<p>VenGuard এখন নতুন ঠিকানায় · VenGuard has moved: <a href="{t}">{t}</a></p>\n</body></html>\n'
    )


def write_venguard_redirects():
    pages = {f"VENGuard/{p}": f"{VENGUARD}/{p}" for lang in ("", "en/") for p in (lang + q for q in VENGUARD_PAGES)}
    pages["team/"] = f"{VENGUARD}/team/"
    for path, target in pages.items():
        path = path.rstrip("/")
        target = target if target.endswith("/") else target + "/"
        out = OUT / path / "index.html"
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(redirect_page(target), encoding="utf-8")
    old = OUT / "VENGuard" / "VENGuard_Dashboard.html"  # the 2025 dashboard prototype
    old.write_text(redirect_page(f"{VENGUARD}/VENGuard_Dashboard.html"), encoding="utf-8")


def html_escape(s):
    return s.replace("&", "&amp;").replace('"', "&quot;").replace("<", "&lt;")


if __name__ == "__main__":
    main()
