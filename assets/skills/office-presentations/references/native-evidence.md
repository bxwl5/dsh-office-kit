# Evidence on slides: charts, tables, notes

"Evidence" is anything on a slide that claims a fact: a number, a chart, a
table, a quotation. The rules below keep it checkable.

## Native or it did not happen

| Claim | Correct form | Wrong form |
|---|---|---|
| Trend over time | Native chart with categories and series | Screenshot of a chart |
| Exact figures | Native table | Image of a spreadsheet |
| A single number | A bold run in a sentence | A one-bar chart |
| A process | Shapes plus connectors | Image of a flowchart |

The wrong column has one shared defect: the audience cannot read it at projector
size and nobody can verify it. Native charts and tables also keep their numbers
in the package, which is what lets `container_tools/native_quantitative_chart_gate.py`
and `container_tools/native_table_arithmetic_gate.py` check them.

## Charts

- The chart title says what the chart means. The slide title says the conclusion.
  Two titles, two jobs — if they are the same sentence, drop the chart title
  (`chart.has_title = False`) rather than repeat it.
- Bars start at zero. Lines may start elsewhere only if the axis is labelled.
- Categories in the order the audience thinks in (Q1..Q4, not alphabetised).
- Label the few numbers that matter, not every point. Ten data labels is a
  table with rounded corners.
- One axis. Two y-axes on a slide chart is a way to imply a correlation that may
  not exist.
- Source and window in the caption: "Driver logs, FY2026, 12 sites".

## Tables

- Column order follows the reader's question: what, then how much, then change.
- Header row is bold and distinct; total row is bold and separated.
- Numbers right-aligned, one decimal convention per column.
- A total is arithmetic the reader can check. Fill it from the data, never by
  eye, and let the table arithmetic gate confirm it.
- Do not put units in every cell; put them in the header.
- A table with more than about 7 rows belongs in an appendix, with the slide
  stating the conclusion.

## Speaker notes as provenance

Notes are where "where did this number come from" lives, so the presenter can
answer without the slide turning into a footnote.

- One note per non-obvious number: source, date range, and any caveat.
- The sentence you will actually say, in spoken words.
- No bullet-stacking in notes; notes are prose.
- Notes are invisible to the render loop — verify them from the file, not the
  PNGs. `container_tools/inspect_presentation_package_integrity.py` counts
  `notesSlides`, and the package dump shows their text.

## Fidelity gates

Before presenting a deck that carries numbers:

```bash
"<python>" container_tools/native_quantitative_chart_gate.py --input deck.pptx --all-slides
"<python>" container_tools/native_table_arithmetic_gate.py --input deck.pptx --contracts totals.json
"<python>" container_tools/native_chart_title_gate.py --input deck.pptx
```

Each prints one JSON object whose `passed` field is the decision. A failing gate
is not advisory: it means the slide asserts something the file cannot support.
