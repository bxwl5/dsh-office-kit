---
description: Create, inspect, edit, recalculate, and render Excel .xlsx workbooks with the bundled Office helper CLI.
---

# Spreadsheets (.xlsx)

Build local Excel workbooks with values, formulas, styles, charts, and images; inspect existing workbooks; recalculate with Excel when cached values are required. This skill does not use Codex `@oai/artifact-tool` and does not edit Google Sheets.

## Before any file work

1. Call the `office_status` tool.
2. Use the `python` and `cli` values from the `## Office runtime` JSON block at the end of this file.
3. If no compatible Python is reported, stop and tell the user.

## Create

```bash
"<python>" "<cli>" xlsx create --spec "<spec.json>" --out "<output.xlsx>"
```

```json
{
  "sheets": [{
    "name": "Summary",
    "rows": [
      ["Quarter", "Revenue", "Cost", "Gross profit"],
      ["Q1", 100, 60, "=B2-C2"],
      ["Q2", 128, 70, "=B3-C3"],
      [null, "=SUM(B2:B3)"]
    ],
    "styles": {
      "A1:D1": { "bold": true, "fill": "#E8EEF7", "align": "center" },
      "B2:D4": { "number_format": "#,##0" }
    },
    "widths": { "A": 12, "B": 14, "C": 12, "D": 14 },
    "freeze": "A2",
    "charts": [{
      "type": "column",
      "title": "Quarterly revenue",
      "anchor": "F2",
      "data": { "min_col": 2, "min_row": 1, "max_col": 2, "max_row": 3, "titles_from_data": true },
      "categories": { "min_col": 1, "min_row": 2, "max_row": 3 }
    }]
  }]
}
```

Rows are written from A1. A string starting with `=` is a formula, not text. Styles support `bold`, `italic`, `size`, `color` (hex), `fill` (hex), `number_format`, and `align` (`left`/`center`/`right`). Chart types: `bar`, `column`, `line`, `pie`; data/category references are 1-based.

## Read

```bash
"<python>" "<cli>" xlsx read --input "<file.xlsx>"
"<python>" "<cli>" xlsx read --input "<file.xlsx>" --data-only
```

Default read returns formulas. `--data-only` returns cached values, which are only present if Excel (or another producer) stored them. A formula created by openpyxl has no cached value until recalculated.

## Edit

```bash
"<python>" "<cli>" xlsx edit --input "<file.xlsx>" --spec "<edit.json>" --out "<file-edited.xlsx>"
```

```json
{
  "operations": [
    { "action": "set_cells", "sheet": "Summary", "cells": { "E2": "Reviewed", "E3": "Pending" } },
    { "action": "append_rows", "sheet": "Summary", "rows": [["Q3", 150, 80, "=B4-C4"]] },
    { "action": "style", "sheet": "Summary", "cells": { "E2:E3": { "bold": true } } },
    { "action": "add_sheet", "name": "Notes" },
    { "action": "rename_sheet", "from": "Notes", "to": "Appendix" },
    { "action": "delete_sheet", "name": "Appendix" }
  ]
}
```

Actions: `set_cells`, `append_rows` (or `rows`), `style`, `chart`, `image`, `add_sheet`, `delete_sheet`, `rename_sheet`. The input is never modified. Existing formulas/styles outside the edited cells are preserved by openpyxl, but charts created by other tools may be dropped when the workbook is re-saved; verify before replacing a production file.

## Recalculate formulas

```bash
"<python>" "<cli>" xlsx recalc --input "<file.xlsx>" --out "<file-recalculated.xlsx>"
```

This requires Microsoft Excel on Windows. It opens the workbook, forces a full calculation, saves with cached values, and closes Excel. On other systems the CLI fails explicitly; there is no bundled formula engine. Without recalculation, Excel normally computes formulas when the file is opened, but `--data-only` reads will stay empty.

## Render and verify

```bash
"<python>" "<cli>" xlsx render --input "<file.xlsx>" --out-dir "<render-dir>"
```

The renderer prefers Microsoft Excel COM on Windows (exports each sheet to PDF) and LibreOffice otherwise, then rasterizes pages to PNG. Check values, number formats, column widths, frozen panes, merged cells, chart legends/categories, and clipping. `read` complements the visual check for exact cell values.

## Quality rules

- Put raw inputs and calculated cells on the same sheet, or clearly document the calculation chain.
- Use formulas instead of hard-coded results when the workbook should stay live.
- Use number formats for currency/percent/dates instead of embedding symbols in text.
- Keep one header row, avoid merged cells in data ranges, and leave a frozen header.
- Verify every formula you authored with `read` (formula) and, where possible, `recalc` + `--data-only` (value).

## Not supported

- Google Sheets / Google Drive editing.
- Pivot tables, Power Query, macros/VBA, data validation, conditional formatting, slicers, external workbook links.
- Formula evaluation without Microsoft Excel; `recalc` is Windows + Excel only.
- Exact Excel rendering fidelity on LibreOffice; charts from foreign producers may not survive editing.
- Codex `@oai/artifact-tool` helpers or artifact-tool workbook gates.
