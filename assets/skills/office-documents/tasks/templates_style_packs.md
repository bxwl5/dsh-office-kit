# Templates and style packs

**Goal.** Make a new or existing document look like the house template, without copying the template's content into it.

A `.dotx` is a `.docx` whose package is a template: `styles.xml` defines the look, `numbering.xml` defines lists, and the body is empty. Copying the body would import placeholder text; what you actually need is the styles part, the numbering definitions they reference, and the theme.

## Ask before guessing

Do not invent a house style. Get from the user: heading fonts and sizes, body font and size, accent colour, margins, table style, and whether a logo or cover page is required. `references/template-elicitation.md` has the question set that produces a spec.

## Apply a template

```bash
"<python>" "<skill>/scripts/apply_template_styles.py" --template "<house.dotx>" --target "<draft.docx>" --out "<draft-styled.docx>"
```

The script merges the template's style definitions by `styleId` (replacing same-id definitions, appending missing ones, taking the template's `docDefaults`), and copies `numbering.xml` with its relationship and content-type override. The target's body is untouched, so the content survives and the look changes.

Then normalize so direct formatting does not override the template:

```bash
"<python>" "<skill>/scripts/style_normalize.py" "<draft-styled.docx>" --out "<draft-final.docx>" --clear_paragraph_format
```

## Restyle without a template

When the user describes the style instead of supplying a file, set it on the styles rather than on runs:

```bash
"<python>" - <<'PY'
from docx import Document
from docx.shared import Pt, RGBColor
d = Document(r"<draft.docx>")
normal = d.styles["Normal"]
normal.font.name = "Calibri"
normal.font.size = Pt(11)
for level, size in ((1, 18), (2, 14), (3, 12)):
    style = d.styles[f"Heading {level}"]
    style.font.size = Pt(size)
    style.font.color.rgb = RGBColor(0, 0, 0)
d.save(r"<draft-styled.docx>")
PY
```

## Verify

Render and compare against the template's own preview page by page: heading sizes, body leading, margins, table borders. A style page that looks right in a style list but wrong on the page usually means a direct-formatting run left over — run the lint.

## Pitfalls

- A template applied over content that references missing styles produces the fallback look, not an error; run `style_lint.py` to find undefined references.
- Themes (`word/theme/theme1.xml`) carry fonts and accent colours; a style that names a theme font changes when the theme does.
- Keeping the template's `numbering.xml` without its `abstractNum` ids produces lists that all share one counter.
