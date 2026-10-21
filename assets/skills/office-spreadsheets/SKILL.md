---
description: Create, inspect, edit, recalculate, and verify Excel workbooks (.xlsx/.csv) using openpyxl recipes and the bundled Office helper CLI.
---

# Spreadsheets (.xlsx)

A workbook is cells: each one holds a value, a format, and possibly a formula *string*. openpyxl writes all three and evaluates none of them, so a formula you just wrote has no cached result and `xlsx read` shows `=SUM(B2:B9)` where the user expects `1,950,400`. The calculation happens in an engine — the DSH LibreOffice via `xlsx recalc` (cross-platform), or whatever app the user opens the file in. Everything below follows from that: write values and formulas, then verify structure by reading back, then verify numbers by recalculating, then verify appearance by rendering.

| User job | What is really happening | Fast path |
| --- | --- | --- |
| Build a new workbook | Cells written top-left at A1; `=`-prefixed strings become formulas; styles are per-cell objects; sheets get names, widths, freeze panes, merges | `xlsx create` spec, `tasks/create-workbook.md` |
| Change cells in an existing file | Only the cells you name change; a re-save can drop objects openpyxl does not model (pivots, foreign charts) | `container_tools/set_cells.py` and friends, `tasks/edit-workbook.md` |
| The workbook is open in Excel/WPS and the user wants it changed live | The target is the window, not the file on disk: unsaved user edits are in play and a COM write is not transactional. **Windows only** — on macOS/Linux the live tool exits 3 with a remedy; edit the file instead | `../excel-live-control/SKILL.md` |
| Inventory a file you did not write | Iterate sheets, used range, formulas vs values, merged ranges, conditional formats, defined names, charts | `container_tools/inspect_workbook.py` |
| Compare two versions | Cell-by-cell walk with formula-aware, format-aware, structure-aware levels | `container_tools/diff_workbooks.py`, `tasks/diff-workbooks.md` |
| Prove the numbers are real | Recalculate in Excel, then check every formula cell has a value, no error, no dangling sheet | `xlsx recalc` + `container_tools/recalc_gate.py`, `tasks/recalc-and-check.md` |
| Format numbers, conditions, names, charts, tables | Number formats, conditional-formatting rules, defined names, native chart objects, Excel Tables | `recipes/*.md` (openpyxl patterns, runnable) |
| Answer a question about a file | Read values, not formulas; quote the cells you read | `tasks/analyze-workbook.md` |
| Spreadsheet lives in Google Sheets | Not this runtime — see `routing/google-sheets.md` | — |

Sheet and range semantics matter before any edit: `B4:D9` is a rectangle, `'Build'!E14` is a cross-sheet reference whose sheet name needs quotes when it contains spaces, and a merged range is one value plus a lot of emptiness. Number formats are display only — the stored value keeps full precision, so never round data to make it look right.

## Before any file work

1. Call the `office_status` tool.
2. Read the `## Office runtime` JSON block at the end of this file and use its `python`, `cli`, `skill`, and `shared` values verbatim, quoted: `"<python>"`, `"<cli>"`, `"<skill>/container_tools/<name>.py"`.
3. If that block reports no working runtime, stop. Give the user the `node "..."` remedy command it names, then call `office_status` again. Never claim a workbook you could not create, read, or recalculate.
4. Run `<python> <script> --help` before using a container tool you have not called in this session.

## Delivery

Always hand the finished file to the user with the `present` tool, then summarise in one sentence what changed. A bare path is not delivery: the chat transcript renders `.docx`/`.pptx`/`.xlsx`/`.pdf` links as "二进制文件，无法显示改动" and the user cannot open them.

- Creating a file: write it into the user's workspace, verify it, then `present`.
- Editing an existing file: never overwrite the original. Write `<original>-edited.<ext>` (or a name the user asked for), verify it, `present` it, and state both paths.

## Annotations

The user may reply with an `office-annotations` block: `[{ page, text, requirement, region: { left, top, width, height } }]`. `region` is normalised 0–1 against the rendered preview page the user drew on; `requirement` is free-form natural language. Treat it as a change request, not as editor state: locate what the region covers, apply the smallest edit that satisfies `requirement`, re-render, and confirm the region now looks right.

When the payload cannot be mapped to a concrete object (the region is empty or the file has no geometry), do not guess silently — say what you could not locate.

For xlsx the payload is `{ target, fileName, text: "", requirement, region, imageName, unmapped: true }`: no `page`, no `sheet`, no `range`. The preview client cannot resolve a cell from the drag and refuses to fake one. So:

1. `read_image` the attachment named `imageName` — it is a screenshot of the area the user marked. Note visible headers, row labels, and values.
2. Run `"<python>" "<cli>" xlsx read --input "<file>" --json-out "<dump>.json"` and match those values to sheets and A1 addresses; `container_tools/inspect_workbook.py` adds formulas, merged ranges, and names when the match is ambiguous.
3. State the resolved sheet and range back to the user before editing ("`Pipeline!D2:D13`, the Amount column"), and ask if two sheets or columns match.
4. Never convert region pixels into a cell address. Full recipe: `tasks/annotations.md` and `"<shared>/annotation-recipes.md"`.

## Verify

Three checks, in this order, after every mutation:

1. **Structure and values.** `"<python>" "<cli>" xlsx read --input "<file>"` proves the cells you wrote are where you wrote them; `container_tools/inspect_workbook.py` proves charts, tables, conditional formats, names, and merges survived.
2. **Numbers.** If any formula changed or was added, run `"<python>" "<cli>" xlsx recalc --input "<file>" --out "<file>"` and then `container_tools/recalc_gate.py --input "<file>"`. The kit recalculates on every platform; only when the kit itself is missing does the recalc fail, and `recalc_gate.py` then reports `unverified` — say that plainly instead of presenting an empty cache as a result.
3. **Appearance.** `"<python>" "<cli>" xlsx render --input "<file>" --out-dir "<render-dir>"`, then `read_image` each PNG. Check titles and labels, `###` columns, clipped numbers, charts cut off by the print area, plots with no categories, legends naming `Series 1`, conditional formatting that never fired, and blank pages. The render goes through the DSH LibreOffice kit; when it is missing the command fails explicitly: report the file as structurally verified but visually unchecked, and offer to rebuild from a spec.

Two or three render/fix passes are normal. If a defect survives three, say what still looks wrong.

## Mutation tools

The CLI is read-only for `.xlsx`: `create`, `read`, `render`, `status`, `recalc` and nothing else. Every change to an existing workbook goes through these openpyxl tools. Each one reads `--input`, writes `<input>-edited.xlsx` unless you pass `--out`, prints one JSON object on stdout, and exits non-zero with a JSON `error` on stderr when it refuses.

| Tool | Does | Does not |
| --- | --- | --- |
| `sheet_ops.py` | `--add NAME`, `--rename OLD=NEW`, `--delete NAME`, `--order "A,B,C"` | rename the formulas that point at a renamed sheet; deleting the last sheet is refused |
| `set_cells.py` | `--sheet S --set B2=42 --set C3="=SUM(C2:C9)"`, or `--spec cells.json` | parse dates for you — write `2026-01-31` and format the cell, or pass a serial |
| `append_rows.py` | `--sheet S --rows '[[...],[...]]'`, or `--rows-file rows.json` | extend an Excel Table, copy the row above's formula, or grow charts and conditional formats |
| `style_cells.py` | `--sheet S --range A1:D1 --style '{"bold":true}'`, or `--spec styles.json` | autofit columns or restyle cells outside the range |
| `add_chart.py` | `--sheet S --type line --data-min-col ... --cat-min-row ...`, or `--spec chart.json` | set axis number formats, series colours, or a legend position; a one-row data range is treated as one series of many points |
| `add_image.py` | `--sheet S --path logo.png --anchor B2 [--width 480]` | update an embedded image when the file on disk changes |

Chain them by naming the output: `set_cells.py --input book.xlsx --out step1.xlsx`, then `style_cells.py --input step1.xlsx --out step2.xlsx`. Without `--out` each tool writes `book-edited.xlsx` next to the input and the next step would read the unedited original.

Values: numbers, booleans, `null`, and JSON arrays parse; anything else is text, and a leading `=` is stored as a formula. `--set B3=` stores an empty string, which is not the same as a blank cell — leave a cell out of the assignment to keep it blank.

## Formulas you will write

Write the formula text a person would type; openpyxl stores it verbatim and never evaluates it.

- Anchoring: `C8` moves when filled, `C$4` pins the row (a period header), `$A8` pins the column (an item label), `$B$3` pins one cell (a rate or case selector). `=SUMIFS(Amount,Month,C$4,Item,$A8)` is the shape a grid needs.
- Aggregation: `SUM`, `SUMIFS`, `COUNTIFS`, `AVERAGEIFS`, `SUMPRODUCT` for quantity × rate pairs, `PRODUCT` for chained factors (it silently skips blanks, so a missing input looks valid).
- Lookups: `INDEX`/`MATCH`, `VLOOKUP` with `FALSE`, or `XLOOKUP` if the file already uses it. A matched key is not a populated value — check the looked-up cell too.
- Guards: `IFERROR` only around an understood failure, never `IFERROR(x,0)` across a block. A blank input and a real zero are different answers: `=IF(C8="","",B8/C8)` and `=IF(C8=0,"n.a.",B8/C8)`.
- No `LET`, no dynamic arrays, no `LAMBDA`: the engines that read these files disagree on them.
- Cross-sheet references quote the name: `='Build'!E14`, `='Case A'!$B$4`.

After writing formulas, recalculate before anyone reads a number — see `## Verify`.

## Tasks

| Task | Read |
| --- | --- |
| Build a workbook from scratch | `tasks/create-workbook.md` |
| Edit an existing workbook without collateral damage | `tasks/edit-workbook.md` |
| Inspect sheets, ranges, formulas, names, conditions | `tasks/inspect-workbook.md` |
| Diff two workbook versions | `tasks/diff-workbooks.md` |
| Recalculate and gate consistency | `tasks/recalc-and-check.md` |
| Answer questions about an existing file | `tasks/analyze-workbook.md` |
| Resolve an `office-annotations` region to cells | `tasks/annotations.md` |

## Recipe index

`recipes/number-formats.md`, `recipes/conditional-formats.md`, `recipes/data-tables.md`, `recipes/charts.md`, `recipes/sparklines.md`, `recipes/named-ranges.md` — each is a short runnable openpyxl snippet plus the pitfall it avoids. Use them when the CLI spec has no key for what you need; the CLI is a shortcut, not a ceiling.

Background: `references/workbook-structure.md` (tab roles and layout), `references/formula-patterns.md` (anchoring, aggregation, dates), `references/style-guidelines.md` (visual defaults), `references/charts.md` (chart choice and audit), `references/domain/*.md` (finance, healthcare, marketing, research conventions).

## Edit discipline

An existing workbook is the reference: its structure, formula style, formats, and terminology are what the user expects to keep seeing. Change the cells the request names and the formulas those cells feed. Everything else — other sheets, pivot sources, shared formulas, named ranges, conditional formats, data validation, protection, hidden rows, freeze panes, chart contents — stays untouched unless the request or a real dependency forces it. Never flatten formulas to values because it is easier, never autofit whole sheets for a visual tweak, and never quietly repair errors the user did not ask about: list them and ask. Details and failure modes: `tasks/edit-workbook.md`.

## Shared workflow

Follow `"<shared>/common-workflow.md"` for the create-or-edit decision, the failure ladder, and the edit naming rule, and `"<shared>/annotation-recipes.md"` for the payload shapes the client sends.
