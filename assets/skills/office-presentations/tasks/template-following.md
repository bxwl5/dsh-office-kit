# Task: follow a supplied template

Use this when the user hands over a `.pptx` and says "use our template" or "match
this deck". The design is already decided; your job is to put content into its
own slides.

## 1. Inspect

```bash
"<python>" "<skill>/template_following_scripts/inspect_template_deck.py" --template brand.pptx --out-dir template-inspect
```

Outputs:

- `template-inspect.ndjson` — one JSON line per slide: layout name, layout
  placeholders, slide placeholders (index, kind, rect in inches, text), shape
  counts, text excerpt, whether the slide has full-bleed background art.
- `template-manifest.json` — slide size, aspect ratio, layout names, theme font
  names, and `backgroundArtSlides`.

Read `backgroundArtSlides` before adding anything: those slides already carry
artwork, so a new opaque panel will cover it.

## 2. Plan

Write `frame-map.json`:

```json
{
  "template": "brand.pptx",
  "newPrimitives": { "allowed": false, "justification": "" },
  "outputSlides": [
    {
      "slide": 1,
      "mode": "duplicate-slide",
      "sourceSlide": 1,
      "elements": [
        {
          "elementId": "title",
          "action": "fill-placeholder",
          "target": { "placeholder": "title", "text": "Automation Review" }
        },
        {
          "elementId": "subtitle",
          "action": "fill-placeholder",
          "target": { "placeholder": "subtitle", "text": "Warehouse network · FY2026" }
        }
      ]
    },
    {
      "slide": 2,
      "mode": "duplicate-slide",
      "sourceSlide": 3,
      "elements": [
        {
          "elementId": "title",
          "action": "rewrite",
          "target": { "placeholder": "title", "text": "Throughput rose while touches fell" }
        }
      ]
    }
  ]
}
```

Allowed actions: `rewrite`, `rewrite-and-reposition`, `replace`, `delete`,
`keep`, `fill-placeholder`. `target.zone` is `[x, y, w, h]` in 0–1 slide
fractions, used with `rewrite-and-reposition`. Elements whose `role` is
`brand`, `logo`, `bumper`, `divider`, `section`, `chrome` or `footer` must stay
`keep` — they are the template.

Adding new shapes is opt-in: set `newPrimitives.allowed` and write a
justification. The validator rejects shapes added without it, because "one extra
box" is how a branded deck stops matching brand.

## 3. Validate

```bash
"<python>" "<skill>/template_following_scripts/validate_template_plan.py" --plan frame-map.json
```

Rejects: unknown action, preserved role edited, zone outside 0–1, non-sequential
slide numbers, missing justification for new primitives, and duplicate source
slides (a warning — it means two output slides share artwork, usually fine for a
repeated section divider, usually a copy-paste mistake otherwise).

## 4. Build

```bash
"<python>" "<skill>/template_following_scripts/prepare_template_starter_deck.py" --template brand.pptx --plan frame-map.json --out starter.pptx
```

The starter deck keeps only the mapped source slides, in plan order, and applies
the actions. It refuses duplicate source slides (it reuses slides rather than
cloning parts). The report lists applied actions and any placeholder left empty.

From here, extend with `container_tools/add_slides.py` or the recipes when the
template has no family for a slide you need.

## 5. Check fidelity

```bash
"<python>" "<skill>/template_following_scripts/check_template_fidelity.py" --template brand.pptx --final starter.pptx --plan frame-map.json
"<python>" "<skill>/container_tools/template_source_fidelity_gate.py" --template brand.pptx --final starter.pptx --requirements fidelity.json
```

`fidelity.json`:

```json
{
  "reference_slide_indices": [1, 3],
  "mapping": { "1": 1, "2": 3 },
  "minimum_coverage_ratio": 1.0,
  "require_exact_dimensions": true,
  "require_placeholder_geometry": true,
  "require_photographic_background": false,
  "geometry_tolerance_emu": 9144
}
```

Both print `passed`. With no requirements, the fidelity gate is a deliberate
no-op pass — pass a requirements file or you have not checked anything.

## 6. Look at it

```bash
"<python>" "<skill>/container_tools/render_slides.py" --input starter.pptx --out-dir starter-preview
```

Compare against the source slides. A filled placeholder that overflows, a title
in the wrong family, or a panel over the corner logo is exactly what this step
exists to catch.
