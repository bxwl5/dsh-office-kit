# Working from a supplied template

## Why templates win

A template already answers branding, type scale, slide families and chrome. The
cheapest correct deck puts the user's content into the template's own slides
and leaves the design alone. Rebuilding the look from a screenshot produces a
near-miss that reads as "someone remade our deck in a hurry".

## Order of operations

1. **Inspect the template** before judging it:

   ```bash
   "<python>" "<skill>/template_following_scripts/inspect_template_deck.py" --template brand.pptx --out-dir template-inspect
   ```

   It writes `template-inspect.ndjson` (per slide: layout, placeholders with
   index, kind, rect and text, background art) and `template-manifest.json`
   (slide size, aspect, layout names, theme fonts, which slides carry
   full-bleed art).

2. **Choose the slide families you need** — cover, section, content, table,
   chart, closing. You want the *fewest* source slides that cover those roles.

3. **Write the frame map** — a JSON plan that names, per output slide, which
   source slide it duplicates and what happens to each element
   (`rewrite`, `rewrite-and-reposition`, `fill-placeholder`, `replace`,
   `delete`, `keep`).

4. **Validate the plan** before building:

   ```bash
   "<python>" "<skill>/template_following_scripts/validate_template_plan.py" --plan frame-map.json
   ```

   It rejects unknown actions, out-of-range zones, new primitives without an
   explicit justification, and any attempt to edit a brand or chrome element.

5. **Build the starter deck**, then fill it:

   ```bash
   "<python>" "<skill>/template_following_scripts/prepare_template_starter_deck.py" --template brand.pptx --plan frame-map.json --out starter.pptx
   ```

   The starter deck contains only the slides you kept, in your order, with the
   placeholders filled. From there `container_tools/add_slides.py` and the
   recipes extend it.

6. **Check fidelity** against the source:

   ```bash
   "<python>" "<skill>/template_following_scripts/check_template_fidelity.py" --template brand.pptx --final starter.pptx --plan frame-map.json
   "<python>" "<skill>/container_tools/template_source_fidelity_gate.py" --template brand.pptx --final starter.pptx --requirements fidelity.json
   ```

   Both print JSON with a `passed` boolean. Leftover placeholders, drifted
   layout rects and opaque panels covering inherited artwork are failures, not
   style opinions.

## Reading a template's own geometry

`container_tools/inspect_presentation_layout_geometry.py --input brand.pptx`
prints every shape's rect in inches, which is what you address when a slide's
placeholder needs a value that fits its frame.

## Rules

- Placeholders keep their index; fill by index rather than adding a textbox on
  top of a placeholder.
- Never restyle the master to match a screenshot you were given. If the brand
  colours are wrong, ask; guessing produces a deck the brand team rejects.
- If the template has no suitable family for a slide (say, a two-column
  comparison), say which family you added and why, rather than silently
  inventing a look.
- Keep the template's slide size. Changing it invalidates every inherited rect.
