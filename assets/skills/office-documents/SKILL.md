---
description: Create, inspect, edit, and render Word .docx documents with the bundled Office helper CLI.
---

# Documents (.docx)

Create, read, edit, and render local Word documents. This skill produces Office Open XML files; it does not edit Google Docs and does not use the artifact-tool runtime.

## Before any file work

1. Call the `office_status` tool.
2. Use the `python` and `cli` values from the `## Office runtime` JSON block at the end of this file. These are verified absolute paths; do not assume `python` or `soffice` is on `PATH`.
3. If the runtime block says no compatible Python was found, stop and tell the user to run the package install/rebuild step. Do not fabricate a document or claim success.

Quote every path. Windows paths and paths containing spaces, Chinese characters, or `&` are supported.

## Create

Write a JSON spec in the user's workspace, then run:

```bash
"<python>" "<cli>" docx create --spec "<spec.json>" --out "<output.docx>"
```

Minimal spec:

```json
{
  "title": "Quarterly Report",
  "subtitle": "Internal review",
  "author": "Prepared by DSH Office Suite",
  "header": "Confidential",
  "footer": "Page 1",
  "page_size": "A4",
  "orientation": "portrait",
  "blocks": [
    { "type": "heading", "level": 1, "text": "Executive summary" },
    { "type": "paragraph", "text": "Revenue grew 18.4% year over year." },
    { "type": "bullets", "items": ["Renewal rate 92%", "42 new customers"] },
    { "type": "table", "headers": ["Metric", "Q3"], "rows": [["Revenue", "12,480,000"], ["Gross margin", "71.2%"]] },
    { "type": "equation", "latex": "\\frac{a^2+b^2}{c^2}" },
    { "type": "page_break" }
  ]
}
```

Supported block types: `heading` (`level` 0–9), `paragraph` (`bold`, `italic`, `size`, `color`, `align`, `style`), `bullets`, `numbered`, `table` (`headers`, `rows`, optional `style`, default `Table Grid`), `image` (`path`, optional `width` in inches), `equation` (`latex`), `quote`, `page_break`, `spacer`. Page fields: `page_size` (`Letter` or `A4`), `orientation`, margins in inches (`top_margin`, `bottom_margin`, `left_margin`, `right_margin`).

LaTeX equations are converted to native OMML. Simple fractions, superscripts, subscripts, roots, and Greek symbols work; unsupported LaTeX silently falls back to italic text and increments `equation_fallbacks`. Check that counter when the equation matters.

## Read

```bash
"<python>" "<cli>" docx read --input "<file.docx>"
```

Returns title, author, paragraphs with styles, headings, tables, image count, equation count, and page dimensions. Use it to verify a file you did not create.

## Edit

Copy-then-edit: the CLI never modifies the input in place.

```bash
"<python>" "<cli>" docx edit --input "<file.docx>" --spec "<edit.json>" --out "<file-edited.docx>"
```

```json
{
  "replace": [{ "find": "37 customers", "replace": "42 customers" }],
  "blocks": [{ "type": "heading", "level": 1, "text": "Appendix" }],
  "core": { "title": "Quarterly Report (final)", "author": "Finance" }
}
```

`replace` works on runs and falls back to rebuilding a paragraph when the text spans runs. It cannot reliably edit headers/footers, comments, tracked changes, content controls, or fields; those are unsupported (see below). Adding blocks appends them at the end of the body.

## Render and verify

```bash
"<python>" "<cli>" docx render --input "<file.docx>" --out-dir "<render-dir>"
```

The renderer prefers Microsoft Word COM on Windows and LibreOffice otherwise. It writes a PDF and one PNG per page. Open the PNGs with your image-viewing tool and inspect: title/heading hierarchy, table geometry, page breaks, missing glyphs, overflowing text, header/footer, and equation rendering.

If no renderer is available, report "not visually verified" and offer the file. Do not claim layout quality you did not see.

## Quality rules

- Write real content from the user's request; never invent metrics, citations, or names.
- Use one consistent heading hierarchy. Do not skip levels.
- Keep tables narrow enough for the page; abbreviate long headers.
- Verify a non-Latin script renders in the chosen fonts before delivering.
- Prefer native Word structures (headings, tables, lists) over hand-positioned text.

## Not supported

- Google Docs / Google Drive import or native online editing.
- Comments, tracked changes, redlining, accept/reject workflows.
- Existing headers/footers, footnotes, TOC fields, cross-references, content controls, protection, watermarks, redaction.
- In-place editing, macros, encrypted documents, `.doc` input.
- Word-perfect pagination or template cloning. `render` is a fidelity check, not a guarantee that Word and LibreOffice paginate identically.
