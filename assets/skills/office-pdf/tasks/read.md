# Read text, tables, and page images

Text extraction reads the page content stream: glyph runs carry position and a font, and a library groups them into words and lines. A page with no text operators (a scan or a photo export) yields nothing no matter which extractor is used — that is a property of the file, not of the tool.

## Fast path: plain text and structure

```bash
"<python>" "<cli>" pdf read --input "<file.pdf>" --json-out "<read.json>"
```

Returns `page_count`, `word_count`, document metadata, per-page text (with character counts), and AcroForm field identifiers. `scripts/render_pages.py --input "<file.pdf>"` adds geometry: page size, rotation, drawings, annotations, widgets, and the characters inside an optional crop.

## Tables and layout with pdfplumber

```bash
"<python>" "<skill>/scripts/extract_text.py" --input "<file.pdf>" --json-out "<tables.json>"
```

Each page reports its characters and detected tables as rows of cell strings. The detection uses the page's ruling lines and word spacing, so a borderless table often comes back as running text; `--layout` keeps the spacing of the original lines for a manual look.

When the detection looks wrong, inspect rather than guess:

```bash
"<python>" - <<'PY'
import pdfplumber
with pdfplumber.open("in.pdf") as pdf:
    page = pdf.pages[0]
    print("chars", len(page.chars), "lines", len(page.lines), "rects", len(page.rects))
    for table in page.find_tables():
        print(table.bbox, table.extract()[:3])
    print(page.extract_text()[:400])
PY
```

`chars`, `lines`, and `rects` tell you whether the table has rules at all. A table with no lines is best read from `extract_text` with `--layout`, where the column gaps survive as spaces.

## Page images

A page may contain embedded rasters that are invisible in text extraction. List them with PyMuPDF:

```bash
"<python>" - <<'PY'
import pymupdf
doc = pymupdf.open("in.pdf")
for number, page in enumerate(doc, 1):
    for image in page.get_images(full=True):
        print(number, image[0], image[2], "x", image[3])
PY
```

Extract one with `page.get_pixmap(clip=...)` or `doc.extract_image(xref)` when the user needs the picture itself. Rendering the page at 150–200 dpi and cropping with `read_image` is the reliable way to *see* it.

## What fails and how to resolve it

- **Scanned page, no text**: there is no text layer to read. Say so; the render shows the image of the words. Resolutions: work from a text-based copy of the file, or read the pages visually and type the content into a rebuild. Do not claim extraction succeeded on an empty result.
- **Empty string from a page that shows text**: the page may use a font with a broken ToUnicode map, or the text may be drawn as vector outlines. Check the render before concluding; if it is outlines, extraction cannot recover the words.
- **Wrong reading order in multi-column layouts**: raw extraction follows the operator order. Crop each column with a rect and extract per column, `get_textbox(rect)` on a PyMuPDF page is the simplest split.
- **Ligatures and soft hyphens**: extraction may glue or split words; quote extracted text only after reading the same passage on the render.

## Verify

Rendering the page is the check for every extraction: the characters you return must be visible in that image. Watch for a page whose extracted text is suspiciously short (a missing text layer), duplicated (headers repeated per page), or full of replacement glyphs (broken encoding) before you build anything on top of it.
