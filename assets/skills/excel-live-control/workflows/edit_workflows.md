# Editing a workbook the user already built

The existing workbook is the reference. Its structure, formula style, formats, labels and
navigation are what the user expects to keep seeing; your job is to make one change that
looks like it was always there.

## Read the ground first

Nothing below works without this step, and it is cheap:

1. `info` — workbook name and path, `saved` flag (unsaved work in progress!), sheets,
   used ranges, tables, charts, pivots, protection.
2. `read_range --formulas` over the block you are about to touch **and its neighbours**.
   You need to know the pattern a formula follows before you extend it.
3. `read_range --display` when the change is formatting — it tells you the current number
   format's effect, not just the stored value.
4. Read the labels around the block: period, unit, actual/forecast. A number is only
   meaningful with its label, and your new row must match the surrounding convention.

If the target block holds values you cannot explain from the request, stop and ask. On a
live document, "I thought it was empty" is how an analyst's afternoon disappears.

## Rules of the edit

- **Change the cells the request names, and the formulas those cells feed.** A changed
  input propagates on its own; do not hand-edit downstream totals.
- **Do not add, remove, rename, reorder or split sheets/tabs** unless the request says so
  or the change genuinely cannot be expressed otherwise (a new output with no home).
- **Preserve everything you did not create**: other sheets, formulas, named ranges,
  comments, protection, hidden or grouped rows, freeze panes (user-set), native tables and
  their structured references, pivot sources, shared formulas, filters, external links,
  `INDIRECT` routing, calculation settings.
- **Never flatten formulas to values.** Not to "simplify", not to "fix" a display problem.
- **Extend, do not replace.** When a row or column is added to a block that has a table,
  conditional format or chart on it, extend the object to cover the new cells instead of
  building a parallel object beside it. `ListObject.Resize` and the chart's
  `SetSourceData` are the tools.
- **Small visual fixes stay local.** Widen the one column that clips. Do not autofit the
  sheet, do not restyle a header because it is not your default style.
- **Match the existing formula conventions** — anchoring style, `SUMIFS` vs `SUMPRODUCT`,
  rounding, the workbook's error handling. A locally "better" formula that reads
  differently is a maintenance cost the user did not ask for.
- **Pre-existing errors are not yours to fix.** Report them with the cell and the formula
  and ask. Silently repairing a `#REF!` can change a number the user relies on.

## Doing it

```
read_range --sheet "Build" --range D5:F12 --formulas     # understand the pattern
write_range --sheet "Build" --range D13:F13 --data '[...]'   # the new row only
set_formula --sheet "Build" --range G5:G13 --formula "=SUM(D5:F5)"
style_range  --sheet "Build" --range D13:F13 --style '{"number_format":"#,##0"}'
recalc
read_range --sheet "Build" --range D5:G13 --formulas     # prove it
```

- Keep writes to the named rectangle; `--clear` only on a range whose previous contents
  you have read and can restore.
- Style by copying the neighbouring block's codes: read a cell you want to match, mirror
  its `number_format`, and apply it to the new cells. Do not invent a new format for one
  row.
- If a formula in the new cell must differ from the pattern (a different anchor, a
  one-off), say why in the reply — a reviewer will find it.

## When you are done

- `read_range --formulas` over every cell you changed and its immediate neighbours.
- `recalc` after formulas, then re-read the outputs that depend on them.
- `info` if tables, charts or pivots were extended, to confirm the objects still exist and
  cover the new cells.
- Report: sheet, exact ranges, cell counts, and what the document's saved state is. If the
  edit touched a formula graph, say which outputs were affected.
