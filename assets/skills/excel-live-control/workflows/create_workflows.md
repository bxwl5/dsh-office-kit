# Creating content in a live workbook

The user is watching, so the order you do things in is visible. Plan on paper first, then
make a small number of writes.

## 1. Decide what is actually being created

Before you write a cell, you should be able to answer:

- **Who reads it, and what decision does it support?** A one-page summary for a committee
  and a working model for an analyst are different sheets.
- **What are the outputs?** Name them. Each output is a number with a label, a period and
  a unit.
- **What are the inputs?** Name them, with their sources. Inputs nobody will update are
  decoration.
- **What is calculated in between?** The steps between input and output are what a reviewer
  audits; if you cannot name them, the model is not designed yet.
- **What would make it wrong?** A check or a reconciliation, even one line: totals tie,
  parts sum to the whole, cash ends at the right balance.

If the request leaves two of these open, ask one short question rather than guessing —
a live edit is expensive to unpick.

## 2. Where it goes

- Roles, not a fixed tab count: inputs, assumptions, calculations, outputs. A small sheet
  can carry several roles; a large model separates them.
- Outputs at the left of the tab strip, workings in the middle, inputs at the right; a
  check/audit tab last if the model warrants one. Do not add a Checks tab to a simple
  sheet — a labelled verification row is enough.
- Keep inputs next to the calculations they feed when the model is small; move them to a
  dedicated input sheet only when more than one sheet consumes them.
- Calculate once, link everywhere else. Two cells computing the same number is a future
  disagreement.
- Insights (a short comment or a highlighted conclusion) go next to the result they
  explain, not in a separate "insights" area.

**Adding a tab is not an operation of this skill.** The tool writes into sheets that
already exist. If the job needs a new sheet, ask the user to insert one (Right-click a tab
→ Insert), or use the file route in `../../office-spreadsheets/SKILL.md` and tell them to
reopen. Do not repurpose an existing sheet as scratch space.

## 3. Write it

```
info                                             # confirm workbook, sheet, used range
write_range --sheet "Inputs" --range B4:C9 --data-file inputs.json
set_formula --sheet "Inputs" --range D4:D9 --formula "=B4*C4"   # fills down with relative rows
style_range --sheet "Inputs" --range B3:D3 --style '{"bold":true,"border":"outline"}'
recalc
read_range --sheet "Inputs" --range B3:D9 --formulas
```

- One `write_range` per block with its real shape. The array is rows × columns; do not pad
  with empty strings to make it rectangular — use `null` for a genuinely empty cell.
- Write the labels and the units with the numbers. A block of bare numbers is not done.
- Default formats in the write step, not afterwards: `number_format` in `style_range`
  applied to the whole block is one call and keeps every cell consistent.
- Formulas as text starting with `=`, absolute where they must stay put (`$C$4`), relative
  where the fill should walk (`D5`). Test one cell before filling a column.
- If the sheet already has content, check the used range first and write beside it, not
  over it.

## 4. Check it, then say what you did

- `read_range --formulas` over everything you wrote; `errors` must be empty.
- `recalc`, then read the outputs again — a formula that never calculated proves nothing.
- `info` if you added tables or charts, to confirm they landed on the sheet you meant.
- Report the ranges and the state of the document (unsaved, or saved where). See the
  Delivery section of `../SKILL.md`.

## 5. Sizing and layout

- Set column widths after the content exists, from the widest formatted value, then
  re-read with `--display` to catch `###`.
- Wrap long text labels instead of widening a column to half the screen.
- Helper calculations go in their own block or sheet, labelled, not buried between two
  output rows.
