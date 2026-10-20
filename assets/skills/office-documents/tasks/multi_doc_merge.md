# Merge documents

**Goal.** Put one document after another and keep both looking the same — styles, numbering, images, hyperlinks — instead of pasting content that loses half of it.

Concatenating packages by hand fails on the details: style ids collide, `numId` values point at the wrong list, media parts need new names and relationships, and `r:id` values are document-scoped. Word also requires one `sectPr` at the end of the body, so the appended content has to land before it.

## Append

```bash
"<python>" "<skill>/scripts/merge_docx_append.py" "<base.docx>" "<addition.docx>" --out "<merged.docx>"
```

What it carries across: body content (minus the addition's final `sectPr`), media parts renamed under `word/media` with fresh relationships and content types, style definitions referenced by the copied content (following `basedOn`/`next`/`link`), numbering definitions rebuilt with fresh ids and every `w:numId` rewritten, and hyperlink relationships recreated as external relationships.

Drawings are refused by default: a floating image or a text box carries anchor geometry tied to the original page. Pass `--allow_drawings` when the user accepts that the layout may shift, then check that page carefully.

## Merge into a template

The usual job is "put these sections into the house template". Apply the template first, then append, so the appended content inherits the template's style ids:

```bash
"<python>" "<skill>/scripts/apply_template_styles.py" --template "<house.dotx>" --target "<draft.docx>" --out "<draft-styled.docx>"
"<python>" "<skill>/scripts/merge_docx_append.py" "<draft-styled.docx>" "<section2.docx>" --out "<merged.docx>"
```

Then normalize direct formatting so the merged content matches:

```bash
"<python>" "<skill>/scripts/style_normalize.py" "<merged.docx>" --out "<merged-final.docx>" --clear_paragraph_format
```

## Verify

- Page count should equal the sum of the inputs, unless a page break changed.
- Headers and footers come from the base document; say so if the addition had its own.
- Render and read the join: the page where the second document starts often shows a stray page break or a heading that lost its style.
- `style_lint.py` on the merged file catches undefined style references imported from the addition.

## Pitfalls

- Footnotes and comments in the addition are not merged; port them deliberately if they must survive.
- `w:id` values for bookmarks and comments can collide across documents; the merge keeps ids and names as they were.
- A landscape section in the addition is not carried over — section properties were dropped with the `sectPr`.
