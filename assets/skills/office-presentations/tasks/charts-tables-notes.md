# Task: charts, tables and speaker notes

Three things that look like one job and share one rule: the numbers must be
checkable from the file.

## Charts

Native, always:

```bash
"<python>" "<cli>" pptx create --spec with-chart.json --out charted.pptx
```

or the recipe when you need control of axis, labels or legend:
[native-charts](../recipes/native-charts.md).

Spec keys the builder accepts: `type` (`bar`/`column`/`line`/`pie`, where bar and
column both render as a clustered column), `title`, `categories`,
`series[{name, values}]`, `left`, `top`, `width`, `height`.

- The chart title says what the chart means; the slide title states the
  conclusion. If both say the same thing, drop the chart title.
- Categories in the order the reader thinks in.
- Bars start at zero.
- A chart that duplicates a table on a neighbouring slide is a review finding,
  not a second view — pick one.

Verify:

```bash
"<python>" "<skill>/container_tools/native_chart_title_gate.py" --input charted.pptx
"<python>" "<skill>/container_tools/native_quantitative_chart_gate.py" --input charted.pptx --all-slides
```

## Tables

Spec form (`{"headers": [...], "rows": [[...]]}`) puts the table at the cursor,
full width; the [tables recipe](../recipes/tables.md) gives you the rect, column
widths, alignment and the total row styling.

Rules: numbers right-aligned, units in the header, total row computed not typed,
seven rows maximum on a slide.

Declare each total so it can be proved:

```bash
"<python>" "<skill>/container_tools/native_table_arithmetic_gate.py" --input charted.pptx --contracts totals.json
```

A mismatch exit code is a data bug or a rounding bug. Fix the number or declare
the rounding; never lower the tolerance to make it pass.

## Speaker notes

Notes live beside the slide, not on it:

```bash
"<python>" "<cli>" pptx read --input deck.pptx   # does not print notes
```

Write them with the [speaker notes recipe](../recipes/speaker-notes.md), then
confirm they landed:

```bash
"<python>" "<skill>/container_tools/inspect_presentation_package_integrity.py" --input deck-notes.pptx
```

`notesSlides` in the part counts should equal the number of slides you wrote
notes for.

Notes carry: the sentence you will say, the provenance of any non-obvious
number, and the answer to the question the slide invites. Nothing that belongs
on the slide.

## Putting them together

A results slide usually wants: one claim as the title, one chart as the
evidence, one caption as the source, and the detail in notes. If it needs a
chart *and* a table, it is two slides — or the table is an appendix.
