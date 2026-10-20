# Style guidelines for a live sheet

Style is subordinate to content and to the user's own file. Precedence, strongest first:

1. What the user asked for, in this conversation.
2. The workbook's existing conventions — fonts, colours, borders, tab colours, number
   formats. Match them; do not impose a house style on someone else's document.
3. The domain guidance for the kind of model (`domain_guidance/`).
4. The defaults below.

Look before you paint: `info` for tab colours and structure, `read_range` for the formats
a neighbouring block already uses. Restyling a user's sheet because your defaults are
tidier is a defect, not a service.

## Defaults that are safe anywhere

- **Font family**: one per workbook. If it has none, Helvetica Neue → Helvetica → Arial →
  Aptos. **Two sizes**: 10 pt body, 14 pt title, 16 pt ceiling. Never introduce a third
  family or a decorative size.
- **Alignment**: text left, numbers right, headers centred horizontally and middle
  vertically. Do not centre numbers to look neat; they lose their decimal alignment.
- **Headers**: bold, one rule under the last header row (`border: "outline"` on the header
  block, or a bottom border on the row). No merged cells in working headers — merge only a
  single spanning title, and prefer Center Across Selection for that.
- **Inputs vs calculations**: an input cell the user is expected to type into gets a light
  fill (`#FFF2CC` amber) and a thin border; calculated cells keep a plain fill. If the
  whole block is inputs, one header note beats painting every cell.
- **Gridlines**: a clean output or dashboard sheet hides them (`ActiveWindow.DisplayGridlines
  = $false`, a view setting, not a cell format) and uses thin structural borders instead.
  A working sheet keeps them.
- **Borders**: outline a block, hairline between header and body. No box around every cell,
  no double lines, no thick decorative frames.
- **Column widths**: set them once per block (`column_width` in `style_range`), not per
  cell. Widen for the formatted value, then check with `read_range --display` for `###`.
- **Conditional formatting**: bounded to the data range, one or two rules. Never a whole
  column, never a rule that paints a user input cell.
- **Freeze panes** are not a styling nicety; the tool cannot set them on a hidden window.
  If scrolling is the complaint, say so and let the user freeze the row.

## Model layouts

- Summary above detail, outputs before workings, assumptions grouped in one block rather
  than scattered. A reader should be able to look at the top-left and understand the sheet.
- One blank row at the top of a new output sheet, the title in an unfilled cell on the
  left, a thin rule under it. No logo, no merged banner, no slogan.
- Rows of commentary go to the right of the numbers, separated by one blank column; they
  never sit between a label and its value.
- Helper rows: italic, grouped under the block they serve, collapsed if the workbook
  already uses grouping. Helper columns live outside the printed range or on a separate
  helper sheet.
- A case or scenario selector is a visible label plus a validated cell: `Case Selected:`
  and the value on display. Do not hide the control in a defined name.
- Section bands (a filled row spanning the table) get one outline around the whole
  section, not per row.
- Dark header fill with white text, or plain text with a rule. Pick one per workbook.

## Finance conventions

These are long-standing reader expectations in financial models; a reviewer notices when
they are violated.

- **Colour encodes provenance.** Blue font for editable hard-coded inputs, black for
  formulas on the same sheet, green for links to another sheet, red for links to an
  external workbook. Results on an output view stay black or the brand dark colour.
- **Number formats**: `#,##0` for amounts, `#,##0.00` for per-share and price data,
  `0.0%` for rates, `( )` for negatives and `-` for zero in accounting views
  (`#,##0;(#,##0);"-"`). Currency symbol on the first monetary row and on totals, not on
  every row.
- **Indent formats** (`  @` for text labels, `_(`-style spacing) map a hierarchy without
  empty columns.
- **Totals** sit flush left in the label column, bold, with the rule above them. A total
  that is a hard number rather than a formula is a finding, not a style choice.
- **Period labels** follow `mmm-yy`, `d-mmm`, `yyyy`, `Q#:YY`, `FY:YY` as the workbook
  already does. A date column has one format down its whole length.
- **Actuals vs forecast**: the change of basis is visible — a divide, a different fill, or
  a label — and never inferred from a colour alone.
- A model that needs a gutter between the row labels and the numbers gets columns A:B
  reserved for it. Do not retrofit a gutter onto a sheet that does not have one.

## Warning colour, used sparingly

- Input that must be refreshed: amber fill (`#FFF2CC`), normal font.
- Critical error or failed check: light red fill (`#FFC7CE`) plus bold red text
  (`#9C0006`).
- Passing checks: neutral. A green wash over every PASS makes the one red row invisible.
- Never encode a value only in colour — a reader with a monochrome printout, or a colour
  vision deficiency, must still see the meaning. Put the flag in a cell.
