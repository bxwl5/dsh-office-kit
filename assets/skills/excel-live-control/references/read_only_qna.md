# Answering questions about a workbook the user has open

Read-only work: no writes, no saves, no restyling. The deliverable is an answer with cell
references the user can check, not a changed document.

## Reading

- `info` first: which workbook, which sheets, which used ranges, tables, charts, pivots.
  That tells you where to look and whether the thing the user is asking about even exists.
- `read_range --formulas` for the cells that matter. You almost always need both: the
  value tells you *what*, the formula tells you *why*. A number with no formula behind it
  is an input the user typed; a formula with no precedent is a number you cannot trust.
- `read_range --display` when the question is about how something *reads* (`###`, a
  truncated label, a date that shows as a serial). Displayed text follows the number
  format; the value does not.
- Read the workbook's own labels — row and column headers, period names, "Actual" vs
  "Forecast" markers, units — before interpreting a cell. `D14` is only meaningful when
  you know it is "Q3 advertising spend, USD".
- The window may be ahead of the disk file. If `info` shows `saved: false`, the numbers
  you read are the user's unsaved state; say so if the answer would differ from the file.

## Answering

1. **Locate the output by its labels**, not by guesswork: find the row/column that names
   the metric and the period the user asked about, then read the intersection.
2. **Trace the precedent chain** back from the output to labelled assumptions or raw
   inputs. `read_range --formulas` on each step; stop at cells whose value is typed rather
   than computed. Reporting an intermediate total as the cause is the classic error.
3. **Reconcile before asserting.** If a total does not equal the sum of its parts, that is
   the finding — report the gap and the cells, do not average it away.
4. **Compute from the underlying values.** A cell showing `1.2` may hold `1.2345`; the
   answer to "what is the margin" uses the stored value, and if the requested precision
   needs the rounded number, say that you are using the displayed value.
5. **Rank drivers** by absolute contribution when the question is "why did it move".
   Report the top two or three with their cells and amounts, not a list of everything.
6. **Cite cells** in the reply: `` `Summary!D14` shows 1,234 units because `Build!F7:F12`
   sums to that ``. A claim without an address is not verifiable.
7. If two sheets disagree, say which one you believe and why (more recent period, source
   data rather than a copy, a formula chain rather than a paste), and do not "fix" either
   without being asked.

## Sensitive reviews

Clinical records, payroll and individual compensation, customer-level data: answer at the
level the user asked for and no lower. Inspect structure, formats, dependency chains and
formulas as evidence, and do not echo restricted values into the chat unless the user
needs that exact figure to act. If the question cannot be answered without exposing
personal data, say what you can answer instead.

## Limits

- Do not equate the live window with the saved file, and do not present a read-only
  question as if you had verified the disk copy.
- If a formula depends on external links, volatile functions (`NOW()`, `RAND()`) or a
  pivot cache that has not been refreshed, say the number is provisional.
- If the workbook is protect-structured or the sheet is protected, reads still work;
  report the protection rather than working around it.
- `#REF!`, `#DIV/0!` and friends in the cells are part of the answer, not noise: name the
  cell, the formula and what it broke.
