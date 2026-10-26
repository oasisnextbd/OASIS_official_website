#!/usr/bin/env python3
"""Build the Rod Bondhu website (Bangla default, English) into an output folder.

    pip install -r requirements.txt
    python3 rodbondhu/tools/build.py [OUTPUT_DIR]     # default: _site/Rod_Bondhu

Normally run through scripts/build.py, which assembles the whole site.

Sources (all under rodbondhu/):
    site.json        settings: contacts, team, status timeline, references
    templates/       Jinja2 templates; copy is written once with both languages:
                     {{ t("বাংলা লেখা", "English text") }}
    assets/          CSS, JS, fonts, images (copied as-is)
    app/             the live dryer app (one self-contained page), published at /Rod_Bondhu/app/
Output:
    <out>/<page>/index.html      Bangla
    <out>/en/<page>/index.html   English
    <out>/app/index.html         live app
    <out>/sitemap.xml
"""
import datetime
import json
import pathlib
import shutil
import subprocess
import sys

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from markupsafe import Markup

SRC = pathlib.Path(__file__).resolve().parent.parent          # rodbondhu/
REPO = SRC.parent
OUT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else REPO / "_site" / "Rod_Bondhu"
SITE = json.loads((SRC / "site.json").read_text(encoding="utf-8"))

# slug -> template. "" is the homepage. Order is also the sitemap order.
PAGES = {
    "": "home.html",
    "how-it-works": "how-it-works.html",
    "results": "results.html",
    "live": "live.html",
    "sources": "sources.html",
    "faq": "faq.html",
    "about": "about.html",
}
LANGS = ("bn", "en")

BN_DIGITS = str.maketrans("0123456789", "০১২৩৪৫৬৭৮৯")


def page_dir(lang, slug):
    parts = (["en"] if lang == "en" else []) + ([slug] if slug else [])
    return OUT.joinpath(*parts)


def rel_root(lang, slug):
    depth = (1 if lang == "en" else 0) + (slug.count("/") + 1 if slug else 0)
    return "../" * depth or "./"


def render_all():
    env = Environment(
        loader=FileSystemLoader(SRC / "templates"),
        autoescape=True,
        undefined=StrictUndefined,
        trim_blocks=True,
        lstrip_blocks=True,
    )
    built = []
    for lang in LANGS:
        for slug, tpl in PAGES.items():
            root = rel_root(lang, slug)

            def t(bn, en, _lang=lang):
                return Markup(bn if _lang == "bn" else en)

            def n(text, _lang=lang):
                """Bangla digits on Bangla pages: n("97.5–100%")."""
                s = str(text)
                return s.translate(BN_DIGITS) if _lang == "bn" else s

            def url(target_slug, target_lang=None, _lang=lang, _root=root):
                tl = target_lang or _lang
                path = ("en/" if tl == "en" else "") + (target_slug + "/" if target_slug else "")
                return _root + path

            html = env.get_template("pages/" + tpl).render(
                lang=lang, slug=slug, root=root, site=SITE, t=t, n=n, url=url,
                canonical=SITE["base_url"] + "/" + ("en/" if lang == "en" else "") + (slug + "/" if slug else ""),
                alt_bn=SITE["base_url"] + "/" + (slug + "/" if slug else ""),
                alt_en=SITE["base_url"] + "/en/" + (slug + "/" if slug else ""),
            )
            d = page_dir(lang, slug)
            d.mkdir(parents=True, exist_ok=True)
            (d / "index.html").write_text(html, encoding="utf-8")
            built.append((lang, slug))
    return built


def last_changed(slug):
    """Date a page last changed (its template or site.json), for <lastmod>."""
    paths = [str(SRC / "templates/pages" / PAGES[slug]), str(SRC / "site.json")]
    try:
        out = subprocess.run(["git", "log", "-1", "--format=%cs", "--", *paths], cwd=SRC, capture_output=True, text=True, check=True).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        out = ""
    return out or datetime.date.today().isoformat()


def write_sitemap():
    rows = []
    for slug in PAGES:
        changed = last_changed(slug)
        for lang in LANGS:
            loc = SITE["base_url"] + "/" + ("en/" if lang == "en" else "") + (slug + "/" if slug else "")
            bn = SITE["base_url"] + "/" + (slug + "/" if slug else "")
            en = SITE["base_url"] + "/en/" + (slug + "/" if slug else "")
            rows.append(
                f"  <url><loc>{loc}</loc><lastmod>{changed}</lastmod>"
                f'<xhtml:link rel="alternate" hreflang="bn" href="{bn}"/>'
                f'<xhtml:link rel="alternate" hreflang="en" href="{en}"/></url>'
            )
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(rows) + "\n</urlset>\n",
        encoding="utf-8",
    )


def prepare_output():
    """Start from an empty output folder, then copy assets and the live app."""
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "assets", OUT / "assets", ignore=shutil.ignore_patterns("README.md", ".*"))
    shutil.copytree(SRC / "app", OUT / "app", ignore=shutil.ignore_patterns("README.md", ".*"))


if __name__ == "__main__":
    prepare_output()
    built = render_all()
    write_sitemap()
    print(f"Built {len(built)} pages into {OUT}")
