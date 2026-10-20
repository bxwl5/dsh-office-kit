# Slide mechanics and paste-runnable recipes

The helper CLI covers the common path: a small deck with a title, bullet slides,
a table, a chart and a picture. Everything else — precise coordinates, master
edits, notes, theme tokens, connectors — is ordinary `python-pptx` work, and
these recipes are the honest route.

Read the mechanics first, then paste the recipe. Every snippet runs as-is from a
shell, from any working directory:

```bash
"<python>" - <<'PY'
from pptx import Presentation
...
PY
```

## The four numbers that decide every layout

| Question | Answer |
|---|---|
| Where is this shape? | `left`, `top`, `width`, `height` in **EMU** (English Metric Units). |
| What is an inch? | `914400` EMU. `pptx.util.Inches(1)` is the polite wrapper. |
| What is a point? | `12700` EMU. Font sizes use points, geometry uses EMU, and mixing them silently breaks layout. |
| What is a slide? | `prs.slide_width` / `prs.slide_height`; check them, never assume 16:9. |

Helper conversions worth memorising: `Emu(914400) == Inches(1)`,
`Pt(28) == Emu(355600)`, and a fraction of the slide is
`int(0.1 * prs.slide_width)`.

## Z-order

Shapes paint in the order they live in `slide.shapes`. A shape added later
covers one added earlier. To reorder without deleting:

```python
tree = slide.shapes._spTree
shape = slide.shapes[3]
tree.remove(shape._element)
tree.insert(2, shape._element)  # after nvGrpSpPr and grpSpPr
```

Index `2` is the first painted shape; that is where a full-bleed background
image belongs.

## What this pack ships

| Recipe | Use it when |
|---|---|
| [textbox-at-coordinate](textbox-at-coordinate.md) | Text must land on an exact rect, not "somewhere under the title". |
| [autolayout](autolayout.md) | The same build has to fit 3 bullets or 9 without hand-tuning. |
| [tables](tables.md) | Numbers need a grid with column widths and per-cell formatting. |
| [native-charts](native-charts.md) | Data must stay editable, not become a picture of a chart. |
| [master-and-layouts](master-and-layouts.md) | The whole deck changes at once: title bar, accent line, footer. |
| [speaker-notes](speaker-notes.md) | The presenter needs a script attached to each slide. |
| [theme-tokens](theme-tokens.md) | Colours and fonts must come from one place. |
| [rich-text-runs](rich-text-runs.md) | One paragraph mixes bold, accent colour and a footnote. |
| [images](images.md) | A picture needs a crop, a cover fit or a real alt text. |
| [connectors](connectors.md) | Two boxes are joined by a line that must survive a move. |

## Order of work that keeps decks out of trouble

1. Read the target geometry off the template or the user's reference
   (`container_tools/inspect_presentation_layout_geometry.py` prints it as JSON).
2. Place shapes in EMU, top-down: background, chrome, title, body, evidence.
3. Set type sizes by the *smallest* screen the deck will be shown on; body 18 pt
   and up, footnotes 12 pt and up.
4. Fill every placeholder you keep and delete the ones you do not — an empty
   placeholder prints "Click to add text" in edit view and looks unfinished.
5. Render, look, then fix. `container_tools/render_slides.py` plus `read_image`
   is the loop; a deck nobody looked at is not verified.
