# Equations

**Goal.** Displayed mathematics that Word treats as maths: selectable, reflowable, editable — not a picture and not italic text.

Word stores native equations as OMML inside `m:oMathPara`/`m:oMath`. The helper CLI converts LaTeX to OMML on creation; a picture of an equation cannot be edited by the user and scales badly.

## Create

```bash
"<python>" "<cli>" docx create --spec "<spec.json>" --out "<out.docx>"
```

```json
{
  "blocks": [
    { "type": "heading", "level": 1, "text": "Model" },
    { "type": "equation", "latex": "E = mc^2" },
    { "type": "equation", "latex": "\\frac{a^2+b^2}{c^2}" }
  ]
}
```

The command reports `equations` and `equation_fallbacks`. Non-zero fallbacks mean some expression was emitted as italic text because the converter could not handle it — check the counter, then simplify the LaTeX (the converter covers fractions, superscripts, subscripts, roots, sums, Greek letters and common operators).

Displayed equations belong in their own paragraph; inline maths is ordinary runs plus OMML, which is harder to place and easy to break.

## Check what a file contains

```bash
"<python>" "<cli>" docx read --input "<file.docx>"
"<python>" "<skill>/scripts/docx_kit.py" xml '<file.docx>' word/document.xml | grep -c "oMath"
```

`oMath` in the XML is the honest test. Text that merely looks mathematical (italic Times, a slash) is not an equation and will reflow badly.

## When the converter cannot express it

Build the OMML by hand for the specific construct, or split the expression: a matrix or a piecewise definition is often clearer as a small table than as one enormous formula. If neither works, render the expression as an image with a caption and tell the user it is no longer editable.

The runtime ships the `latex2mathml` and `mathml2omml` packages, so a custom snippet can produce OMML directly:

```bash
"<python>" - <<'PY'
from latex2mathml.converter import convert
from mathml2omml import convert as to_omml
mathml = convert(r"\sum_{i=1}^{n} x_i")
print(to_omml(mathml)[:200])
PY
```

## Verify

Render the page and look at the equation: fractions stacked, limits above and below the operator, Greek letters as glyphs not boxes, and the equation not clipped at the right margin. A fallback shows up as italic Latin text where a symbol should be.

## Pitfalls

- An equation inside a table cell or a caption is legal but almost always the wrong layout decision.
- Copying OMML between documents is safe; copying a picture of it is not.
- Numeric labels belong in the text (`(3)` right-aligned), not inside the equation object, if the user will renumber later.
