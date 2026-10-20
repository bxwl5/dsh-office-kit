---
description: Drive a workbook that is already open in Excel or WPS Spreadsheets over COM — read cells, write values and formulas, style ranges, add charts and tables, recalculate, save, and report the exact ranges touched.
---

# Live spreadsheets (Excel / WPS)

## What "live" means here

The workbook is open in a running Excel or WPS Spreadsheets window, and the user is
looking at it. The file on disk may be behind the window, may not exist yet, and may
carry edits the user has not saved. A live call changes the *open document*: the cells
the user is staring at update while they watch, and saving is a separate decision.

That one sentence drives everything below:

- The target is `Application.ActiveWorkbook`-shaped state, not a path. Address it by
  workbook name, sheet name and A1 range, never by "the active sheet" or "the selection".
- Nothing is transactional. A failed call leaves whatever already landed exactly where
  it landed. Read before retrying; never replay a half-applied batch.
- The disk file is not the deliverable. What the user sees in the window is. Saving is
  an explicit act you announce.

## Live or file editing?

| Situation | Route |
| --- | --- |
| The user says the file is open, or asks for "the sheet I'm looking at" | this skill |
| They want to watch cells change, iterate on a model with them, or add a chart to the visible sheet | this skill |
| No spreadsheet application is running | `../office-spreadsheets/SKILL.md` — edit the file, then tell them to reopen it |
| Bulk generation, batch jobs, CI, or work that outlives the session | `../office-spreadsheets/SKILL.md` |
| Reading a file to answer a question, with no app open | `../office-spreadsheets/SKILL.md` |

Never force the live path. If nothing is running, do not launch an application to avoid
talking to the user: say plainly that the workbook must be open, or switch to the file
route and say so.

## Before you touch anything

1. Call the `office_status` tool, then take the `## Office runtime` JSON block that the
   host appends to `../office-spreadsheets/SKILL.md` (this sub-skill is routed from
   there, so that block is where the paths live). Use its `python` value verbatim and
   quote every path; this pack's directory is `<skill>/../excel-live-control`, which is
   what `<skill>` below means.
2. Run `"<python>" "<skill>/container_tools/live_excel.py" --help` once per session.
3. Attach and look before writing:

   ```
   "<python>" "<skill>/container_tools/live_excel.py" info
   ```

   `info` lists every open workbook, the target workbook, its sheets, and per sheet the
   used range, charts, tables, pivot tables and protection state.

4. If attach fails, the JSON carries a `remediation` string. Relay it as written: open
   the workbook in Excel or WPS and keep it open, then ask for the change again. Do not
   start an application on the user's behalf.
5. If more than one workbook is open, the tool refuses to guess. Pass `--workbook` with
   the file name (`Budget FY26.xlsx`) or enough of the path to be unambiguous.
6. Something looks wrong with the environment — attach works but calls fail, or the
   application name and vendor disagree — run `--diagnose`. It reports the attach
   mechanism, the running application, every workbook and every sheet without mutating
   anything.

Attachment uses `[Runtime.InteropServices.Marshal]::GetActiveObject` from Windows
PowerShell 5.1, trying `Excel.Application` then `Ket.Application` (WPS Spreadsheets).
WPS registers `Excel.Application` as an alias, so the reported application name is not
proof of which product is running; the JSON's `engine.vendor` is derived from
`Application.Path`. Mechanics and the COM object model: `references/office-automation.md`.

## The edit contract

These are not preferences. Every mutating call has to satisfy them.

- **Touch only what was asked for.** The named sheet and the named ranges. Not the
  neighbouring column, not the whole sheet, not "while I'm here".
- **Read before you write.** Call `read_range` on the target first. You need to know
  whether a cell holds a value, a formula, or a merged-region fragment, and whether the
  user's edits are unsaved before you replace them.
- **Never destroy structure you did not create**: formulas (never flatten to values),
  named ranges, conditional formats, shared formulas, data validation, pivots and their
  sources, chart series definitions, filters, hidden rows, freeze panes, protection.
- **Never clear more than you can name.** `write_range --clear` clears contents of an
  explicit range; it does not remove charts, tables or formats. Clearing a used range to
  "start clean" is off-limits.
- **Small writes, batched.** One call per logical block (a column of assumptions, a
  sheet of outputs). Rectangular data only: if the range is 6 rows × 2 columns, the JSON
  array must be 6 rows of 2 values.
- **Report exactly what you touched.** Every mutating op answers with workbook name and
  path, sheet, exact address, row/column/cell counts, and a `warnings` list. Quote that
  in your reply — "wrote `Assumptions!C4:D8` (10 cells)" — not "updated the assumptions".
- **Saving is a separate, announced act.** See Delivery.
- **No decorative edits without a request.** Do not restyle a sheet to your taste, do not
  autofit whole columns, do not add a header row the user did not ask for.

If a call fails partway, `read_range` the block you were writing and continue from what
actually landed. Retrying the identical call is how duplicate rows and reversed edits
happen.

## The tool

`"<skill>/container_tools/live_excel.py"` — one command per operation, one JSON object on
stdout, non-zero exit on failure. It shells out to `powershell.exe`; pywin32, comtypes and
Excel interop assemblies are neither used nor needed.

| Op | Does | Key options |
| --- | --- | --- |
| `info` | workbooks, target workbook, sheet inventory | `--workbook` |
| `read_range` | typed values, optionally formulas and displayed text | `--sheet --range`, `--formulas`, `--display`, `--max-cells` |
| `write_range` | one rectangular block of values | `--sheet --range --data`/`--data-file`, `--clear` |
| `set_formula` | a formula filled across a range, or a cell→formula map | `--range --formula`, or `--cells '{"C1":"=A1+B1"}'`/`--cells-file`, `--r1c1` |
| `style_range` | font, fill, number format, alignment, borders, width, merge | `--style` JSON or `--style-file`, `--merge` |
| `add_table` | native table (ListObject) over a range | `--name`, `--style TableStyleMedium2`, `--no-headers` |
| `add_chart` | embedded chart pointed at a range | `--type`, `--data`, `--anchor`, `--title`, `--width`, `--height` |
| `recalc` | `CalculateFull` on every open workbook | — |
| `save` | save in place, or `SaveAs` a copy | `--path` |
| `close` | close the workbook, optionally quit the application | `--save`, `--discard`, `--quit-app` |

Global options on every op: `--workbook NAME|PATH`, `--timeout SECONDS` (default 180;
a live call is allowed to take seconds), and `--launch-hidden` (**self-tests only** — it
starts a hidden application, which is wrong for any user-facing edit).

Style keys: `font_name`, `font_size`, `bold`, `italic`, `color`, `fill` (hex RGB, e.g.
`#FFF2CC`), `number_format`, `h_align` (`left|center|right|general|justify`), `v_align`
(`top|center|bottom`), `indent`, `wrap`, `column_width`, `border` (`outline|all|none`).
Unknown keys are rejected with the allowed list rather than silently dropped.

Chart types: `column`, `column-stacked`, `bar`, `bar-stacked`, `line`, `line-markers`,
`area`, `area-stacked`, `pie`, `doughnut`, `scatter`, `scatter-lines`.

Typical first calls:

```
"<python>" "<skill>/container_tools/live_excel.py" info
"<python>" "<skill>/container_tools/live_excel.py" read_range --sheet Build --range D5:D9 --formulas
"<python>" "<skill>/container_tools/live_excel.py" write_range --sheet Assumptions --range C4:D8 --data-file assumptions.json
"<python>" "<skill>/container_tools/live_excel.py" set_formula --sheet Build --range E5:E9 --formula "=D5*Assumptions!$C$4"
"<python>" "<skill>/container_tools/live_excel.py" style_range --sheet Assumptions --range C4:D8 --style '{"number_format":"#,##0","fill":"#FFF2CC"}'
```

Failures print `{"ok": false, "stage": "...", "error": "...", "remediation": "..."}` and
exit 1 (2 for usage errors, 3 when PowerShell itself is unavailable). `stage: "attach"`
means nothing was running; `stage: "com"` means the application refused or failed the
call; read the message before changing the approach.

The CLI is the fast path, not the ceiling. When a job needs a COM call it does not wrap —
a sheet tab, freeze panes, a pivot, data validation, shape geometry — extend the script or
drive the application from a short PowerShell snippet, and keep the same reporting and
verification rules. The object model is in `references/office-automation.md`.

What this tool deliberately does not do: create, rename, delete or reorder sheets; delete
ranges or objects; run macros; open a file from disk. A job that needs one of those asks
the user for it, or belongs to the file route in `../office-spreadsheets/SKILL.md`.

## Verification

Do these in order after every batch of edits, before you report anything as done.

1. **Read it back.** `read_range` the exact ranges you wrote, with `--formulas` when you
   wrote formulas. Compare against what you intended cell by cell.
2. **No error cells.** The `errors` array in `read_range` lists every cell whose *live*
   value is an error (`#DIV/0!`, `#VALUE!`, `#REF!`, `#NAME?`, `#N/A`, …) with its
   formula and address. An edit that leaves an error is not finished. A pre-existing
   error you did not cause is reported to the user, not silently fixed.
3. **Numbers.** Run `recalc` after adding or changing formulas, then read the cells
   again. A formula that has not been calculated tells you nothing.
4. **Objects.** If you added a table or chart, run `info` and confirm it in the sheet's
   inventory, and read the chart's `source` from `add_chart`'s reply to confirm it points
   at the range you meant.
5. **Appearance.** You cannot screenshot the user's window from here. `--display` on
   `read_range` shows the rendered text of each cell (up to 500), which catches `###`
   widths, applied number formats and stray `#` — use it when formatting is part of the
   request. Otherwise say the visual check is the user's, and ask them to confirm if it
   matters.
6. **Structure.** If the sheet had tables, pivots or charts before you started, `info`
   after the edit proves they are still there.
7. **Report.** Name the workbook, the sheet, every range, and the cell counts.

## Delivery

The workbook is the user's open document, not an artifact you produced. Say what you did
and what state the document is in; do not save quietly.

- **Default: leave the document modified and unsaved.** The change is visible in their
  window. Tell them so, and tell them Ctrl+S keeps it. This is what keeps you from
  overwriting a file they were editing by hand.
- **They asked you to save**: `save` with no `--path` writes the workbook over its own
  file. Say "saved `Budget FY26.xlsx`" and give the full path from the reply.
- **Unsaved workbook, or they want an artifact to keep**: `save --path <copy>.xlsx`
  writes a copy and leaves the original window dirty. Then `present` that copy — it is a
  real file they can open, send, or archive.
- **`.xlsx` in chat**: a path on its own is not delivery. Use the `present` tool on a
  saved file, and state both paths when the original and the copy differ.
- **Never** save over the user's file to "make sure it's persisted" without telling them,
  and never close their workbook. `close --quit-app` is for cleaning up a self-test
  instance, not for tidying the user's desktop.
- If the edit failed partway and the document is dirty with a half-finished change, say
  exactly which ranges landed, and offer either to finish them or to close without saving.

## What good content looks like

The mechanics above keep the document intact; these rules keep it useful. The same rules
as the file-editing skill, because a careless live edit damages a document the user is
looking at.

- **Structure by role, not by tab count.** Inputs, assumptions, calculations, outputs.
  Outputs on the left of the tab strip, builds in the middle, inputs on the right; a
  terminal check/audit tab for models that need one. Do not restructure a workbook the
  user already organised — `workflows/edit_workflows.md`.
- **Formulas that a reviewer can audit.** Anchored references (`$B$3`, `C$4`, `$A8`),
  `SUMIFS`/`COUNTIFS`/`AVERAGEIFS` over hand-rolled sums, short `IF`, no blanket
  `IFERROR(...,0)` (`#VALUE!` is information), no `LET`/`LAMBDA`/spill arrays.
  `workflows/create_workflows.md` and `references/office-automation.md` for what COM
  stores when you write these.
- **Typed values.** Numbers as numbers, dates as dates, one number format per column.
  Invariant format codes (`#,##0`, `0.0%`, `"$"#,##0.00`) — never swap `.` and `,`.
- **Reading someone else's workbook is read-only.** `references/read_only_qna.md`.
- **Domain conventions** — finance, healthcare, marketing, scientific data — carry real
  meaning in their cells: `domain_guidance/`. Read the matching file before modelling in
  that area.
- **Visual defaults** (headers, input fills, borders, tab colours, one font family):
  `style_guidelines.md`.
- **Citations** for external data go next to the input table they support, not in a
  tab of their own.

## Files in this skill

| File | Use it when |
| --- | --- |
| `references/office-automation.md` | you need the COM object model: addressing, `Value2` vs `Formula`, colour encoding, locale, latency |
| `references/read_only_qna.md` | answering a question about the open workbook without changing it |
| `style_guidelines.md` | the request involves how the sheet looks |
| `workflows/create_workflows.md` | building a new sheet or workbook live |
| `workflows/edit_workflows.md` | changing cells in a workbook the user already built |
| `domain_guidance/*.md` | the model is financial, clinical, marketing, or research data |
