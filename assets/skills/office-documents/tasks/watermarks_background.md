# Watermarks and background text

**Goal.** A diagonal DRAFT / CONFIDENTIAL mark behind the page content, and the ability to find and remove one that a template left behind.

A Word watermark is not a document feature with its own element: it is a VML shape (`v:shape` with `v:textpath`) in a header part, positioned behind the text. That is why it disappears if the header is replaced, and why it can appear on some pages and not others when sections have their own headers.

## Add

```bash
"<python>" "<skill>/scripts/watermark_add.py" "<file.docx>" --out "<file-draft.docx>" --text "DRAFT"
```

Writes the shape into the default header, light grey, rotated -45°, behind the body. The script refuses to add a second watermark when it finds one — remove the old one first, or you get two overlapping marks.

For a per-page mark across a document with several sections, each section's header needs the shape; that is a loop over sections, not one insertion.

## Find and remove

```bash
"<python>" "<skill>/scripts/watermark_audit_remove.py" "<file.docx>" --mode report
"<python>" "<skill>/scripts/watermark_audit_remove.py" "<file.docx>" --mode remove --out "<file-clean.docx>"
```

The report lists the text of every VML text path and the part it lives in, and exits 1 when any watermark exists. `--contains` narrows to a substring, which is the case "the template says Company Confidential and it should not". Remove deletes the enclosing paragraph from the header.

## Verify

Render and read the pages: the mark sits behind the text (not over it), stays inside the page, and appears on every page the user expects. A watermark that vanishes on page two means that section has a different header.

## Pitfalls

- A watermark in a "different first page" header only shows on page one.
- Removing the header paragraph can leave an empty header that adds vertical space; check the top margin on the rendered page.
- An image watermark is an `v:imagedata` shape, not a text path — the report will not name it, so inspect the header XML when the visual mark is a logo.
- Watermarks are not security. See `tasks/protection_restrict_editing.md` for what actually restricts editing.
