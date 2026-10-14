#!/usr/bin/env python3
"""Assemble the whole website into _site/ — exactly what GitHub Pages publishes.

    pip install -r requirements.txt
    python3 scripts/build.py
    python3 -m http.server 8000 -d _site      # preview at http://localhost:8000/

Layout of the published site (URLs are stable; do not change them casually):
    /                    OASIS main site            ← oasis-site/
    /VENGuard/           VenGuard website (bn)      ← venguard/  (built by venguard/tools/build.py)
    /VENGuard/en/        VenGuard website (en)
    /VENGuard/app/       VenGuard Connected app     ← apps/connected/
"""
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
    (OUT / ".nojekyll").write_text("")  # serve files as-is (no Jekyll processing)
    files = sum(1 for p in OUT.rglob("*") if p.is_file())
    print(f"Site assembled in {OUT.relative_to(REPO)}/ ({files} files)")


if __name__ == "__main__":
    main()
