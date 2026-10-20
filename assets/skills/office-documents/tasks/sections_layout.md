# Sections and page layout

**Goal.** Page size, orientation, margins, columns, headers and footers that are deliberate at every point in the document, including after a mid-document change.

Page setup lives in a `w:sectPr` element. The last one sits at the end of the body; earlier ones sit inside the last paragraph of the section they end (`w:pPr/w:sectPr`). That is why adding a landscape page means adding a section break before and after, not changing one global setting.

## Audit

```bash
"<python>" "<skill>/scripts/section_audit.py" "<file.docx>"
```

Per section: width and height in inches, orientation derived from them, every margin, column count, section start type, header and footer parts referenced, `titlePg` (different first page) and any explicit page-number start.

Findings worth fixing: `mixed_page_sizes` (sections that disagree, usually a template artefact), `narrow_text_column` (left plus right margin eats most of the width), `portrait_wider_than_letter`.

## Common changes

| Wanted | Route |
|---|---|
| New document defaults | `docx create` spec: `page_size`, `orientation`, `top_margin`/`bottom_margin`/`left_margin`/`right_margin` in inches |
| A landscape page inside a portrait document | two section breaks with a landscape section between them |
| Different first page header | set `titlePg` on the section and fill `first_page_header` |
| Continuous section change (e.g. narrower margins) | `w:type val="continuous"` on the new section |

Landscape and columns are section properties, so a snippet is often faster than a flag:

```bash
"<python>" - <<'PY'
from docx import Document
from docx.enum.section import WD_ORIENT, WD_SECTION
d = Document(r"<file.docx>")
s = d.add_section(WD_SECTION.NEW_PAGE)
s.orientation = WD_ORIENT.LANDSCAPE
s.page_width, s.page_height = s.page_height, s.page_width
d.save(r"<file-edited.docx>")
PY
```

Swap the width and height explicitly: setting the orientation alone does not swap them.

## Headers and footers

A header is `word/headerN.xml` referenced from `w:headerReference`. Headers inherit from the previous section unless the section sets `headerReference` itself. Page numbers go in the footer as a `PAGE` field, page counts as `NUMPAGES`; `docx_ooxml_patch.py --add-page-numbers` writes one.

## Verify

Render and flip through every page, including the ones after a section break: header content, page numbers, orientation, margins. A section break that leaves an empty page is the classic defect — check for a stray empty paragraph carrying the break.

## Pitfalls

- `w:pgSz` is width then height; a portrait page taller than wide is normal, a "landscape" 11×8.5 that still says portrait in the panel means only the size changed.
- `titlePg` without filling the first-page header leaves page one with a blank header, not with the normal one.
- Deleting a section break merges two sections and keeps the earlier section's settings; edit before deleting.
