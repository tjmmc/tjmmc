"""Render the TJM² sponsorship packet and flier to PDF with headless Chrome.

  python3 materials/render.py                  # both PDFs into static/media/
  python3 materials/render.py --only flier     # just one
  python3 materials/render.py --png previews   # also write PNG previews (needs pdftoppm)

The PDFs are what tjmmc.org/u/sponsor and tjmmc.org/u/flier serve. Commit them along with
your HTML changes. Git keeps the old versions.
"""
import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
DOCS = {
    "packet": (HERE / "sponsor-packet" / "packet.html", REPO / "static" / "media" / "TJM2-2026-Sponsorship.pdf"),
    "flier": (HERE / "flier" / "flier.html", REPO / "static" / "media" / "TJM2-2026-Flier.pdf"),
}
CHROME_CANDIDATES = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    "google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome",
]


def find_chrome(explicit=None):
    for c in [explicit, os.environ.get("CHROME")] + CHROME_CANDIDATES:
        if not c:
            continue
        if os.path.isfile(c):
            return c
        found = shutil.which(c)
        if found:
            return found
    sys.exit("Couldn't find Chrome. Install it or pass --chrome /path/to/chrome.")


def render(chrome, html, pdf):
    pdf.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([chrome, "--headless=new", "--disable-gpu", "--no-pdf-header-footer",
                    "--allow-file-access-from-files", "--run-all-compositor-stages-before-draw",
                    "--virtual-time-budget=5000", f"--print-to-pdf={pdf}", html.as_uri()],
                   check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"{pdf.relative_to(REPO)}  ({pdf.stat().st_size / 1e6:.2f} MB)")


def previews(pdf, out_dir):
    if not shutil.which("pdftoppm"):
        print("  (no pdftoppm, so skipping previews; it ships with poppler)")
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-png", "-r", "110", str(pdf), str(out_dir / pdf.stem)], check=True)
    print(f"  previews in {out_dir}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", choices=sorted(DOCS))
    ap.add_argument("--png", metavar="DIR", help="also write PNG previews of each page into DIR")
    ap.add_argument("--chrome", help="path to Chrome or Chromium")
    a = ap.parse_args()
    chrome = find_chrome(a.chrome)
    for name in [a.only] if a.only else sorted(DOCS):
        html, pdf = DOCS[name]
        render(chrome, html, pdf)
        if a.png:
            previews(pdf, Path(a.png).resolve())


if __name__ == "__main__":
    main()
