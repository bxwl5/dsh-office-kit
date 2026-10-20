# Annotation recipes

The user may reply to a rendered preview with an `office-annotations` block: a
JSON array wrapped in `<office-annotations>` … `</office-annotations>` tags.
Each format sends a slightly different item; the shapes below are what the
client actually emits.

| Format | Item keys | `page` means |
| --- | --- | --- |
| pdf | `target`, `fileName`, `page`, `text`, `requirement`, `region`, `imageName` | 1-based page of the PDF itself |
| docx | `target`, `fileName`, `page`, `text`, `requirement`, `region` | page of the rendered PDF preview, not a Word page |
| pptx | `target`, `fileName`, `page`, `text`, `requirement`, `region` | rendered PDF page; one slide per page, so page N is slide N |
| xlsx | `target`, `fileName`, `text: ""`, `requirement`, `region`, `imageName`, `unmapped: true` | no `page`, no `sheet`, no `range` |

- `target` and `fileName` name the file.
- `region` is normalised 0–1 against the rendered preview page the user drew on.
- `requirement` is natural language. Read it as a change request.
- `text` is the words under the mark. For docx and pdf it is stronger evidence
  than `region`; for xlsx it is always empty.
- `imageName` marks a location screenshot that arrived as a normal image
  attachment.

Rules that apply everywhere:

1. Render the *current* file first and look at the same page the user annotated.
   Annotation geometry is only meaningful against a render you can reproduce.
2. Locate the concrete object, then apply the smallest edit that satisfies
   `requirement`. Do not restyle the document, do not rewrite neighbours.
3. Re-render and look at the edited page again. The item is done when the region
   shows the requested change and the layout still holds.
4. If the payload cannot be tied to an object (empty region, no geometry, no
   matching text), say what you could not locate. Never guess and never move the
   region to make it fit.

Worked examples below use `report.docx`, `report.pdf`, `deck.pptx` and
`book.xlsx` and the `python`/`cli` values from the `## Office runtime` block.

## docx — rendered-PDF page plus text matching

`page` is the page of the **rendered PDF preview**, not a Word page number.

```bash
"<python>" "<cli>" docx render --input "report.docx" --out-dir "render"
```

This writes `render/page-1.png` and keeps `render/report.pdf`. In the example
the user circled a sentence on preview page 1 and asked to round it.

Locate it from the text, not from the pixels:

- `"<python>" "<cli>" docx read --input "report.docx"` lists every paragraph with
  its style. Find the paragraph containing `text`.
- Use `region` only to break ties between two similar paragraphs, or to confirm
  the preview page number. If they disagree, trust `text` and say so.

Extract the words under the region when you need confirmation. Save this as
`locate.py` and run it with the runtime python:

```python
import sys, pymupdf
pdf, page_no, l, t, w, h = sys.argv[1], int(sys.argv[2]), *map(float, sys.argv[3:7])
page = pymupdf.open(pdf)[page_no - 1]
r = page.rect
clip = pymupdf.Rect(r.x0 + l * r.width, r.y0 + t * r.height,
                    r.x0 + (l + w) * r.width, r.y0 + (t + h) * r.height)
print(" ".join(word[4] for word in page.get_text("words", clip=clip)))
```

Apply the edit and write `<original>-edited.docx`:

```json
{
  "replace": [{
    "find": "Revenue grew 18.4% year over year.",
    "replace": "Revenue grew 19% year over year."
  }]
}
```

```bash
"<python>" "<cli>" docx edit --input "report.docx" --spec "edit.json" --out "report-edited.docx"
```

The report returns `replacements`. `0` means `find` did not match verbatim —
re-read the paragraph text instead of guessing. Then re-render
`report-edited.docx` and `read_image` page 1. Note that one longer sentence can
reflow the rest of the page: check the paragraphs below the edit, not just the
edited line.

## pdf — convert the region and work on the converted rect

`page` is a 1-based page of the PDF itself. `region × page.rect` is the real
place in the file, so convert once and use the device rect directly.

```python
import sys, pymupdf
pdf, page_no, l, t, w, h = sys.argv[1], int(sys.argv[2]), *map(float, sys.argv[3:7])
page = pymupdf.open(pdf)[page_no - 1]
r = page.rect
rect = pymupdf.Rect(r.x0 + l * r.width, r.y0 + t * r.height,
                    r.x0 + (l + w) * r.width, r.y0 + (t + h) * r.height)
print(rect, " ".join(word[4] for word in page.get_text("words", clip=rect)))
```

Example: page 1, region over the title, `text` "Field report", requirement
"make the title say Field report (revised), keep the author". The converted rect
confirms the words under the mark are `Field report`. `imageName`, when present,
is a screenshot of that region — open it with `read_image` if the text layer is
ambiguous or the page is scanned.

Choose the edit that the helper actually supports:

- Metadata, rotation, page order, merge, page removal → `pdf edit`:

  ```json
  { "metadata": { "title": "Field report (revised)" } }
  ```

  ```bash
  "<python>" "<cli>" pdf edit --input "report.pdf" --spec "edit.json" --out "report-edited.pdf"
  ```

- Text or graphics **on** the page → the helper has no in-place content edit.
  Rebuild the page from a `pdf create` spec using the text from `pdf read`, then
  say plainly that the PDF was rebuilt rather than patched. Do not describe a
  rebuild as a surgical edit.

Verify with `<cli> pdf render --input "report-edited.pdf" --out-dir "render"` and
`read_image render/page-1.png`. `pdf render` uses PyMuPDF and works without
LibreOffice or Office, so a PDF annotation is never blocked by a missing
renderer.

## pptx — select the shapes that overlap the region

`page` is the rendered PDF page, and the deck renders one slide per page, so
page N is slide N. `pptx read` returns slide text but **no shape geometry**, so
compute overlap yourself with python-pptx. Shape boxes and the payload region are
both fractions of the slide, so the comparison is direct.

```python
import sys
from pptx import Presentation
prs = Presentation(sys.argv[1])
slide_no, l, t, w, h = int(sys.argv[2]), *map(float, sys.argv[3:7])
sw, sh = prs.slide_width, prs.slide_height
for shape in prs.slides[slide_no - 1].shapes:
    x0, y0 = (shape.left or 0) / sw, (shape.top or 0) / sh
    x1, y1 = x0 + (shape.width or 0) / sw, y0 + (shape.height or 0) / sh
    if x1 > l and x0 < l + w and y1 > t and y0 < t + h and shape.has_text_frame:
        print(shape.shape_id, shape.text_frame.text.replace("\n", " | "))
```

Example: page 2 (slide 2), region over the second bullet, `text` "Renewal 92%",
requirement "make it 94%". Two shapes overlap the region — the title placeholder
and the body — and `text` picks the body.

Apply with the run-level replacement:

```json
{ "replace": [{ "find": "Renewal 92%", "replace": "Renewal 94%" }] }
```

```bash
"<python>" "<cli>" pptx edit --input "deck.pptx" --spec "edit.json" --out "deck-edited.pptx"
```

This replacement is not scoped to one slide. Check the returned count, and if
the same string appeared on other slides, fix those with per-slide `slides[]`
entries in the same spec. Re-render and `read_image` the page PNG for slide 2.
If type overflows its shape after the change, shrink the run or shorten the text
rather than leaving it clipped.

## xlsx — no cell reference, so resolve it yourself and say so

xlsx items are always `unmapped: true` with `text: ""`: you get a region, a
screenshot in `imageName`, and a requirement — no page, no sheet, no A1 range.
The sheet and cells must be resolved from evidence, never invented.

1. **Look at the screenshot.** `read_image` the attachment named `imageName`.
   Note the visible column headers, row labels and values inside the marked
   region. If there is no screenshot, you only have `region` and
   `requirement` — say so instead of guessing.
2. **Dump the workbook.** `"<python>" "<cli>" xlsx read --input "book.xlsx"
   --json-out "book.json"`. Each sheet gives `name`, `dimensions`, `rows` (arrays
   without coordinates) and `formulas`.
3. **Resolve the cells.** Match the visible values and headers from step 1
   against the dumped rows, then derive the A1 address from the row/column
   index:

   ```python
   import json, sys
   from openpyxl.utils import get_column_letter
   data = json.load(open(sys.argv[1], encoding="utf-8"))
   needle = sys.argv[2]
   for sheet in data["sheets"]:
       for r, row in enumerate(sheet["rows"], start=1):
           for c, value in enumerate(row, start=1):
               if isinstance(value, str) and needle in value:
                   print(sheet["name"], f"{get_column_letter(c)}{r}", value)
   ```

   Run it with the runtime python. If several sheets have the same label, or the
   screenshot does not pin the column, ask which one before editing.

4. **State the resolution before editing.** Tell the user which sheet and A1
   range you resolved, e.g. "Revenue is `Q4!B2:C2` (10, 12); formatting those
   cells as currency." Only edit after that, so a wrong guess is visible before
   it touches the file.

5. **Apply and verify.** Example: screenshot shows `Revenue 10 12` and the
   requirement is "show these as currency with 2 decimals"; `xlsx read` finds
   `Revenue` in `Q4!A2` with `10` and `12` beside it:

   ```json
   {
     "operations": [
       { "action": "style", "sheet": "Q4", "cells": { "B2:C2": { "number_format": "#,##0.00" } } }
     ]
   }
   ```

   ```bash
   "<python>" "<cli>" xlsx edit --input "book.xlsx" --spec "edit.json" --out "book-edited.xlsx"
   ```

   A `style` operation applies to the whole A1:B2 range in one go. Use
   `set_cells` to write values, `append_rows` to add rows, `add_sheet` /
   `delete_sheet` / `rename_sheet` for structure. Then read the edited workbook
   again to confirm the values.

Forbidden, because both produce plausible-looking edits in the wrong place:

- converting `region` pixels into a cell address — the spreadsheet preview has
  its own zoom and scroll;
- naming a sheet the screenshot does not show or `xlsx read` cannot match.

Visual confirmation needs `xlsx render`, which requires LibreOffice or Office;
without one, say the change is verified structurally but not visually. Formula
results stay uncalculated unless `xlsx recalc` runs on Windows with Microsoft
Excel; do not present openpyxl's empty cache as a computed value.

## When to stop and ask

Ask one short question, listing what you did find, when:

- the region covers text that exists on several pages and `text` is empty;
- two shapes on a slide both match `text`;
- the xlsx screenshot does not identify the sheet, or the visible values match
  more than one row or column;
- the requirement needs an operation the helper does not support (page-content
  editing in PDF, animation, comments) — offer the rebuild path instead of a
  silent partial change.
