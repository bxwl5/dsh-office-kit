# Images and figures

**Goal.** Pictures that are described for screen readers, sized for the page, and captioned consistently.

An inline picture is a `w:drawing` containing `wp:inline` (or `wp:anchor` for a floating one), with the picture relationship in `a:blip r:embed` and the display size in `wp:extent` (EMU). Alt text lives in `wp:docPr @descr`.

## Audit

```bash
"<python>" "<skill>/scripts/images_audit.py" "<file.docx>" --max_rows 20
```

For every image: the part it sits in, its name, the media file behind it, its size in inches, and the alt text. Findings are `missing_alt` and `oversized` (wider than the text block). The workable check is "does the alt text describe what a reader loses if the picture is gone".

## Fix alt text

```bash
"<python>" "<skill>/scripts/a11y_audit.py" "<file.docx>" --fix_image_alt from_filename --out "<file-fixed.docx>"
```

That writes the file name when no description exists — better than nothing, not as good as real text. For real descriptions, set `descr` yourself; decorative images get an empty description and `title`, while informative images get a sentence:

```bash
"<python>" - <<'PY'
import sys
from pathlib import Path
sys.path.insert(0, r"<skill>/scripts")
import docx_kit as kit
d = kit.Docx(r"<file.docx>")
for doc_pr in d.xml("word/document.xml").iter(kit.q("docPr", kit.WP)):
    if doc_pr.get("name") == "Picture 3":
        doc_pr.set("descr", "Bar chart: revenue by region, EMEA ahead of APAC.")
out = Path(r"<file-fixed.docx>")
d.save(out)
print("saved", out)
PY
```

## Insert

```bash
"<python>" "<cli>" docx create --spec "<spec.json>" --out "<out.docx>"
```

```json
{ "type": "image", "path": "<absolute.png>", "width": 5.5 }
```

Width is in inches; the height follows the aspect ratio. An image wider than the text block gets clipped or shrinks unpredictably — 5.5in is a safe full-width figure on Letter with 1in margins.

## Figures

Caption a picture the same way as a table (`tasks/captions_crossrefs.md`): `captions_and_crossrefs.py --figures` adds `Figure N` with a `SEQ` field and a `figN` bookmark. Keep the caption in the same block so the figure and its caption do not separate across a page break.

## Verify

Render and read the page: the image is not stretched, not blurry beyond the source resolution, not clipped at the margin, and its caption sits under it. Add alt text as a separate check — the render cannot show it.

## Pitfalls

- Cropping in Word is not lossy for the file but changes the displayed extent; alt text and size checks still apply.
- A floating image (`wp:anchor`) can overlap text at any zoom level; prefer inline for documents that will be edited.
- Replacing an image file in `word/media` in place keeps the relationship but not the dimensions — the extent is stored separately.
