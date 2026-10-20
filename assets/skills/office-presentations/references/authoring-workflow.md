# Authoring workflow

## What a deck is, mechanically

A `.pptx` is a zip of XML parts: one `presentation.xml` naming the slide order, one
part per slide, a slide master per theme, a layout per family, chart parts with
embedded workbooks, notes parts, and a media folder. Everything the reader sees
comes from those parts, which is why the verification loop reads the file back
instead of trusting the code that wrote it.

Three consequences shape the whole workflow:

1. **Geometry is explicit.** Nothing reflows on open except autofit. If two
   shapes overlap in the XML, they overlap on screen.
2. **Inheritance is real.** A slide draws its background, type sizes and bullet
   glyphs from its layout and master. Overriding at slide level is a per-slide
   decision; overriding at master level is a deck decision.
3. **Data can stay alive.** A native chart or table keeps its numbers in the
   file and can be checked; a screenshot cannot.

## The loop

1. **Decide the story**: one sentence per slide, in order, before any XML. A
   slide without a sentence is a slide the audience will not read.
2. **Pick the frame**: slide size from the target (`13.333 × 7.5 in` is the 16:9
   default; check `prs.slide_width` of a supplied template, never assume).
3. **Place, top-down**: background, chrome, title, body, evidence. Later shapes
   paint over earlier ones.
4. **Fill or delete every placeholder.** An empty placeholder is visible in edit
   view and prints "Click to add text".
5. **Render, look, fix.** `container_tools/render_slides.py` then `read_image` on
   every PNG. Repeat until nothing surprises you.

## The numbers that keep a deck readable

| Element | Value | Why |
|---|---|---|
| Slide size | 13.333 × 7.5 in | 16:9; 10 × 5.625 in for 16:9 in "wide" templates |
| Margin | 0.6–0.9 in | Below 0.5 in a projector crops it |
| Title | 28–36 pt, bold | 44 pt only on covers |
| Body | 18 pt minimum | The back row rule |
| Caption / source | 12–14 pt | Never below 11 pt |
| Line spacing | 1.1–1.2 | Tighter crowds ascenders |
| Gap between blocks | 0.2–0.4 in | The eye groups by proximity |
| Footer zone | bottom 0.55 in | Keep text out of it |

Convert once and keep the numbers in EMU or inches, not mixed: `Inches(x)` in
code, `x * 914400` when you must talk to the XML directly.

## Deciding slide count

One idea per slide. If a slide has two headlines competing, it is two slides. If
it has one headline and a table too large to read at 14 pt, the table becomes an
appendix slide and the body slide states the conclusion in one line.

A presentation of N minutes needs roughly N/2 content slides at 60–90 seconds
each, plus a cover and a closing ask.

## Where the detail lives

- Type, colour, density and cover art: [style-guidelines](style-guidelines.md).
- Bullets that read as sentences: [native-bullets](native-bullets.md).
- Charts, tables and notes as evidence: [native-evidence](native-evidence.md).
- Supplied templates: [templates](templates.md).
- Pre-delivery checklist: [finalization](finalization.md).
