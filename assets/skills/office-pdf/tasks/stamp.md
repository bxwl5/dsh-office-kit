# Stamp a footer, header, or label

An overlay is a tiny one-page PDF drawn with reportlab and merged onto the target page, so the original content stream is untouched and existing widgets keep working. Position is in points measured from the bottom-left of the page box; a stamp on an A4 page has 842 points of height to work with.

## Fast path: the stamp script

```bash
"<python>" "<skill>/scripts/stamp_overlay.py" --input "<file.pdf>" --out "<file-stamped.pdf>" \
  --text "Confidential - page {page} of {pages}" --position bottom-center --render-dir "<render>"
```

`{page}` and `{pages}` are substituted per page. Positions: `bottom-left`, `bottom-center`, `bottom-right`, `top-left`, `top-center`, `top-right`; `--pages "1,3-5"` limits the stamp; `--font-size`, `--font`, `--color`, `--margin`, and `--opacity` control the look. The script merges page by page with pypdf, refuses to overwrite the input, and can render the stamped pages so you can look at them.

## Draw it yourself

Use reportlab directly when the stamp is a bar, a rotated line, or a block of text:

```bash
"<python>" - <<'PY'
import io
from pypdf import PdfReader, PdfWriter
from reportlab.lib.pagesizes import A4
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas

reader = PdfReader("in.pdf")
writer = PdfWriter()
for index, page in enumerate(reader.pages):
    width = float(page.mediabox.width)
    height = float(page.mediabox.height)
    buffer = io.BytesIO()
    c = canvas.Canvas(buffer, pagesize=(width, height))
    c.setFillColor(HexColor("#c0392b"))
    c.setFont("Helvetica-Bold", 10)
    c.saveState()
    c.translate(width / 2, 18)
    c.drawCentredString(0, 0, f"CONFIDENTIAL  |  page {index + 1} of {len(reader.pages)}")
    c.restoreState()
    c.save()
    buffer.seek(0)
    page.merge_page(PdfReader(buffer).pages[0])
    writer.add_page(page)
with open("out.pdf", "wb") as handle:
    writer.write(handle)
PY
```

Use the page's own `mediabox` rather than a hard-coded A4 size when the source may mix page sizes; a stamp drawn for A4 lands in the wrong place on a landscape page. `merge_page` paints over the page, so a solid bar hides whatever it covers — place it in a margin or inside a band you intend to cover.

## Pitfalls

- **Collisions with existing footers**: check the bottom margin first; the render is the proof, not the coordinate math. If the document already has a page number, either skip the stamp or put it on the opposite side.
- **Rotated pages**: a page with `/Rotate 90` renders sideways; text drawn in the unrotated coordinate system will appear rotated in the viewer. Either rotate the stamp with `c.rotate(90)` and adjust the origin, or rotate the page back first.
- **Repeated stamping**: merging the same overlay twice doubles the opacity and positions identically; re-run from the original input when iterating.
- **Fonts**: Helvetica handles Latin; a CJK stamp needs a registered TTF, otherwise the text renders as blank boxes. Check the render.
- **Opacity**: `setFillAlpha` is applied by viewers that honour transparency groups; a stamp that must be visible on any viewer is safer with full opacity.

## Verify

Render every stamped page and check: the text sits inside the margin, does not overlap body text or an existing footer, is the size the user asked for, and appears on exactly the selected pages. Then run `"<python>" "<cli>" pdf read --input "<file-stamped.pdf>"` — the stamp's text will join the page text, so a search for the label confirms it landed once, not twice.
