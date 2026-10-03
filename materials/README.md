# Print materials: TJM² sponsorship packet and flier

This folder holds the source for the two PDFs the club sends out. Jekyll ignores it (see `exclude` in `_config.yaml`), so nothing here appears on the website.

| Edit this | Renders to | Short link |
|---|---|---|
| `sponsor-packet/packet.html` (2 pages) | `static/media/TJM2-2026-Sponsorship.pdf` | tjmmc.org/u/sponsor (also linked on the site) |
| `flier/flier.html` (1 page) | `static/media/TJM2-2026-Flier.pdf` | tjmmc.org/u/flier (not linked on the site) |

## Editing

1. Open the `.html` file in Chrome to preview it as you edit. Each page is a fixed 8.5 × 11 in sheet.
2. Change the text in place. The styles are at the top of each file, and the shared colours and fonts are in `brand/tokens.css`.
3. From the repo root, run:
   ```
   python3 materials/render.py              # both PDFs
   python3 materials/render.py --only flier
   python3 materials/render.py --png /tmp/previews   # also writes page PNGs (needs pdftoppm)
   ```
   It finds Chrome automatically on macOS, Windows and Linux; otherwise pass `--chrome PATH`.
4. Check that nothing overflows the page, then commit the HTML and the PDF together.

Keep each page to one sheet. Text that runs long gets clipped at the page edge rather than flowing to a new page, so look at the PDF after every edit.

## Design rules

These match the website and the 2026 shirt.

- **Sora** for everything. The bundled static weights are 400, 450, 550, 600 and 650; don't use other weights.
- **Italic serif only for "Fig. N" labels** (`class="fig"`). Don't use it for body text, dates or captions.
- **Colours** are the variables in `brand/tokens.css`. Red and blue are accents, and the black art plate is the only dark block on a page.
- **Fonts are bundled** in `brand/fonts/` (Sora and Libre Baskerville, both under the SIL Open Font License, see `OFL-*.txt`), so every machine renders the same PDF.
  - Sora is cut into static weights because Chrome embeds variable fonts in PDFs as Type 3 outlines, which some viewers render poorly.
  - To check the embedding, run `pdffonts static/media/TJM2-2026-Flier.pdf`. It should list only "CID TrueType" fonts.

## Assets

- `brand/art/vortex-band*.jpg` is the vortex-street art and `brand/art/fig1-mark.svg` is the logo mark. Both come from the 2026 shirt design: flow past a cylinder, simulated with lattice Boltzmann.
- `flier/qr-tjm2.svg` points to `https://tjmmc.org/tjm2/`. To regenerate it:
  ```
  pip install segno
  python3 -c "import segno; segno.make('https://tjmmc.org/tjm2/', error='m').save('materials/flier/qr-tjm2.svg', scale=10, border=0, dark='#171717', light=None)"
  ```
  After regenerating, test the QR code with a phone camera.

## Next year

Copy the two HTML files, update the dates and numbers, and render to new file names, for example `TJM2-2027-Flier.pdf`. Then point `flier` and `sponsor_packet` in `_data/links.yml` at the new files, and the `/u/` short links will follow.
