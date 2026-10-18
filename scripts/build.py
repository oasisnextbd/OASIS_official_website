#!/usr/bin/env python3
"""Assemble the whole website into _site/ — exactly what GitHub Pages publishes.

    pip install -r requirements.txt
    python3 scripts/build.py
    python3 -m http.server 8000 -d _site      # preview at http://localhost:8000/

Layout of the published site (URLs are stable; do not change them casually):
    /                    OASIS main site            ← oasis-site/
    /VENGuard/           VenGuard website (bn)      ← venguard/  (built by venguard/tools/build.py)
    /VENGuard/en/        VenGuard website (en)
    /VENGuard/app/       redirect to the VenGuard app (repository oasisnextbd/venguard-app)
    /team/               VenGuard team dashboard    ← team-dashboard/ (not linked anywhere, not
                         indexed; data in Firestore behind Google sign-in and the team list)
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
    subprocess.run([sys.executable, str(REPO / "venguard/tools/build.py"), str(OUT / "VENGuard")], check=True)
    build_dashboard(OUT / "team")
    (OUT / ".nojekyll").write_text("")  # serve files as-is (no Jekyll processing)
    files = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"Site assembled in {OUT.relative_to(REPO)}/ ({files} files)")


def build_dashboard(dest):
    """Copies team-dashboard/ to /team/ and puts its settings (config.json) into the page."""
    src = REPO / "team-dashboard"
    shutil.copytree(src, dest, ignore=shutil.ignore_patterns("README.md", "config.json", "tests"))
    cfg = json.loads((src / "config.json").read_text(encoding="utf-8"))
    cfg.pop("_readme", None)
    fb = "https://www.gstatic.com/firebasejs/11.10.0/"
    head = (
        f"<script>window.VG_DASH = {json.dumps(cfg)};</script>\n"
        # Start the slow downloads and connections while the page is still loading.
        + "".join(f'<link rel="modulepreload" href="{fb}firebase-{m}.js">\n' for m in ("app", "auth", "firestore"))
        + '<link rel="preconnect" href="https://firestore.googleapis.com">\n'
        + '<link rel="preconnect" href="https://securetoken.googleapis.com">\n'
        + '<link rel="preconnect" href="https://identitytoolkit.googleapis.com">\n'
    )
    page = dest / "index.html"
    marker = "<!-- scripts/build.py inserts window.VG_DASH (config.json) and preload hints here. -->\n"
    html = page.read_text(encoding="utf-8")
    assert marker in html, "team-dashboard/index.html lost its config marker"
    page.write_text(html.replace(marker, head), encoding="utf-8")


if __name__ == "__main__":
    main()
