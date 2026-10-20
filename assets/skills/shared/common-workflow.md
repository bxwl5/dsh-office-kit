# Shared workflow

Every format pack follows this loop. The helper CLI is an accelerator for common
operations, not the boundary of what is possible: it shortens the common path,
and the skill teaches the rest. The format router adds the spec keys and the
commands; the order, the checks and the failure handling are the same.

## 0. Read the runtime block first

Call the `office_status` tool, then read the `## Office runtime` section that is
appended to the end of the active `SKILL.md`. It is a fenced JSON block:

```json
{ "python": "...\\python.exe", "cli": "...\\python\\office_cli.py", "skill": "...\\assets\\skills\\office-documents", "shared": "...\\assets\\skills\\shared", "version": "3.13.12" }
```

- `python` and `cli` are verified absolute paths. Use them verbatim and quote
  them in commands. Never call a bare `python`, `py`, `soffice` or `pdftoppm`.
- `skill` is the directory of the format pack; its scripts live under
  `<skill>/scripts/`.
- `shared` is this directory (workflow and annotation recipes).
- If the block is missing entirely and the skill body instead says *No working
  Python runtime is available*, stop: do not run any helper command and do not
  fabricate a document.

`office_status` returns the same facts as JSON with `runtime.state`, the package
list and `renderers`. Use it when a command fails and you need to know why.

## 1. Decide: create or edit

- No existing file → create. Write the output into the user's workspace, not a
  temp directory, unless the user names a location.
- Existing file to change → edit. **Never write back over the original.** The
  output is `<original>-edited.<ext>` next to the original (or the name the user
  asked for): `report.docx` → `report-edited.docx`. State both paths in the
  final summary.
- "Improve this document" means read it first (`read` verb) and edit the real
  content; do not rebuild it from scratch and drop its formatting.

## 2. Understand the file, choose the route, then change it

Read or inspect the file before changing it (`read` verb first), then pick the
cheapest route that actually does the job:

1. **CLI verb** — the common case. The helper CLI is spec-driven and prints
   exactly one JSON object on stdout. Failures print
   `{ "ok": false, "error": "..." }` on stderr and exit non-zero.

   ```bash
   "<python>" "<cli>" docx|pptx|xlsx|pdf create --spec "<spec.json>" --out "<file>"
   "<python>" "<cli>" docx|pptx|xlsx|pdf read   --input "<file>"
   "<python>" "<cli>" docx|pptx|xlsx|pdf edit   --input "<file>" --spec "<spec.json>" --out "<file-edited>"
   "<python>" "<cli>" docx|pptx|xlsx|pdf render --input "<file>" --out-dir "<dir>"
   "<python>" "<cli>" xlsx recalc --input "<file>" --out "<file>"
   ```

   Write the spec as a JSON file in the workspace; quote absolute paths.
   `xlsx read` accepts `--data-only`; every command accepts `--json-out <path>`
   when you want the report on disk instead of stdout.

2. **Pack script** — a specialised job the CLI has no verb for. Use the script
   listed in the format router (`<skill>/scripts/`, or `container_tools/` for
   pptx/xlsx). Scripts are argparse-based, support `--help`, and take absolute
   paths; run them with the same `"<python>"`.

3. **Library snippet** — the long tail. When neither the CLI nor a pack script
   covers the change, write a short runnable script in the workspace using the
   installed libraries (`python-docx`, `openpyxl`, `python-pptx`, `pypdf`,
   `PyMuPDF`, `reportlab`, `pdfplumber`), run it with `"<python>"`, then verify
   the file through the same render step. Keep it small and keep the user's
   original untouched.

Never answer "the CLI does not support this, so it cannot be done". A missing
verb is a missing shortcut, not a missing capability: give the library-level
route, run it, and verify the result like any other change.

`check_runtime.py` in this directory validates the interpreter: it imports every
package from `python/requirements.txt` and runs `<cli> status`. A non-zero exit
means the environment is broken, not the spec.

## 3. Render and look at the result

```bash
"<python>" "<cli>" docx render --input "<file>" --out-dir "<dir>"
```

Output: `<dir>/page-1.png`, `page-2.png`, ... (rasterised at `--dpi`, default
110). For docx/pptx/xlsx the intermediate PDF is kept at `<dir>/<stem>.pdf` —
use it for annotation geometry. `pdf render` rasterises with PyMuPDF and needs
no external renderer.

Open each page with `read_image`. Look for: text overflowing or clipped at
margins, overlapping shapes, unexplained blank pages, tables spilling past the
page, fonts replaced by boxes, missing chart/table content, and numbers that do
not match what the user asked for.

Only after the pages look right do you present the file.

## 4. Fix, re-render, present

Edit the spec (or the edit spec), re-run the same command, re-render, look
again. Two or three passes is normal; if a problem survives three passes, say
what still looks wrong instead of pretending it is fixed.

Then call `present` with the final file and reply with one sentence about what
changed. For an edit, mention the original path and the edited path.

## Rasterizing art

Decks, workbooks and documents embed raster images only, so an SVG or a chosen
PDF page has to become a PNG first; the same call downscales an oversized raster.

```bash
"<python>" "<shared>/scripts/ensure_raster_image.py" --input "<art.svg>" --dpi 300 --out "<art.png>"
"<python>" "<shared>/scripts/ensure_raster_image.py" --input "<deck.pdf>" --page 2 --width 1600 --out "<slide-2.png>"
```

It prints one JSON object with the PNG's `width`/`height` and never overwrites
the input. Open that PNG with `read_image` and look at it before embedding it:
a blank, clipped or miscoloured raster is invisible inside the host file.

## Failure ladder

| Symptom | Meaning | What you do and say |
| --- | --- | --- |
| No `## Office runtime` JSON; skill says *No working Python runtime is available* | The plugin cannot install or find a compatible interpreter | Do not run helper commands, do not write a document by hand. Give the user the remedy command from the skill body, ask them to run it, then call `office_status` again. |
| `office_status` shows `cli.exists: false`, or `python`/`cli` file not found | The bundled helper or its install is incomplete | Report the missing path. Do not substitute another tool that produces a different file. |
| `render` fails: `no document renderer found: install LibreOffice, Microsoft Office, or WPS Office` | Create/read/edit work, but docx/pptx/xlsx cannot be rasterised here | Do not claim you inspected it. Say the file was built and validated structurally (read verb), but this machine has no renderer so you could not check its appearance; the preview stays unavailable until Microsoft Office, WPS Office, or LibreOffice is installed. `pdf render` still works. If the user needs visual confidence now, offer to rebuild from a spec or to present the unverified file explicitly labelled as such. |
| Annotation region does not land on anything, or the payload says `unmapped: true` | The drawn region cannot be tied to an object in the file | Do not silently shift the region or guess a cell/shape. Say what you could identify (preview page, text, resolved cells) and which item you could not locate, then ask the user for the text or cell. |
| `{"ok": false, "error": "..."}` and non-zero exit | The spec was rejected (unknown key, bad type, missing file) | Read the error text, fix the spec key it names, re-run the same command. Never strip a failing block to make the command pass — that silently deletes user content. |
| `xlsx recalc` fails with *requires Microsoft Excel or WPS Spreadsheets* | openpyxl cannot evaluate formulas | Report formula cells as uncalculated; do not invent computed values. |
| The helper has no verb for what the requirement needs | The common path is short; the capability is not limited to it | Take the pack script route, or write a short snippet against `python-docx` / `openpyxl` / `python-pptx` / `pypdf` / `PyMuPDF` / `reportlab`, run it with `<python>`, then `read` the file back and render. Never refuse a job because a verb is missing. |
| `read` returns an empty structure for a file the user supplied | Unsupported or corrupt input | Say what failed and stop; do not overwrite the user's file with an empty one. |

## Naming rule for edits (restated)

`<original>-edited.<ext>`, in the same directory as the original, unless the
user asked for a different name. Never overwrite the original, never delete it,
never "clean up" a temp copy over it. Deliver both paths, original first.
