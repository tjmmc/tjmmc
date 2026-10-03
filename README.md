# tjmmc
The TJ Math Modeling Club website, [tjmmc.org](https://tjmmc.org). Built with Jekyll and served by GitHub Pages from `main`.

Set up the environment locally with the instructions [here](static/setup.md).

## Editing the site

Most updates are data edits; you don't need to touch any HTML.

| To change | Edit |
|---|---|
| Press coverage (home page shows entries with `home: true`) | `_data/press.yml` |
| Videos | `_data/videos.yml` |
| Photos on the home page | `_data/photos.yml` (files in `static/images/photos/`) |
| M3 results strip | `_data/record.yml` |
| Upcoming dates (past dates hide themselves) | `_data/events.yml` |
| Officers | `_data/officers.yml` |
| TJM² sponsors' logos (hidden until there's one) | `_data/partners.yml` |
| TJM² FAQ | `_data/tjm2_faq.yml` |
| Links (email, Discord, Instagram, forms, PDFs) | `_data/links.yml` |
| Lectures and MATLAB decks | `_data/lectures.yml`, `_data/matlab.yml` |

Page layouts live in `_layouts/default.html` and `pages/`, shared pieces in `_includes/`, and all styles in `static/css/styles.css`.

## Print materials

The TJM² sponsorship packet and flier are built from HTML in [`materials/`](materials/README.md) and rendered to `static/media/` with `python3 materials/render.py`.

Short links for emails:
- **tjmmc.org/u/sponsor:** the sponsorship packet.
- **tjmmc.org/u/flier:** the flier, which is deliberately not linked anywhere on the site.

Their targets are set in `_data/links.yml`.

## Design

The site shares the club's brand with the 2026 shirt, sponsorship packet and TJM² flier:
- **Type:** Sora for everything; an italic serif only for "Fig. N" labels.
- **Colours:** warm paper, black art plates, and vortex red and blue as accents.
- **Art:** the hero is a simulated Kármán vortex street (flow past a cylinder at Re = 160).

2026-27 Webmaster: Neil Yerra

V2 built by Isaac Leetyn and Neil Yerra

### Past webmasters
2025-26 Webmaster: Petr Kisselev
