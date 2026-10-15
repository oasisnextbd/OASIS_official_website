#!/usr/bin/env python3
"""Build the VenGuard website (Bangla default, English) into an output folder.

    pip install -r requirements.txt
    python3 venguard/tools/build.py [OUTPUT_DIR]     # default: _site/VENGuard

Normally run through scripts/build.py, which assembles the whole site.

Sources (all under venguard/):
    site.json        settings: prices, contacts, claims, tracking IDs, gallery
    templates/       Jinja2 templates; copy is written once with both languages:
                     {{ t("বাংলা লেখা", "English text") }}
    assets/          CSS, JS, images, documents (copied as-is)
    static/          files published as-is at the VenGuard root (legacy URLs)
    /VENGuard/app/      redirect to the VenGuard app (repository oasisnextbd/venguard-app)
Output:
    <out>/<page>/index.html      Bangla
    <out>/en/<page>/index.html   English
    <out>/sitemap.xml, <out>/assets/js/config.js (generated from site.json)
"""
import json
import pathlib
import shutil
import sys

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from markupsafe import Markup

SRC = pathlib.Path(__file__).resolve().parent.parent          # venguard/
REPO = SRC.parent
OUT = pathlib.Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else REPO / "_site" / "VENGuard"
SITE = json.loads((SRC / "site.json").read_text(encoding="utf-8"))

# slug -> template. "" is the homepage. Order is also the sitemap order.
PAGES = {
    "": "home.html",
    "home-kit": "home-kit.html",
    "how-it-works": "how-it-works.html",
    "pre-order": "pre-order.html",
    "pre-order/thank-you": "thank-you.html",
    "landlords-restaurants": "landlords-restaurants.html",
    "dealers": "dealers.html",
    "about": "about.html",
    "faq": "faq.html",
    "contact": "contact.html",
    "guides": "guides.html",
    "agro-marine": "agro-marine.html",
    "privacy": "privacy.html",
    "terms": "terms.html",
    "refund-policy": "refund-policy.html",
    "cookies": "cookies.html",
}
NOINDEX = {"pre-order/thank-you"}
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

            def num(n, _lang=lang):
                s = f"{n:,}"
                return s.translate(BN_DIGITS) if _lang == "bn" else s

            def url(target_slug, target_lang=None, _lang=lang, _root=root):
                tl = target_lang or _lang
                path = ("en/" if tl == "en" else "") + (target_slug + "/" if target_slug else "")
                return _root + path

            def claim(key):
                return bool(SITE["claims"].get(key + "_confirmed"))

            html = env.get_template("pages/" + tpl).render(
                lang=lang, slug=slug, root=root, site=SITE,
                t=t, num=num, url=url, claim=claim,
                noindex=slug in NOINDEX,
                canonical=SITE["base_url"] + "/" + ("en/" if lang == "en" else "") + (slug + "/" if slug else ""),
                alt_bn=SITE["base_url"] + "/" + (slug + "/" if slug else ""),
                alt_en=SITE["base_url"] + "/en/" + (slug + "/" if slug else ""),
            )
            d = page_dir(lang, slug)
            d.mkdir(parents=True, exist_ok=True)
            (d / "index.html").write_text(html, encoding="utf-8")
            built.append((lang, slug))
    return built


def write_sitemap():
    rows = []
    for slug in PAGES:
        if slug in NOINDEX:
            continue
        for lang in LANGS:
            loc = SITE["base_url"] + "/" + ("en/" if lang == "en" else "") + (slug + "/" if slug else "")
            bn = SITE["base_url"] + "/" + (slug + "/" if slug else "")
            en = SITE["base_url"] + "/en/" + (slug + "/" if slug else "")
            rows.append(
                f"  <url><loc>{loc}</loc>"
                f'<xhtml:link rel="alternate" hreflang="bn" href="{bn}"/>'
                f'<xhtml:link rel="alternate" hreflang="en" href="{en}"/></url>'
            )
    (OUT / "sitemap.xml").write_text(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" '
        'xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' + "\n".join(rows) + "\n</urlset>\n",
        encoding="utf-8",
    )


def write_js_config():
    public = {
        "deposit_bdt": SITE["preorder"]["deposit_bdt"],
        "preorder_open": SITE["preorder"]["open"],
        "endpoints": {k: v for k, v in SITE["endpoints"].items() if not k.startswith("_")},
        "tracking": {k: v for k, v in SITE["tracking"].items() if not k.startswith("_")},
        "whatsapp_number": SITE["contact"]["whatsapp_number"],
        "app_web_url": SITE["app"]["web_url"],
    }
    (OUT / "assets/js/config.js").write_text(
        "/* Generated by venguard/tools/build.py from venguard/site.json. Do not edit by hand. */\n"
        "window.VG_CONFIG = " + json.dumps(public, indent=2, ensure_ascii=False) + ";\n",
        encoding="utf-8",
    )


def write_app_redirect():
    """Keep the old /VENGuard/app/ address working: send visitors to the VenGuard app (its own repository)."""
    target = SITE["app"]["web_url"] + "#/welcome"
    out = OUT / "app"
    out.mkdir(parents=True, exist_ok=True)
    (out / "index.html").write_text(
        "<!DOCTYPE html>\n<html lang=\"bn\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "<meta name=\"robots\" content=\"noindex\">\n"
        f"<meta http-equiv=\"refresh\" content=\"0; url={target}\">\n"
        f"<link rel=\"canonical\" href=\"{target}\">\n<title>VenGuard app</title>\n</head>\n<body>\n"
        f"<p><a href=\"{target}\">VenGuard অ্যাপ খুলুন · Open the VenGuard app</a></p>\n</body>\n</html>\n",
        encoding="utf-8",
    )


def prepare_output():
    """Start from an empty output folder, then copy assets and static files."""
    if OUT.exists():
        shutil.rmtree(OUT)
    shutil.copytree(SRC / "assets", OUT / "assets", ignore=shutil.ignore_patterns("README.md", ".*"))
    for f in (SRC / "static").iterdir():
        shutil.copy2(f, OUT / f.name)


if __name__ == "__main__":
    prepare_output()
    built = render_all()
    write_sitemap()
    write_js_config()
    write_app_redirect()
    print(f"Built {len(built)} pages into {OUT}")
