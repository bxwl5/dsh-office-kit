# Visual verification

**Goal.** See the pages before the user does. A document that parses and a document that looks right are different claims.

## Render

```bash
"<python>" "<cli>" docx render --input "<file.docx>" --out-dir "<render-dir>"
```

Writes one PNG per page and prints their paths plus the renderer it used (`libreoffice-kit`); add `--pdf` to also keep a PDF. Use the same command through `render_docx.py` when you want the JSON report and page list:

```bash
"<python>" "<skill>/render_docx.py" "<file.docx>" --output_dir "<render-dir>" --dpi 150
```

## Inspect

Open every PNG with `read_image` and check, in this order:

1. **Hierarchy** — does the page show the structure the user asked for, at a glance?
2. **Fit** — nothing past the right margin, no clipped table column, no text over a watermark.
3. **Breaks** — no heading alone at the bottom, no orphaned caption, no half-empty page before a section break.
4. **Text** — the words that were meant to change did change, and nothing else moved.
5. **Glyphs** — dashes, quotes, CJK, currency symbols and maths render, not as boxes.
6. **Header and footer** — present, correct, not repeated on a first page that should not have it.

## When no renderer exists

The runtime reports `renderers.can_render.docx: false` because the DSH LibreOffice kit was not found. `render` then exits non-zero with a JSON error naming the missing renderer, and `render_docx.py` exits 3 with `reason: no_renderer`.

In that state:

- Verify structure with `docx read`, `docx_kit.py parts|text|xml` and the audit scripts.
- Tell the user plainly that layout was not visually verified, and that the fix is installing the plugin inside the harness tree (or setting `DSH_LIBREOFFICE_KIT_CLI`), not installing Word/LibreOffice.
- Do not claim a file "looks good" from XML evidence alone.

## After any script edit

Re-render. Package-valid is not page-valid: a caption inserted before the paragraph it describes, a table grown past the margin, a style merge that changed heading sizes — all are invisible to the XML and obvious in the image.

## Comparing revisions

`render_and_diff.py` renders two files and writes a heatmapped difference page. Read the diff images yourself; a ratio is not a conclusion.

## Pitfalls

- Different renderers paginate differently. Compare like with like, and do not promise Word-perfect pagination from a LibreOffice render.
- A render fails silently into a blank page when a font is missing; a blank page is a finding, not a rendering bug. `missing_fonts` / `glyph_fallback` in the render JSON tells you substitution happened.
- Render into a fresh directory; stale PNGs from an earlier run are the classic false pass.
