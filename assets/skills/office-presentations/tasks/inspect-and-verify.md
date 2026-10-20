# Task: inspect and verify a deck

Verification is reading the artefact back and looking at it. The tools below
print one JSON object each; `passed` is the decision.

## 1. What is in the file

```bash
"<python>" "<cli>" pptx read --input deck.pptx
```

Per slide: title, all text, tables as rows, charts with type/title/categories/
series, image count. This is the cheapest sanity check that the content you
meant to write is the content that was written.

## 2. Is the package coherent

```bash
"<python>" "<skill>/container_tools/inspect_presentation_package_integrity.py" --input deck.pptx
```

Checks required parts, slide/master presence, dangling relationships, XML that
does not parse, slide count drift and duplicate parts, then reports part counts
(`slides`, `layouts`, `masters`, `charts`, `notesSlides`, `media`,
`embeddings`). A chart with an `embeddings` count of zero has lost its data.

## 3. Does the layout hold

```bash
"<python>" "<skill>/container_tools/inspect_presentation_layout_geometry.py" --input deck.pptx --json-out geometry.json
```

`fail` findings (block a delivery): shape outside the slide, degenerate size,
text that cannot fit its frame, table outside the slide, chart or table covered
by another shape. `review` findings (read them, then decide): text overlap,
empty placeholder, title under 28 pt, body under 14 pt, heading ending in a full
stop, connector across text, a chart duplicating a table's labels.

Add `--strict` to make review findings blocking for a formal deck.

## 4. Are the numbers real

```bash
"<python>" "<skill>/container_tools/native_chart_title_gate.py" --input deck.pptx
"<python>" "<skill>/container_tools/native_quantitative_chart_gate.py" --input deck.pptx --all-slides
"<python>" "<skill>/container_tools/native_table_arithmetic_gate.py" --input deck.pptx --contracts totals.json
```

- Chart titles: fails on leftover "Chart Title" or an empty title, unless the
  chart is explicitly suppressed.
- Quantitative charts: every declared chart must be a real chart part with a
  readable series, and in the default `portable` mode must carry its embedded
  workbook.
- Table arithmetic: only declared totals are enforced, compared against the
  displayed rounding; columns whose header is not additive (unit price, ratio,
  percent) are skipped rather than summed wrongly.

`totals.json` names the contract explicitly:

```json
{ "contracts": [{ "slide": 4, "table": 1, "total_row": 6, "columns": [1, 2] }] }
```

## 5. Rendering and looking

```bash
"<python>" "<skill>/container_tools/render_slides.py" --input deck.pptx --out-dir preview
```

Writes `slide-NN.png` plus `render.json`. Then `read_image` every PNG — an
unlooked-at render is not verification.

To see the whole deck at once:

```bash
"<python>" "<skill>/template_following_scripts/make_contact_sheet.py" --dir preview --out sheet.png --columns 3
```

or `"<skill>/container_tools/create_montage.py` with an explicit file list.

Look for: clipped text, overlapping blocks, a title that reflowed, a chart whose
point is invisible at thumbnail size, a photograph stretched, a slide with no
title.

## 6. When nothing can render

With no Microsoft Office, WPS Office, or LibreOffice installed
(`office_status` → `renderers.kingsoft_wps` / `microsoft_office` / `libreoffice`),
`render_slides.py` falls back to `--engine draft`, a PyMuPDF geometry preview. It
shows placement, overflow and overlap — not typography or theme chrome. Say so
when reporting: "verified as a geometry preview" is honest, "looks great" from an
approximate render is not.

If even the preview cannot run, the delivery is unverified: report the failing
command, the file's slide count from `pptx read`, and the gate results, and tell
the user which renderer to install for a visual check.

## Gate summary

| Gate | Command | Blocking |
|---|---|---|
| Package integrity | `inspect_presentation_package_integrity.py` | yes |
| Layout geometry | `inspect_presentation_layout_geometry.py` | `fail` always, `review` with `--strict` |
| Chart titles | `native_chart_title_gate.py` | yes |
| Chart data | `native_quantitative_chart_gate.py` | yes for declared slides |
| Table arithmetic | `native_table_arithmetic_gate.py` | yes for declared contracts |
| Template fidelity | `template_source_fidelity_gate.py` | yes when requirements are supplied |
