# The COM object model behind a live edit

What this skill talks to is not a file. It is an out-of-process COM server that happens
to own a window: every property read and every write is a remote call across process
boundaries, and every object you hold is a proxy that re-reads state when you ask it.
That explains most of the rules below.

`container_tools/live_excel.py` wraps the common cases. Read this when the CLI has no verb
for what the task needs, when a call fails in a way the JSON does not explain, or when you
are extending the tool.

## Reaching the running instance

```powershell
$app = [Runtime.InteropServices.Marshal]::GetActiveObject('Excel.Application')
```

- This is the only supported way to find a *running* instance. `New-Object -ComObject
  Excel.Application` creates a new, invisible one — never do that for user work.
- It exists in Windows PowerShell 5.1 (`powershell.exe`). PowerShell 7 (`pwsh`) removed
  the method, which is why the tool shells out to `powershell.exe` and not `pwsh`.
- With nothing running it raises `0x800401E3 (MK_E_UNAVAILABLE)`. That is the signal to
  ask the user to open the workbook, not to launch anything.
- WPS Spreadsheets registers both `Ket.Application` and `Excel.Application`, so a
  successful attach to `Excel.Application` does not prove Microsoft Excel is running.
  `Application.Name` and `Application.Version` are worse than useless here — WPS reports
  `Microsoft Excel` / `12.0`. Infer the product from `Application.Path`.
- The running-object table is per user session and survives the process that created the
  instance. A hidden instance launched for a self-test stays attachable from later calls;
  it stays invisible until something shows it, and it leaks until `Application.Quit()`.

## Addressing

`Application` → `Workbooks` → `Workbook` → `Sheets` → `Worksheet` → `Range`.

- Collections are **1-based**: `$book.Sheets.Item(1)`. `Item(0)` throws.
- `$sheet.Cells` is the whole sheet; `$sheet.UsedRange` is the rectangle that has content
  or formatting. `UsedRange` is not trimmed by deleting a value in its last cell; treat
  it as a hint for what to read, never as the boundary of an edit.
- A1 strings: `A1`, `B4:D9`, `$B$14`, `Sheet1!A1:C9`, `'Build Detail'!E14` (quote sheet
  names containing spaces). `Range.Address($row_absolute, $column_absolute)` prints one
  back, e.g. `$r.Address(0,0)` gives `A1:C3`. Prefer reporting the absolute form the user
  can paste into the Name Box.
- Sheet names are case-insensitive in .NET-side matching but must match for COM:
  `$book.Sheets.Item('Build')` throws on `build`. Use `Worksheet.Name` for the exact
  spelling.
- Multi-area ranges (`A1:A5,C1:C5`) exist; the tool refuses them for writes because a
  rectangular `Value2` assignment cannot fill them.

## Cells: what you write and what comes back

| Property | Use it for | Reads back |
| --- | --- | --- |
| `Range.Value2` | every value: numbers, text, dates (as serials), booleans, arrays | typed scalars / `Object[,]` |
| `Range.Formula` | formulas in A1 notation; also the way to read them back | `String`, e.g. `=SUM(B2:B9)` |
| `Range.FormulaR1C1` | fills where you think in offsets | `String` |
| `Range.Text` | the *displayed* string (after number format) | per-cell only |

- **`Value2` is type-preserving and locale-blind.** Assign a `Double` and the cell is a
  number; assign a `String` and it is text — except that the application may *parse* a
  string that looks like a date, a currency amount, or `=1+1`. Writing `"2026-01-31"`
  through `Value2` produced the serial `46053` in a date-formatted cell. If the user meant
  the literal text, store the serial (or the number) and set a number format, or prefix
  the apostrophe; do not rely on the parse.
- **`$null` empties a cell.** That is the supported way to clear one value inside a block
  you are writing.
- A multi-cell read returns a 2-D `Object[,]` with **1-based** indices. A single cell
  returns a scalar, so code that always indexes `[1,1]` fails on one-cell ranges.
- **Errors come back as integers.** A live value of `#DIV/0!` is the Int32 SCODE
  `-2146826281`; `#VALUE!` is `-2146826273`, `#REF!` `-2146826265`, `#NAME?`
  `-2146826259`, `#NUM!` `-2146826252`, `#N/A` `-2146826246`. In WPS,
  `WorksheetFunction.IsError` returns `False` for them and `SpecialCells(16)` throws, so
  the practical test is "is this value an Int32?" — then read `Range.Text`,
  `Range.Formula` and `Range.Address(0,0)` for that cell alone.
- `Range.Text` is a per-cell property. On a multi-cell range WPS returns `DBNull`, so the
  tool reads it cell by cell (that is why `--display` is capped).
- **Assigning one formula to a range fills it with relative adjustment.** Setting
  `A1:A3` to `=B1` gives `=B1`, `=B2`, `=B3`. This is the cheap way to fill a column; it
  is also the way to accidentally create a formula you did not intend when the target is
  more than one cell.
- Dates are serials (`days since 1899-12-30`, the 1900 date system). `DateSerial(y,m,d)`
  gives the number; a `NumberFormat` gives the look.
- Formulas are text. There is no calculation on write; the value updates when the
  application recalculates, which is why `recalc` exists.

## Number formats

`Range.NumberFormat` takes format *codes*, not locales: `#,##0`, `#,##0.00`, `0.0%`,
`"$"#,##0.00`, `mmm-yy`, `d-mmm`, `@`. Use invariant ASCII codes — the dot is always the
decimal point inside the code, whatever the machine's `Application.DecimalSeparator`
says. WPS returns empty strings for `DecimalSeparator`/`ThousandsSeparator`, so do not
read locale from the app and do not build codes from locale data.

- Format is display only. The stored value keeps full precision; never round data to make
  it read right.
- One format per column. Mixing `#,##0` and `#,##0.00` down a single column is the most
  common visual defect in a live sheet.
- Percentages carry precision: one decimal for analytical tables, zero for dashboards,
  two when the differences are small. The code encodes that: `0.0%`, `0%`, `0.00%`.
- `###` in the window means the column is too narrow for the formatted value, not that
  the value is wrong. Widen with `ColumnWidth` (points-ish, default about 8.43) or
  `EntireColumn.AutoFit()`, and check the result with `--display`.

## Colour is BGR

`Interior.Color` and `Font.Color` are OLE colour longs written `0xBBGGRR`, while every
spec in this repo is `#RRGGBB`. Convert explicitly:

```
ole = red + green * 256 + blue * 65536        # #RRGGBB -> BGR long
```

`#C00000` becomes `192`; a pure blue fill becomes `16711680`. Setting `ColorIndex = -4142`
removes a fill (`Interior.Color` then reads back `16777215`). Theme colours and tints are
not addressable this way: if the workbook's palette matters, use the workbook's own
existing colours rather than inventing one.

## Font, borders, alignment, layout

- `Range.Font`: `Name`, `Size`, `Bold`, `Italic`, `Color`, `Underline`, `Strikethrough`.
  One family across the sheet; the repo default is Helvetica Neue → Helvetica → Arial →
  Aptos, whichever the workbook already uses.
- `Range.Borders.Item(index)`: 7 left, 8 top, 9 bottom, 10 right; `LineStyle` (1 continuous),
  `Weight` (2 thin), `Color`. `BorderAround(1, 2)` draws a thin outline in one call.
- `HorizontalAlignment` / `VerticalAlignment` take `xlHAlign*` constants (`-4131` left,
  `-4108` center, `-4152` right) and `xlVAlign*` (`-4160` top, `-4108` center, `-4104`
  bottom). The tool maps the readable names for you.
- `Range.Merge()`, `Range.UnMerge()`, `Range.WrapText`, `Range.IndentLevel`,
  `EntireColumn.ColumnWidth`, `Tab.Color`, `Rows.Hidden`.
- `FreezePanes` lives on `Window`, not on the sheet, and did not stick on a hidden
  instance in WPS. The tool deliberately has no freeze-pane verb; if the user needs panes
  frozen, tell them to do it, or do it visibly in a shown window.
- Whole-sheet `AutoFit` and `Select`/`Activate` are traps: they change the user's view,
  can take seconds on a large sheet, and `ScreenUpdating` does not hide the flicker from a
  user who is looking at the window.

## Objects beside the cells

- **Tables**: `$sheet.ListObjects.Add(1, $range, [Type]::Missing, $has_headers)` creates
  a `ListObject`. PowerShell cannot reproduce VBA's empty argument positions — pass
  `[Type]::Missing` for the `Destination` slot. Created tables get localized default
  names (`表1`), so name them. With `has_headers = 0` the application *generates a header
  row above the data*, which shifts the values down one row and makes the table one row
  taller than the range you named. Extend an existing table with `ListObject.Resize`
  rather than adding a second one over the same cells.
- **Charts**: `$sheet.ChartObjects().Add(left, top, width, height)` → `.Chart` →
  `.SetSourceData($range)` + `.ChartType`. `HasTitle`/`ChartTitle.Text` set the title.
  `ChartType` numbers: column 51, stacked column 52, bar 57, stacked bar 58, line 4, line
  with markers 65, area 1, stacked area 76, pie 5, doughnut -4120, scatter -4169,
  scatter with lines 74. A chart over an empty range renders blank — check the source
  cells before blaming the chart.
- **Shapes**: `$sheet.Shapes.AddShape(...)`, `AddTextbox`, `AddPicture`. They float over
  cells and are not part of the used range; anchor them to a cell (`TopLeftCell`) so they
  move with the data.
- **Pivots**: `PivotTables`, `PivotFields`. Read and report them; never rebuild one
  through COM unless the user asked for a new pivot — the field layout is not recoverable
  from a failed attempt.
- **Names**: `$workbook.Names`, `Range.Name`. Names break when you delete the cells they
  point at (`#REF!` in the name), so a rename or a row delete is a contract change.
- **Conditional formats**: `Range.FormatConditions`. Appending a condition to a range
  that already has one edits the *existing* set; a "fix" here can silently change rules
  the user depends on. Read first, and keep the range bounded.
- **Validation**: `Range.Validation` — same rule. Read the existing rule before writing a
  new one.

## Calculation and freshness

- `Application.Calculation`: `-4105` automatic, `-4135` manual. A workbook left in manual
  mode shows stale numbers after your edit; `recalc` runs `CalculateFull` across every
  open workbook and reports the mode it found.
- `CalculateFull` recalculates dependencies, not just the active sheet. `CalculateFullRebuild`
  rebuilds the dependency tree — use it only when a value looks impossible, because it is
  slow on a large model.
- Iterative calculation (`Application.Iteration`) is off by default. Circular references
  that "worked" for the user are a sign it was on; do not turn it on to make an edit
  succeed.

## Latency, failures, retries

- Every property access is an RPC. A trivial call (`info`, three reads) took about 1.2–1.5 s
  on this host; a call that formats 100 cells one at a time can take tens of seconds.
  **Batch**: one `write_range` for a block, one `style_range` for a range, one `set_formula`
  for a column. Do not loop calls per cell.
- The default timeout in the tool is 180 s. Raising it is legitimate for a big paste;
  lowering it below a second will fail on a busy application.
- Failures you will meet:
  - `0x800401E3` — nothing is running. Remediate by asking the user to open the workbook.
  - `0x8001010A` (RPC_E_SERVERCALL_RETRYLATER) — the application is busy (a modal dialog,
    a recalculation, a user dragging a window). Read again, and if it persists tell the
    user there is a dialog blocking the app.
  - "Object required" / a stale proxy — usually after the user closed the workbook you
    were holding. Re-attach by name; never reuse the old object.
  - A method that exists in Excel raising "does not contain a method named …" in WPS — the
    WPS object model is a subset. Fall back to a simpler route (formatting via
    `Value2`/`NumberFormat` instead of a specialised helper).
- **Nothing is transactional.** A call that fails halfway leaves the cells it already
  wrote. The retry protocol is: `read_range` the block, compare with intent, write only
  what is missing or wrong. Replaying the same batch is how a live document gets
  duplicated rows.

## The one rule that outranks the rest

A live edit mutates a document the user is looking at and may have unsaved changes in.
**Read and diff before writing.** `read_range` the target with `--formulas`; note whether
`info` says the workbook is `saved: false`; then make the smallest write that satisfies the
request. If the diff shows values you did not expect, stop and ask — the user's unsaved
work is more important than finishing the task.
