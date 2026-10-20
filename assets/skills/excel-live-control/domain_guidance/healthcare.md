# Healthcare

Two kinds of workbook live in a health organisation, and they carry different rules:

- **Clinical and patient records**: appointments, encounters, observations, results.
  The source of truth is a clinical system; a workbook holds an extract.
- **Administrative and financial work**: budgets, staffing, throughput, cost per case.
  Money follows `financial_models.md` even when the organisation is a hospital.

Most healthcare spreadsheet tasks are the second kind built on top of the first. Keep the
extract and the analysis visibly separate.

## Handling the raw extract

- Put raw data on its own sheet or block, untouched, one table. Everything you compute
  lives *beside* it or in a separate prepared block — never by overwriting a measurement.
- Descriptive names help the next reader: `Appointments_RawData` beats `Sheet2`;
  `Clinic KPI Dashboard` beats `Sheet5`.
- Keep the source's definitions with the data: the period it covers, the extract date, the
  source system, the denominator used. Length of stay, readmission rate and utilisation
  are meaningless without them, and definitions differ between systems.
- Preserve identifiers exactly as supplied (MRN formats vary), and keep dates as dates with
  one format down the column.
- Units belong in the header (`Weight (kg)`, `Temperature (°C)`, `HbA1c (%)`, `Heart rate
  (bpm)`), not in the cells as text. A column of `"72 bpm"` strings cannot be averaged.

## Building on it

- Highlight the fields staff must complete (amber fill) and keep unused placeholders out.
- If a threshold drives a flag, use one named cell for it (`BMI_threshold`) and reference
  it, so the cut-off is visible and changeable. A number buried in a formula is an
  invisible policy.
- Flags come only from a stated source or protocol threshold, and keep the severity the
  source gives (normal / elevated / high), with a legend on the sheet. Do not invent
  clinical ranges, do not round a borderline value into a category.
- A codebook (code → meaning, units, abbreviations) next to the data when the extract uses
  codes, or a legend when it uses abbreviations.
- Keep a `Corrected value` column or an audit log for corrections. Never edit the original
  measurement in place; the original and the correction are both evidence.

## Consequences of getting it wrong

Clinical arithmetic and clinical judgement are different things. Compute what the source
supports; verify a critical calculation (dosing, risk score, threshold classification)
against the authoritative definition when one is available, and if it is not available say
so instead of asserting the number is right. Do not give clinical advice, and do not
present a screening flag as a diagnosis.

## Doing it live

- The user may have the extract open with their own formatting. Read before writing:
  `info` for the sheets and used ranges, `read_range --formulas --display` for the block
  you are extending.
- Add derived columns to the right of the raw block with a clear header, or to a separate
  prepared area; never insert a column into the middle of an extract that other formulas
  or a pivot already reference.
- After writing, verify with `read_range --formulas` and check the `errors` array — a
  healthcare sheet with a `#DIV/0!` in a rate column is a report that will be misread.
