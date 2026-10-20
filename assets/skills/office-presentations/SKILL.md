---
description: Create, inspect, edit, and render PowerPoint .pptx slide decks with the bundled Office helper CLI.
---

# Presentations (.pptx)

Build local PowerPoint decks with native text, tables, charts, and images, then render them to verify layout. This skill uses `python-pptx`; it does not use the `@oai/artifact-tool` runtime and does not edit Google Slides.

## Before any file work

1. Call the `office_status` tool.
2. Use the `python` and `cli` values from the `## Office runtime` JSON block at the end of this file.
3. If no compatible Python is reported, stop and tell the user. Do not deliver a deck you could not create or verify.

## Create

```bash
"<python>" "<cli>" pptx create --spec "<spec.json>" --out "<output.pptx>"
```

```json
{
  "title": "Annual Review",
  "author": "DSH Office Suite",
  "slides": [
    { "layout": "title", "title": "Annual Review", "subtitle": "FY2026 · Internal" },
    { "layout": "bullets", "title": "Highlights", "bullets": ["Revenue up 18.4%", { "text": "New markets", "level": 1 }] },
    {
      "layout": "blank",
      "title": "Revenue by quarter",
      "table": { "headers": ["Quarter", "Revenue"], "rows": [["Q1", 100], ["Q2", 128]] },
      "chart": {
        "type": "column",
        "title": "Quarterly revenue",
        "left": 3.6,
        "top": 3.5,
        "width": 8.8,
        "height": 3.0,
        "categories": ["Q1", "Q2"],
        "series": [{ "name": "Revenue", "values": [100, 128] }]
      },
      "image": { "path": "<absolute image path>", "left": 0.8, "top": 3.9, "width": 2.2 }
    }
  ]
}
```

Layouts: `title`, `bullets`, `section`, `title_only`, `blank`. The deck is 16:9 (13.333 × 7.5 in).

- `bullets` uses the body placeholder; items may be strings or `{ "text", "level" }`.
- `blank` / `title_only` place content with a vertical cursor starting at 1.5 in. A table advances the cursor; a chart without `top` starts at the cursor and gets a fitted height; an image without `top` starts at the cursor. Explicit `left`/`top`/`width`/`height` in inches are honored, so use them when combining elements side by side.
- A blank slide with a `title` gets a generated title textbox (32 pt bold).
- Chart types: `column`, `line`, `pie` (`bar` is accepted as a column alias). Each series needs a `name` and numeric `values`.

## Read

```bash
"<python>" "<cli>" pptx read --input "<file.pptx>"
```

Returns slide count, per-slide title, all text, tables, chart categories/series, and image counts. Use it to confirm edits and to inventory a deck you did not create.

## Edit

```bash
"<python>" "<cli>" pptx edit --input "<file.pptx>" --spec "<edit.json>" --out "<file-edited.pptx>"
```

```json
{
  "replace": [{ "find": "18.4%", "replace": "21.0%" }],
  "slides": [{ "layout": "bullets", "title": "Next steps", "bullets": ["Finalize acceptance", "Publish docs"] }],
  "core": { "title": "Annual Review (final)" }
}
```

`replace` edits text runs. It cannot edit text split across runs, chart data labels, notes, or tables; use table replacement only by recreating the table on a new slide. New slides are appended.

## Render and verify

```bash
"<python>" "<cli>" pptx render --input "<file.pptx>" --out-dir "<render-dir>"
```

The renderer prefers Microsoft PowerPoint COM on Windows and LibreOffice otherwise, producing a PDF and one PNG per slide. Inspect every slide for:

- title and body within margins;
- tables and charts not overlapping each other or images;
- legible font sizes (body ≥ 18 pt, title ≥ 28 pt);
- no clipped text or empty placeholders;
- chart labels/categories correct.

If the render shows overlap, fix coordinates and re-render. Do not claim a deck is presentation-ready if it was never rendered.

## Design rules

- One idea per slide. Prefer 3–6 bullets; split dense content.
- Use sentence case, parallel phrasing, and real figures only.
- Use native tables/charts, not screenshots of spreadsheets where a native chart fits.
- Keep a consistent palette and alignment grid; do not decorate with random shapes.
- Choose `blank` for composed layouts and `bullets`/`title` for simple text slides.

## Not supported

- Google Slides / Google Drive editing.
- Slide master, theme, template, or layout editing.
- Animations, transitions, speaker notes, hyperlinks, audio/video, SmartArt.
- Editing existing chart data in place, or replacing table cells in place.
- `@oai/artifact-tool` helpers, montage/integrity gates, or template-fidelity workflows.
- PowerPoint-perfect pagination; rendering is a fidelity check.
