---
description: Build, inspect, restyle, and verify PowerPoint .pptx slide decks with python-pptx plus the bundled Office helper CLI.
---

# Presentations (.pptx)

A deck is a zip of XML parts: slides, layouts, masters, charts with embedded
workbooks, notes, media. Everything the audience sees comes from those parts, so
this pack teaches you to (a) author those parts correctly and (b) read them back
before delivering.

Two layers:

- **The helper CLI** — a deterministic accelerator for common cases:
  `<python> "<cli>" pptx {create|read|render}`, plus `office_status`. It creates
  from a JSON spec, reads structure back, and renders. It does not mutate.
- **This pack** — the capability layer. Recipes for anything the CLI does not
  cover ([`recipes/`](recipes/README.md)), runnable tools for mutation and gates
  in [`container_tools/`](container_tools/), template-following in
  [`template_following_scripts/`](template_following_scripts/).

Authoring is `python-pptx`. Not a page-description format, not a screenshot: real
shapes, real chart parts, real notes.

## Before any file work

1. Call the `office_status` tool.
2. Read the `## Office runtime` JSON block appended to this file and use the
   absolute `python`, `cli`, `skill` and `shared` values from it. Quote paths.
3. If that block reports no working runtime, stop: tell the user to run the
   `node "..."` remedy command it names, then call `office_status` again. Never
   claim a deck was created or verified without a runtime to create and verify
   it with.

## Delivery

Always hand the finished file to the user with the `present` tool, then summarise in one sentence what changed. A bare path is not delivery: the chat transcript renders `.docx`/`.pptx`/`.xlsx`/`.pdf` links as "二进制文件，无法显示改动" and the user cannot open them.

- Creating a file: write it into the user's workspace, verify it, then `present`.
- Editing an existing file: never overwrite the original. Write `<original>-edited.<ext>` (or a name the user asked for), verify it, `present` it, and state both paths.

## Annotations

The user may reply with an `office-annotations` block: `[{ page, text, requirement, region: { left, top, width, height } }]`. `region` is normalised 0–1 against the rendered preview page the user drew on; `requirement` is free-form natural language. Treat it as a change request, not as editor state: locate what the region covers, apply the smallest edit that satisfies `requirement`, re-render, and confirm the region now looks right.

When the payload cannot be mapped to a concrete object (the region is empty or the file has no geometry), do not guess silently — say what you could not locate.

**pptx mapping.** `page` is the preview slide index (1-based, the `slide-NN.png`
you rendered). The region selects shapes whose bounding box overlaps it:
`left_in = region.left * slide_width_in`, and likewise for top/width/height.
`text` disambiguates overlapping shapes (a title over a background panel).
Resolve candidates from
`container_tools/inspect_presentation_layout_geometry.py --json-out geometry.json`,
then apply the edit through a mutation tool or a recipe. Full procedure:
[tasks/apply-annotations.md](tasks/apply-annotations.md).

## Verify

Render, look at every page, then deliver — in that order, with nothing skipped.

```bash
"<python>" "<skill>/container_tools/render_slides.py" --input "<file.pptx>" --out-dir "<render-dir>"
```

`render_slides.py` uses the CLI's `pptx render` — which drives Microsoft
PowerPoint, WPS Presentation, or LibreOffice, whichever is installed — and falls
back to a draft preview when none is, so this one command is always the right
entry point. The JSON names the engine it used in `engine`.

Then open each PNG with `read_image` (or build one sheet with
`"<skill>/template_following_scripts/make_contact_sheet.py"`). Check: titles
one or two lines, body ≥ 18 pt, nothing clipped or outside the slide, no empty
placeholder, table and chart not overlapping, chart readable at thumbnail size.

If no office suite is installed, `render_slides.py` falls back to
`--engine draft`, a PyMuPDF geometry preview. It proves placement, not
typography — say which one you used.

Gates that print JSON with a `passed` field, all blocking when they say `false`:
`inspect_presentation_package_integrity.py`,
`inspect_presentation_layout_geometry.py`, `native_chart_title_gate.py`,
`native_quantitative_chart_gate.py`, `native_table_arithmetic_gate.py`,
`template_source_fidelity_gate.py`. Details:
[tasks/inspect-and-verify.md](tasks/inspect-and-verify.md).

Never present a deck you have not rendered and looked at.

## Tasks

One file per job:

| Job | Start here |
|---|---|
| Create a deck | [tasks/create-deck.md](tasks/create-deck.md) |
| Edit an existing deck | [tasks/edit-deck.md](tasks/edit-deck.md) |
| Inspect, gate and verify | [tasks/inspect-and-verify.md](tasks/inspect-and-verify.md) |
| Follow a supplied template | [tasks/template-following.md](tasks/template-following.md) |
| Charts, tables, speaker notes | [tasks/charts-tables-notes.md](tasks/charts-tables-notes.md) |
| Apply an annotation payload | [tasks/apply-annotations.md](tasks/apply-annotations.md) |

## Tools and recipes

Mutations (each prints one JSON object, exits non-zero on failure, defaults to
`<original>-edited.pptx`):

| Need | Command |
|---|---|
| Find/replace text, run-level | `"<skill>/container_tools/replace_text.py" --input "<deck>" --find "old" --replace "new"` |
| Append slides | `"<skill>/container_tools/add_slides.py" --input "<deck>" --spec "<slides.json>"` |
| Title/author/subject/keywords | `"<skill>/container_tools/core_properties.py" --input "<deck>" --title "..."` |
| Render (office, else draft) | `"<skill>/container_tools/render_slides.py" --input "<deck>" --out-dir "<dir>"` |
| Contact sheet / montage | `"<skill>/template_following_scripts/make_contact_sheet.py" --dir "<dir>" --out "<sheet.png>"` |

Template flow: `inspect_template_deck.py` → write a frame map →
`validate_template_plan.py` → `prepare_template_starter_deck.py` →
`check_template_fidelity.py`.

Recipes (paste-runnable, each with the pitfall it avoids):
[README](recipes/README.md) ·
[textbox at a coordinate](recipes/textbox-at-coordinate.md) ·
[auto-layout](recipes/autolayout.md) ·
[tables](recipes/tables.md) ·
[native charts](recipes/native-charts.md) ·
[masters and layouts](recipes/master-and-layouts.md) ·
[speaker notes](recipes/speaker-notes.md) ·
[theme tokens](recipes/theme-tokens.md) ·
[rich text runs](recipes/rich-text-runs.md) ·
[images](recipes/images.md) ·
[connectors](recipes/connectors.md).

Guidance: [authoring workflow](references/authoring-workflow.md) ·
[style](references/style-guidelines.md) ·
[bullets](references/native-bullets.md) ·
[evidence](references/native-evidence.md) ·
[templates](references/templates.md) ·
[finalization](references/finalization.md) ·
[finance decks](domain_guidance/finance.md) ·
[Google Slides hand-off](routing/google_slides.md).

## Non-negotiables

- One idea per slide; a title is a claim, not a label.
- Body ≥ 18 pt, title ≥ 28 pt, captions ≥ 12 pt.
- Native charts and tables, never a picture of a spreadsheet.
- Every placeholder filled or deleted; no "Chart Title", no trailing full stop
  on a heading.
- Numbers in the deck must agree with the numbers that were supplied.
- New output lives in the user's workspace; an edit is a new file.

## Genuine gaps

- No Microsoft Office, WPS Office, or LibreOffice installed → no true render;
  use `--engine draft` and say the check was geometric. Installing any of them
  fixes it.
- Fonts the user's machine lacks are substituted by any renderer; the pack
  cannot install fonts.
- Google Slides import fidelity is out of our control; see
  [routing/google_slides.md](routing/google_slides.md).

## Shared workflow

Use `"<shared>/common-workflow.md"` for the cross-format delivery and
verification loop, and `"<shared>/annotation-recipes.md"` when turning an
annotation payload into an edit.
