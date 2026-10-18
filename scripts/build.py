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
    /team/               VenGuard team dashboard    ← backend/team-dashboard/ (not linked anywhere,
                         not indexed; the data stays behind Google sign-in and the Team list)
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
    """Wraps backend/team-dashboard/Index.html (also served as-is in demos) into a hosted page."""
    src = REPO / "backend/team-dashboard"
    cfg = json.loads((src / "hosted.json").read_text(encoding="utf-8"))
    config = {"endpoint": cfg.get("endpoint", ""), "firebase": cfg["firebase"]}
    icons = "../VENGuard/assets/img/"
    head = (
        "<!doctype html>\n<html lang=\"en\">\n<head>\n<meta charset=\"utf-8\">\n"
        "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n"
        "<meta name=\"robots\" content=\"noindex, nofollow\">\n"
        f"<link rel=\"icon\" href=\"{icons}favicon.svg?v=3\" type=\"image/svg+xml\">\n"
        f"<link rel=\"icon\" href=\"{icons}favicon-32.png?v=3\" sizes=\"32x32\">\n"
        f"<link rel=\"apple-touch-icon\" href=\"{icons}apple-touch-icon.png?v=3\">\n"
        f"<script>window.VG_DASH = {json.dumps(config)};</script>\n"
    )
    body = (src / "Index.html").read_text(encoding="utf-8")
    dest.mkdir(parents=True, exist_ok=True)
    (dest / "index.html").write_text(head + body + "\n</html>\n", encoding="utf-8")


if __name__ == "__main__":
    main()
