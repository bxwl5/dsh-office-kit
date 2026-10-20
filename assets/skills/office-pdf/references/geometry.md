# Page geometry

PDF units are points: 1/72 inch. A4 is 595 × 842 points, Letter 612 × 792. Numbers in a spec, a region, or a stamp are points unless stated otherwise.

## Boxes

- **MediaBox** — the physical page, the outermost boundary.
- **CropBox** — the visible area; defaults to MediaBox. A viewer shows the CropBox.
- **BleedBox / TrimBox / ArtBox** — print-production hints, usually absent in office output.

PyMuPDF's `page.rect` is the CropBox (or MediaBox when no CropBox exists), with `x0, y0` normally 0 and `x1, y1` the width and height. pypdf exposes `.mediabox` and `.cropbox` directly. When you move content between documents, use the page's own box, not a constant: mixed-size sources are common after a merge.

## Coordinates

The origin is the bottom-left of the page box, x to the right, y upward. Library calls that take a rectangle (`page.get_textbox(rect)`, `add_redact_annot`, `get_pixmap(clip=...)`) use that system. Library calls that report word boxes (`page.get_text("words")`, `search_for`) report rectangles in the same system — a word's box is not a baseline, so a text redaction rect is close but may clip the line.

reportlab's `drawString(x, y, text)` places a *baseline*, measured from the bottom. Converting a top-down measurement `top` to that system: `y = page_height - top - font_size * 0.8` puts the glyph body roughly where it was.

## Rotation

`/Rotate` is a multiple of 90 stored per page; viewers apply it on top of the content. `page.rect` in PyMuPDF is already the rotated (visible) geometry, while `page.mediabox` stays unrotated. Redactions and text boxes use the unrotated content stream, so a rotated page needs the rectangle transformed: simplest is `page.set_rotation(0)`, do the work, then set the rotation back — the render proves whether you got it right.

## Normalised regions

`office-annotations` regions are fractions of the rendered preview page:

```
x0 = page.x0 + left * page.width
x1 = page.x0 + (left + width) * page.width
y0 = page.y0 + top * page.height
y1 = page.y0 + (top + height) * page.height
```

That is the whole conversion for an unrotated page. For a rotated page, convert against the preview's own orientation and map back; the words under the converted rect tell you immediately if the mapping is off.

## Pixels and DPI

A raster at `dpi` has `pixels = points * dpi / 72`. A 110 dpi A4 page is roughly 909 × 1287 pixels. When the user draws a region on a rendered image, the fraction is DPI-independent — you never need the pixel size to convert it. For image quality on print, 150 dpi is the minimum for a screenshot, 300 dpi for artwork.

## Text measurements

`page.get_text("dict")` gives blocks → lines → spans, each span with `size` (font size in points), `font`, `origin` (the baseline point), and the text. Use the span measurements, not the bounding box, when you redraw a line: the box includes ascenders and descenders that change the apparent size.

`page.get_textbox(rect)` returns the characters whose boxes intersect `rect`, in reading order. That is the correct way to confirm what a region covers; `page.get_text("words", clip=rect)` returns word tuples when you need the boxes too.
