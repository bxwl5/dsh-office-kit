# Tables and spreadsheets

**Goal.** A table that fits the page, repeats its header row across pages, and survives an edit without cells drifting out of alignment.

A table's geometry is three things that must agree: the grid (`w:tblGrid`, one `w:gridCol` per column), the table width (`w:tblW`), and each cell width (`w:tcW`). When they disagree Word shows a table wider than the text block or columns that jump on the first edit.

## Create

```bash
"<python>" "<cli>" docx create --spec "<spec.json>" --out "<out.docx>"
```

```json
{
  "type": "table",
  "headers": ["Region", "Revenue", "Growth"],
  "rows": [["EMEA", "4.1M", "12%"], ["APAC", "3.2M", "9%"]],
  "style": "Table Grid"
}
```

Header cells are bold. For a document with the header repeating on every page, follow up with the a11y fix, which writes `w:tblHeader` on row 1:

```bash
"<python>" "<skill>/scripts/a11y_audit.py" "<out.docx>" --fix_table_headers first_row --out "<out-fixed.docx>"
```

## Inspect and fix geometry

```bash
"<python>" "<skill>/scripts/table_geometry.py" "<file.docx>"
"<python>" "<skill>/scripts/table_geometry.py" "<file.docx>" --fix --out "<file-fixed.docx>"
```

The audit reports `tblW`, layout mode, every grid column in twips and the sum, plus the narrowest and widest cell. `--fix` writes a fixed-layout table at the text width (page width minus margins), rescales the grid proportionally and rewrites each `tcW` including `gridSpan`.

Text width on Letter with 1in margins is 9360 twips — that is the number a full-width table should total.

## Convert

```bash
"<python>" "<skill>/scripts/docx_table_to_csv.py" "<file.docx>" --table_index 0 --out "<table.csv>"
"<python>" "<skill>/scripts/xlsx_to_docx_table.py" "<book.xlsx>" --sheet Revenue --out "<table.docx>" --title "Revenue by region"
```

The first flattens a Word table (expanding horizontal spans, repeating vertically merged values) for data work. The second imports a worksheet as a Word table with a bold header row and `w:tblHeader`, which is the route for "put this spreadsheet in the report" — not a screenshot and not an embedded object.

## Design

- Bold header row, light grey `#D9D9D9` borders, no shading inside the body.
- Numeric columns right-aligned; text left-aligned. Thousands separators in the cells themselves.
- Two or three columns of prose at most; a wide table wants landscape, and that means a section break (`tasks/sections_layout.md`), not a smaller font.
- Caption above the table (`tasks/captions_crossrefs.md`), and keep it with the table.
- Avoid vertical merges: they look fine in the file and confuse every downstream reader.

## Verify

Render and look at the page the table lands on: nothing spills past the right margin, header row intact, no split row across pages, and the last column not truncated. A table that fits in the XML but overflows the page is a real defect, and only the render shows it.

## Pitfalls

- A table inside a table cell inherits the cell width; check the outer table first.
- `autofit` is a request, not a guarantee — fixed layout plus explicit widths is the only thing that renders the same everywhere.
- Cell margins default to 108 twips left/right; that is padding, not missing width.
