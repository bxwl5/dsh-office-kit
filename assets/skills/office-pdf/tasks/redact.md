# Remove a region of a page

Redaction here means *destruction*, not a black box: the glyphs and vector paths inside a rectangle are deleted from the content stream, so no text extractor can recover them afterwards. A rectangle that only covers them visually is not a redaction, and "black out then flatten" leaks the original text.

## Fast path: the region script

```bash
"<python>" "<skill>/scripts/redact_region.py" --input "<file.pdf>" --out "<file-redacted.pdf>" \
  --annotations '{"page":1,"region":{"left":0.064,"top":0.318,"width":0.891,"height":0.153}}' \
  --json-out "<redact.json>"
```

The payload is the annotation shape: 1-based page plus a region normalised 0–1 against the rendered page. The script converts it, expands the rectangle by `--pad` points (default 2.5), calls `add_redact_annot(rect, fill=None)` then `apply_redactions(images=PDF_REDACT_IMAGE_NONE, graphics=PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED, text=PDF_REDACT_TEXT_REMOVE)`, and reports `removed_chars`, `removed_drawings`, the per-page before/after counts, and `leftover_chars_in_rect`. `--region`/`--page` do the same for a single value without JSON. Multiple annotations in one payload are applied page by page.

## Why the rectangle needs padding

A line of text sits on a baseline and its glyphs can overhang the geometric box by a fraction of a point; selection boxes from a preview are approximate too. Expanding by 2–3 points catches ascenders, descenders, rules that touch the text, and the anti-aliased edge, while staying clear of neighbours. Measure, do not guess: `get_textbox(rect)` before the redaction lists what the rectangle will take, and `leftover_chars_in_rect` after it must be zero.

Do it by hand when you need a different shape or a dry run:

```bash
"<python>" - <<'PY'
import pymupdf
doc = pymupdf.open("in.pdf")
page = doc[0]
r = page.rect
rect = pymupdf.Rect(r.x0 + 0.064 * r.width, r.y0 + 0.318 * r.height,
                    r.x0 + 0.955 * r.width, r.y0 + 0.471 * r.height)
rect = (rect + (-2.5, -2.5, 2.5, 2.5)) & page.rect
print("will remove:", repr(page.get_textbox(rect)[:200]))
before = len(page.get_text()), len(page.get_drawings())
page.add_redact_annot(rect, fill=None)
page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_NONE,
                      graphics=pymupdf.PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED)
after = len(page.get_text()), len(page.get_drawings())
print("chars/drawings", before, "->", after)
doc.save("out.pdf", garbage=3, deflate=True)
PY
```

## The flags are not interchangeable

- `fill=None` erases without painting. A fill colour (`fill=(1, 1, 1)`) paints a rectangle, which itself becomes a new drawing and hides the page's own background tint; the drawing count then goes up, not down.
- `images=PDF_REDACT_IMAGE_NONE` leaves pictures untouched: a scanned region stays visible. Use `PDF_REDACT_IMAGE_PIXELS` to blank the pixels a rectangle covers inside an image, and only use a stronger setting when the user wants the whole image gone.
- `graphics=PDF_REDACT_LINE_ART_REMOVE_IF_TOUCHED` deletes paths that intersect the rectangle; paths entirely inside it are always removed. `PDF_REDACT_LINE_ART_NONE` keeps all line art, which is right when only text should disappear.
- Text removal is the default (`PDF_REDACT_TEXT_REMOVE`); keeping the text while erasing its surroundings is almost never what the user means.

## Counting the result

`removed_chars` is the page-level difference in extracted text; `region_chars_removed` is the text that was inside the rectangle. They differ by the newline or space that joins the removed block to its neighbours, so expect them to be equal or one apart. Document-level totals are the sum over the changed pages. A run that removes fewer characters than the region held means the rectangle missed part of the block — enlarge `--pad` or convert the geometry again.

Cross-check on the sample document: page 1, region `{left: 0.064, top: 0.318, width: 0.891, height: 0.153}` deletes the "Latest News" block and nothing else. Measured: 16 drawings → 5, page text 1049 → 879 characters (the block held 169), `leftover_chars_in_rect` 0, and the body paragraph, header, and footer still extract and render.

## Leftovers redaction does not cover

- **Metadata and embedded files**: the info dictionary and attachments are not page content. Clear them when the user asks for a clean file (see `scripts/metadata.py`), and note that a document ID/xref may still fingerprint the file.
- **Previous revisions**: incrementally saved files can retain old objects. Saving with `garbage=3, deflate=True` compacts the file; when the user needs forensic certainty, say that the output was rebuilt and confirm with a text search that the words are gone.
- **Images inside the region**: by default they stay. If the region is a screenshot of the sensitive text, switch to `--images pixels` or rebuild the page.

## Verify

Render after the redaction and look at the page. The region must be empty, the surrounding text intact, and any ruled boxes that belonged to the block gone rather than half-erased. Then search the output for the removed words:

```bash
"<python>" - <<'PY'
import pymupdf
text = pymupdf.open("out.pdf")[0].get_text()
print("latest news" in text.lower(), len(text))
PY
```

If they still appear, the rectangle missed them — fix the geometry, do not hand the file over.
