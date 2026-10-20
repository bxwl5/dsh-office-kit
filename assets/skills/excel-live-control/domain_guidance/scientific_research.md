# Scientific research data

The spreadsheet is often the only record of an experiment. Treat the observations as
irreplaceable: a cleaned value that overwrote a raw measurement is data loss, and a live
edit is one keystroke away from it.

## Keep the raw table raw

- One flat table: one row per observation, one variable per column, one unit per column.
  No merged cells, no multi-row headers, no calculation rows mixed into the data block.
- Do not overwrite a measurement. Transformations live in separate columns (clearly headed
  `log10(x)`, `normalised`) or in a separate processed block/sheet.
- Record the cleaning: which rows were excluded and why, which values were imputed, which
  units were converted. A protocol note on the sheet or a short note beside the block.
- Missing observations stay visibly missing (blank or `n.a.` as the table's convention
  dictates) — never silently zero-filled. Randomised and simulated values are labelled as
  such; they are not observations.

## Presentation tables are a different object

When the sheet is a report of the data rather than the data itself:

- One type of data per column, units in the header (`Concentration (mg/L)`), never inside
  the cell.
- Never encode meaning only in colour or bold — add a labelled value column (`Flag:
  excluded`, `Status: control`). A reader with a monochrome printout must still get the
  full information.
- Notes belong in a notes column, not in cell comments that a co-author will never see.
- No merged cells in a table you expect anyone to sort or filter.

## Analysis

- Prefer a transparent formula to a clever one. Someone has to defend this number in a
  review six months from now.
- Show the calculation steps: the intermediate columns are the evidence. Hiding them in a
  single formula makes the result unfalsifiable.
- A circular reference or iterative calculation is off-limits unless the user asks for it
  and documents it. A simulation's random seed and method are part of the result.
- Distinguish measurement, derived value, flag and assumption — by label, not by font
  colour alone.
- If the design of the analysis changes (an exclusion added, a normalisation changed), say
  so in the reply. A quiet change to a denominator rewrites the conclusion.

## Doing it live

- Before touching anything: `info`, then `read_range --formulas --display` on the block.
  Raw data and report blocks are usually on different sheets; confirm which is which.
- Append observations as rows at the bottom of the table, extend any table object to cover
  them, and keep the header row exactly as it is.
- Verify with `read_range --formulas`; the `errors` array catches the `#DIV/0!` and
  `#VALUE!` that appear when a text value lands in a numeric column.
- Never delete rows from the middle of a data table; a delete shifts every downstream
  formula and every chart range with it.
