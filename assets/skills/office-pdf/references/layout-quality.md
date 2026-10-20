# Layout and delivery quality

Run this list on the rendered pages before presenting a file. It is the difference between "the command exited 0" and "the document is right".

## Page level

- Page count matches the request; no stray blank page at the end from a trailing `page_break` or an empty `showPage`.
- Every page has the intended size and orientation — a merged section with Letter pages inside an A4 report is visible in the render.
- Margins are consistent; nothing is clipped at the page box edge, including stamps and footers.
- The page box is the CropBox the user expects; a crop that hides a footer is a bug, not a clean-up.

## Text

- Body size, leading, and font are consistent; a patched line that uses a different size or face is a visible patch job.
- Headings descend in a sensible scale and do not collide with the body.
- No overflow past the right margin, no hyphen-only line breaks, no replacement boxes for missing glyphs.
- Non-Latin text renders as characters, not blanks — this needs a registered font with the right coverage.
- Extracted text matches what is visible: run `pdf read` on the final file and spot-check the edited region.

## Tables and figures

- Table columns fit the text column; long cell text wraps rather than clipping.
- A table that splits across pages repeats its header row.
- Images keep their aspect ratio; a stretched logo is a defect.
- Ruled lines and fills from a redacted block are gone, not half-erased.
- Charts and screenshots are legible at print size; text inside an image is not searchable, so keep the numbers in the body text too.

## Stamps and annotations

- Footer/header text sits in the margin, not over body copy.
- Page numbers are correct on the first and last page (off-by-one is the classic overlay bug).
- A stamp appears once per page; repeated merges double it.
- Filled form values sit inside their widget boxes, are not clipped by the box border, and use the field's own font where the appearance stream was preserved.

## Fonts and links

`page.get_fonts(full=True)` lists embedded fonts. A subset font is fine for display; it means the file is not intended for text-heavy editing. Check that no font is missing for the glyphs you wrote — the render shows boxes where coverage is absent. Links and bookmarks that pointed at reordered or deleted pages may dangle; the render shows clickable areas only, so trust the original page order rather than assuming the links moved with the content.

## Structural sanity

Open the output one more time with the same route the user will use: `"<python>" "<cli>" pdf read --input "<file>"`. It confirms the file parses, the page count, the metadata, and that text is extractable. A file that renders but fails to parse is worse than an obvious error, because it fails later in someone else's viewer.
