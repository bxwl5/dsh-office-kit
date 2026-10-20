---
description: Create, read, edit, merge, rotate, and render PDF files with the bundled Office helper CLI.
---

# PDF

Create PDFs, extract their content, edit metadata/pages, and rasterize them for visual verification. This skill handles local files only; OCR and cloud PDF services are out of scope.

## Before any file work

1. Call the `office_status` tool.
2. Use the `python` and `cli` values from the `## Office runtime` JSON block at the end of this file. They are verified absolute paths.
3. If the runtime block reports that no working Python runtime is available, stop and tell the user to run the `node "..."` remedy command it names, then call `office_status` again. Never claim a PDF was produced when the CLI was unavailable.

## Create

```bash
"<python>" "<cli>" pdf create --spec "<spec.json>" --out "<output.pdf>"
```

```json
{
  "title": "Product Brief",
  "author": "DSH Office Suite",
  "page_size": "A4",
  "blocks": [
    { "type": "heading", "level": 1, "text": "Product Brief" },
    { "type": "paragraph", "text": "This PDF contains Chinese, English, numbers, and punctuation." },
    { "type": "bullets", "items": ["Fast", "Local", "Verifiable"] },
    { "type": "table", "headers": ["Item", "Value"], "rows": [["Version", "1.0"], ["Status", "Draft"]] },
    { "type": "image", "path": "<absolute image path>", "width": 4.5 },
    { "type": "page_break" }
  ]
}
```

Supported blocks: `title`, `heading` (`level` 1–2), `paragraph`, `quote`, `bullets`, `numbered`, `table`, `image` (`path`, `width` inches; height is derived at 0.66 aspect), `page_break`, `spacer` (`height` inches). Use `pages: [{ "blocks": [...], "break": true }]` for explicit page grouping.

CJK text uses the first available system font (`msyh`, `simsun`, PingFang, Noto Sans CJK, DejaVu). If no CJK font exists, Chinese characters may render as blanks; verify before delivery.

## Read

```bash
"<python>" "<cli>" pdf read --input "<file.pdf>"
```

Returns `page_count`, `word_count`, metadata, per-page text and character counts, AcroForm field identifiers, and `ocr: { available: false }`. Extraction quality depends on the source PDF (scanned pages have no text layer).

## Edit

```bash
"<python>" "<cli>" pdf edit --input "<file.pdf>" --spec "<edit.json>" --out "<file-edited.pdf>"
```

```json
{
  "metadata": { "Title": "Product Brief (final)", "Author": "DSH Office Suite" },
  "merge": ["<other.pdf>"],
  "rotate": 90,
  "pages": [0],
  "remove_pages": [2]
}
```

- `merge` appends pages from other PDFs.
- `rotate` is degrees clockwise; `pages` limits it to zero-based page indexes.
- `remove_pages` is zero-based and applied to the original pages; merged pages are appended after.
- Metadata keys may be plain (`Title`) or PDF names (`/Title`); the CLI normalizes them.

The input file is never modified.

## Render and verify

```bash
"<python>" "<cli>" pdf render --input "<file.pdf>" --out-dir "<render-dir>" --dpi 110
```

Renders every page to PNG with PyMuPDF. Open the images and check page count, clipping, overlap, missing glyphs, and scanned-page readability. If `read` returns little text and the render shows an image of text, OCR is required; say so instead of pretending the text was extracted.

## Not supported

- OCR / scanned-document text recognition.
- Filling, creating, or flattening AcroForms (field identifiers are reported for inspection only).
- Digital signatures, encryption/password handling, redaction, annotations, bookmarks editing.
- PDF/A, tagged-PDF accessibility repair, or exact reflow of an existing document.
- Google Drive or other online PDF services.
