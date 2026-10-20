# Capability report

What this plugin can do, verified 2026-10-21 on Windows by reading the code and
running the helper CLI. Unverified items are marked as such.

## Runtime model

Every operation goes through one spec-driven helper CLI, addressed by the
absolute `python` and `cli` paths the host appends to each skill body as the
`## Office runtime` block. It prints one JSON object; failures print JSON on
stderr and exit non-zero.

```
<python> <cli> {docx|pptx|xlsx|pdf} {create|read|render}
<python> <cli> xlsx recalc | status
```

`create` takes `--spec --out`, `read` takes `--input`, `render` takes
`--input --out-dir`; all accept `--json-out`, `xlsx read` also `--data-only`.
The CLI has no `edit` verb on purpose: changing a file is a set of narrow pack
scripts (one operation each), so a new capability is a new script rather than a
new verb in a shared dispatcher that every format has to keep in step.
Every verb prints one JSON object; failures print JSON on stderr, exit non-zero.
These verbs are the common path, not the ceiling: specialised work uses the pack
scripts (`scripts/`, `container_tools/`), and the rest uses short snippets
against the installed libraries, run with the same `python` and verified the same
way. A missing verb is a missing shortcut, not a missing capability.

## Packs and shared layer

| Format | Router | Pack helpers | CLI verbs |
| --- | --- | --- | --- |
| DOCX | `assets/skills/office-documents/SKILL.md` | `scripts/` — OOXML kit, comments, fields, tracked changes, template styles, accessibility audit, text/blocks/properties edits | create, read, render |
| PDF | `assets/skills/office-pdf/SKILL.md` | `scripts/` — text/table extraction, page rendering, form inspect/fill, page ops, region redaction | create, read, render |
| PPTX | `assets/skills/office-presentations/SKILL.md` | `container_tools/` — OOXML helpers, preview rendering, text/slide/properties edits | create, read, render |
| XLSX | `assets/skills/office-spreadsheets/SKILL.md` | `container_tools/` — workbook inspection, diff, recalculation gate, sheet/cell/row/style/chart edits | create, read, render, recalc |
| live XLSX | `assets/skills/excel-live-control/SKILL.md` | `container_tools/live_excel.py` — attach to a running Excel/WPS window: read, write, formulas, styles, tables, charts, recalc, save | — |
| shared | `assets/skills/shared/` | `common-workflow.md`, `annotation-recipes.md`, `check_runtime.py`, `scripts/ensure_raster_image.py` | — |

The four routers register through `ctx.skills.registerProvider` in
`src/index.ts`; `/` commands, labels and skill names come from
`src/features.ts`. Helper scripts are argparse-based with `--help`.

## What each format does

- **DOCX** — create from a block spec: headings, paragraphs, bullets, numbered
  lists, tables, images, LaTeX equations (OMML, fallbacks counted in
  `equation_fallbacks`), quotes, page breaks, spacers, header/footer, page size,
  margins. Read returns styled text, tables, images, equations, counts. Edits run
  as pack scripts (text replacement, block append, core properties).
- **PDF** — create with reportlab; the CJK font is auto-detected (named in the
  report, e.g. `OfficeCJK`). Read returns page text, metadata, word counts and
  form fields; OCR is not bundled (`ocr.available: false`). Edits run as pack
  scripts: metadata, rotation, page order, merge, page removal, region
  redaction. Render uses PyMuPDF.
- **PPTX** — create 16:9 decks: layouts `title`, `bullets`, `section`,
  `title_only`, `blank`; bullet levels, tables, bar/column/line/pie charts,
  images. Read returns slides, text, tables and charts but **no shape geometry**,
  so annotation work computes overlap with python-pptx. Edits run as pack
  scripts: run-level text replacement, added slides, core properties.
- **XLSX** — create sheets with rows, formulas, styles (cell or `A1:B2` range),
  widths, row heights, frozen panes, merges, charts, anchored images. Read
  returns rows, formulas with cached values, merges, charts, images, dimensions.
  Edits run as pack scripts: sheets, cells, appended rows, range styles, charts,
  images, rows.
- **Live XLSX** — `excel-live-control` drives a workbook that is already open in
  Excel or WPS Spreadsheets through COM (`GetActiveObject`, Windows PowerShell
  5.1), never by writing the file behind the user's back: `info`, `read_range`,
  `write_range`, `set_formula`, `style_range`, `add_chart`, `add_table`,
  `recalc`, `save`, `close`, plus `--diagnose`. It refuses to start a hidden
  instance for normal work and reports exactly which sheet and range it touched;
  sheet create/rename/delete/reorder are deliberately absent (use a tab the user
  has, or the file route).

## Delivery rule

Hand the file over with `present` and summarise the change in one sentence. A
bare path is not delivery: `.docx`/`.pptx`/`.xlsx`/`.pdf` links in the transcript
render as "二进制文件，无法显示改动". Edits go to `<original>-edited.<ext>` (or
the name the user asked for); never overwrite the original, report both paths.

## Annotations

A preview arrives as `<office-annotations>` wrapping a JSON array of items keyed
`target`, `fileName`, `requirement`, `text` and a 0–1 `region`. `docx`/`pptx`
add `page` (rendered PDF page; pptx one slide per page) and `pdf` adds a 1-based
PDF `page` plus `imageName`. `xlsx` items are always `unmapped: true` with
`text: ""` and no page/sheet/range: resolve cells from the `imageName` screenshot
and `xlsx read`, and state the resolved sheet/A1 range before editing. Treat it
as a change request — locate, smallest edit, re-render, confirm. Recipes:
`assets/skills/shared/annotation-recipes.md`; unmappable payloads are reported,
never guessed.

## Renderer dependency

- `docx`, `pptx` and `xlsx` rendering needs an office suite: Microsoft Office
  (Word/PowerPoint/Excel over COM), WPS Office (`KWps`/`KWpp`/`Ket` over COM) or
  LibreOffice (headless conversion). `render` names the one it used in its
  `renderer` field (`microsoft-office`, `kingsoft-wps`, `libreoffice`). With none
  installed it exits non-zero: `no document renderer found: install LibreOffice,
  Microsoft Office, or WPS Office`.
- `xlsx recalc` needs a real calculation engine: Excel or WPS Spreadsheets over
  COM. It reports `renderer` and the count of cached values it filled in.
- `pdf render` needs no external renderer; PyMuPDF rasterises it directly.
- The PPTX pack's `container_tools/preview_render.py` is a geometry-only draft:
  it redraws shapes, text boxes and images from the package with PyMuPDF and
  labels itself `draft-preview` / `geometry-only`. It proves placement, not
  typography (bullet glyphs are not drawn), and `render_slides.py` prefers the
  real renderer whenever one exists.
- **This machine renders through WPS Office.** `office_status` reports
  `kingsoft_wps: {writer, presentation, spreadsheet}` from `wps.exe`/`wpp.exe`/
  `et.exe` under `%LOCALAPPDATA%\Kingsoft\WPS Office\<version>\office6`;
  `docx`/`pptx`/`xlsx render` return `"renderer": "kingsoft-wps"`, and `xlsx
  recalc` fills cached values through `Ket.Application`.
- `assets/skills/shared/scripts/ensure_raster_image.py` turns SVG, a chosen PDF
  page, or a raster file into a PNG (PyMuPDF for vectors, Pillow for rasters), so
  artwork can be embedded and then looked at. It never overwrites its input.
- `assets/skills/shared/check_runtime.py` imports every package from
  `python/requirements.txt` and runs `<cli> status`; it exits non-zero on a
  missing package or broken CLI, and 4 with `--require-renderer` when no renderer
  is installed (a missing renderer is otherwise only a warning).

## Verification evidence

| Check | Result |
| --- | --- |
| Packages on the runtime venv (3.13.12, `~/.dsh/office/runtime/venv`) | 10/10 import — python-docx 1.2.0, openpyxl 3.1.5, python-pptx 1.0.2, pypdf 6.21.1, reportlab 4.5.1, pdfplumber 0.11.9, PyMuPDF 1.28.2, Pillow 11.3.0, latex2mathml 3.81.1, mathml2omml 0.0.2 |
| `check_runtime.py` (venv / `--require-renderer` / bare `py -3.14`) | exit 0 + renderer warning / exit 4 / exit 1 listing the 8 missing packages and the pip remedy |
| DOCX create / read / `replace_text.py` / `append_blocks.py` | ok — counts returned, styles preserved, `replacements: 1`, `appended: 1`, equation intact |
| DOCX / PPTX render | ok through WPS — `renderer: kingsoft-wps`, DOCX 2 pages, PPTX 3 pages, PNGs opened and checked |
| PPTX create / read / `add_slides.py` | ok — 3 slides, texts and charts read back |
| XLSX create / read / `set_cells.py` | ok — formula read back uncached, one cell written |
| XLSX recalc | ok through WPS — `renderer: kingsoft-wps`, 34 cached values filled, `A3 = 7` after `CalculateFull` |
| `ensure_raster_image.py` | ok — 120×60 SVG at `--dpi 300` → 500×250, `--page` on a 2-page PDF, `--width 400` upscale, JSON errors on missing/unwritable input |
| `excel-live-control/container_tools/live_excel.py` | ok against WPS — attach refusal with remediation when nothing runs; `write_range` A1:B3 (6 cells), `set_formula` C1, `read_range` values `[[10,20,30],[30,40,null],[50,60,null]]`, `save` 9,268 bytes, `--diagnose` lists the workbook/sheet, `close --quit-app` refuses a dirty book, `--discard` leaves zero `et.exe` |
| PDF create / read / render / `metadata.py` / `page_ops.py` / `redact_region.py` | ok — CJK font applied, metadata written, merge→remove→rotate, region redaction removed 170 chars and 11 drawings, `page-1.png` produced |
| Annotation geometry helpers | pymupdf rect conversion, python-pptx overlap scan, A1 text matching run against those files |
| Forbidden-vocabulary grep over the delivered docs | empty |

Not claimed (no evidence here): installer or self-heal timings, live GUI
interaction (`/` menu, chip, sidebar preview, annotation overlay), and macOS/Linux
renderer support.

## Explicitly out of scope

- Google Docs/Slides/Sheets or Drive-backed editing; visual verification of
  docx/pptx/xlsx without a renderer (skills say so instead of claiming a page was
  inspected).
- In-place PDF page-content editing (rebuild from a `pdf create` spec and say
  so); OCR and scanned-PDF text extraction.
- PPTX animations, speaker notes, slide masters; XLSX pivots, macros, data
  validation, conditional formatting — no spec keys or verbs in the helper.
- Formula evaluation without Microsoft Excel or WPS Spreadsheets; macOS/Linux
  installation and renderer behaviour (only Windows was exercised).
