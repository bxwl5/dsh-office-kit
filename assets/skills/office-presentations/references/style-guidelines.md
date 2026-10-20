# Style guidance

## The type scale

Three sizes are enough: title, body, caption. A fourth size is a decision the
audience has to make, and they will make it wrongly.

| Role | Size | Weight | Colour |
|---|---|---|---|
| Cover title | 40–48 pt | Bold | Ink |
| Slide title | 28–36 pt | Bold or semibold | Ink |
| Body | 18–22 pt | Regular | Ink |
| Lead-in number | Same as body + bold | Bold | Accent |
| Caption, source | 12–14 pt | Regular | Muted |

Rules that carry the rest:

- One typeface family. A second family means "different voice", so use it for
  one thing (a quote, a code line) and nothing else.
- Bold is emphasis, not decoration: at most one bold phrase per paragraph.
- All-caps for a 2–4 word label is a design choice; all-caps for a sentence is
  a readability tax.
- Left-align body text. Centred paragraphs longer than two lines are hard to
  track back to the next line.

## Colour

- One ink, one muted, one accent, plus the template's own rule colour. More
  than that and the accent stops meaning "look here".
- Contrast is a correctness issue: body text on white needs a dark ink
  (roughly luminance ratio 4.5:1), and text over a photograph needs a scrim,
  not luck.
- Never encode meaning in colour alone — an accent bar showing the direction of
  a metric also needs an arrow or a word.
- Chart series colours come from the theme; a sixth series colour is a signal
  that the chart has too many series.

## Density

- Body blocks stop at about 6 lines of 18 pt on a 16:9 slide before the eye
  stops at the middle.
- A table on a slide reads at up to about 7 rows × 4 columns. Beyond that it is
  an appendix, and the slide should carry the one row that matters.
- Whitespace is a layout element, not leftover space: leave at least 0.6 in
  between content blocks and the slide edge.
- One idea per slide. If the title needs "and", split.

## Cover art direction

A cover carries three things: the title, the context line, and the visual that
sets the tone. Keep them separate roles.

- Abstract geometry, a photograph of the actual subject, or a flat colour field
  all work. Clip art of a handshake does not.
- If the visual is photographic, darken it (a scrim at 40–60% black) under the
  text rather than hoping the text lands on a dark region.
- If no suitable image exists, use a colour field plus an accent rule. An
  invented diagram pretending to be a photograph is worse than a plain cover.
- Encode the deck's palette: if the accent is amber, the cover visual should
  contain amber, not a random sunset.
- Never ship a screenshot of a tool, a UI or another slide as cover art.

## Closing slides

The last slide restates the ask in one line and nothing else. "Thank you" alone
wastes the slot the audience is still looking at while they gather their things.
