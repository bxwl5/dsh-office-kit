# Capability report

This file records what the plugin actually does, how each capability maps from the original Codex skills, what was verified, and what remains unsupported. It is intentionally conservative: a feature is listed as supported only after a working command path and a check exist.

## Capability trace

| User capability | Original Codex mechanism | DSH execution chain | Acceptance | State |
| --- | --- | --- | --- | --- |
| Create a DOCX report | `documents` skill; Python OOXML scripts; `mark_artifact_operation_started.mjs` | `/documents` chip → `office-documents` skill → `office_status` → `office_cli.py docx create/edit` (python-docx, OMML) → Word/LibreOffice render → PNG inspection | Create with headings, lists, table, image, equation, header/footer; read back counts; edit text and append section; equation survives; rendered page inspected | Supported |
| Read a DOCX | Same skill | `docx read` → JSON counts/text/tables/images | Counts and text match the created document | Supported |
| Create a PDF | `pdf` skill; reportlab/pdfplumber/pypdf | `/pdf` chip → `office-pdf` skill → `office_cli.py pdf create/read/edit/render` | Chinese text embeds with registered CJK font; read extracts text; metadata edit; PyMuPDF render inspected | Supported |
| Inspect a PDF | Same | `pdf read` → page count, text, metadata, form fields | Page count and Chinese/English text extracted | Supported |
| Edit a PDF | Same | `pdf edit` → metadata, rotate, merge, remove pages | Metadata edit and read-back verified | Supported |
| Create/edit a PPTX | `presentations` skill; Codex `@oai/artifact-tool` | `/presentations` chip → `office-presentations` skill → `office_cli.py pptx create/edit` (python-pptx) → PowerPoint/LibreOffice render | Three slides with bullets, table, chart, image; edit text and append a slide; four rendered pages inspected; layout overlap fixed with explicit coordinates | Supported, with a different authoring engine than Codex |
| Create/edit an XLSX | `spreadsheets` skill; Codex `@oai/artifact-tool` | `/spreadsheets` chip → `office-spreadsheets` skill → `office_cli.py xlsx create/edit/recalc` (openpyxl + Excel COM) | Formulas, styles, widths, frozen panes, chart; edit cells/append rows; Excel recalculation persists cached values (`40`, `58`, `228`); data-only read confirms | Supported, with a different authoring engine than Codex |
| Render for visual QA | Codex render helpers / artifact tool | `render` → Microsoft Office COM (Word/PowerPoint/Excel) or LibreOffice headless; PyMuPDF for PDF | DOCX page, PPTX pages, PDF page rendered and inspected | Supported when a renderer exists; explicit error otherwise |
| `/` menu with names and icons | Codex skill menu (not `InputTrigger`) | Public `ctx.inputTriggers` source named `office`; four candidates with React SVG icons and locale labels | Typecheck/build; not yet exercised in a running DSH window | Implemented, GUI interaction unverified |
| Enter → reference chip | Codex artifact reference | `onPick` returns `ReferenceInsert`; host `codec` persists `/documents` and serializes a skill instruction | Build/typecheck; chip persistence is the documented public contract, not live-tested | Implemented, GUI interaction unverified |
| Chip preview | Codex skill preview | `openReference` maps feature id → skill name → `SKILL.md` path → `sidebarRight.openResource` | Code path implemented; GUI unverified | Implemented, GUI unverified |
| Python setup | Codex bundled runtime | `postinstall.mjs` detect/download/verify/install/venv/pip/import check/config/PATH | Auto-install path not run (a working Python already existed); venv creation, dependency install, import verification, config write, idempotent rerun all verified | Supported; installer download path unverified in this environment |

## Dependency mapping

| Codex dependency | DSH replacement | Notes |
| --- | --- | --- |
| `load_workspace_dependencies` | `office_status` + absolute paths embedded in each skill body | No hidden workspace loader; the host verifies the interpreter and packages. |
| `mark_artifact_operation_started.mjs` | None | It only marked artifact sessions in Codex; DSH has no equivalent and the CLI does not pretend to. |
| `@oai/artifact-tool` (PPTX/XLSX) | `python-pptx`, `openpyxl` | Different API and some different capabilities; see limits. |
| Codex Google Drive/Slides/Sheets plugins | None | Remote editing is explicitly unsupported, not silently replaced by local files. |
| Codex render helpers | Microsoft Office COM or LibreOffice headless; PyMuPDF | Renderer availability is reported by `office_status`. |
| Codex `agents/openai.yaml` manifests | DSH skill frontmatter + `ctx.skills.registerProvider` | The four DSH skills live in `assets/skills`. |

## Python and renderer environment

- Python: 3.12.12 in `%LOCALAPPDATA%\dsh-office-suite\venv`, created by `postinstall.mjs` from an existing CPython 3.12.12.
- Installed and import-verified: python-docx 1.2.0, openpyxl 3.1.5, python-pptx 1.0.2, pypdf 6.21.1, reportlab 4.5.1, pdfplumber 0.11.9, PyMuPDF 1.28.2, Pillow 11.3.0, latex2mathml 3.81.1, mathml2omml 0.0.2.
- Renderers: Microsoft Word/PowerPoint/Excel 16 installed. LibreOffice is not installed on this machine. OCR (`tesseract`) and Poppler `pdftoppm` are not installed; PDF rendering uses PyMuPDF instead.

## Verification evidence

Run on Windows, 2026-10-20, in paths containing Chinese characters and spaces.

| Check | Result |
| --- | --- |
| `pnpm run typecheck` | Passed |
| `pnpm run build` | Passed; `dist/index.js`, `dist/index.d.ts`, `dist/client.js` generated |
| `pnpm run test -- --run` | 14 passed across 2 files (10 in `test/office-cli.test.ts`) |
| DOCX create/read/edit/render | Passed; rendered page inspected: Chinese header/title/body/table/equation/image/footer |
| PDF create/read/edit/render | Passed; Chinese text extracted, metadata edit, page rendered |
| PPTX create/read/edit/render | Passed; four slides rendered; table/chart/image layout fixed and inspected |
| XLSX create/read/edit/recalc | Passed; formulas preserved; Excel recalculation produced cached values; data-only read confirmed |
| `postinstall.mjs` first run | Passed; venv created, 10 packages installed, imports verified, config written |
| `postinstall.mjs` second run | Passed in 2.7 s; idempotent |
| `PATH` update | Registry write blocked by this Windows sandbox; plugin now warns instead of claiming success; absolute-path resolution works |
| Chinese + spaces path | Used for every integration test |
| Missing/incompatible Python | `resolvePython` reports `found: false` or `compatible: false`; skill bodies tell the agent to stop and ask for repair instead of running |
| Interrupted installer | Download uses a unique temp filename per process; stale locked installers no longer block a retry |
| `pnpm run lint --fix` | Passed |

## Unsupported (explicit)

- Google Docs, Google Slides, Google Sheets, Google Drive import/export, or any online document editing.
- Codex `@oai/artifact-tool`-only behavior and its artifact-session lifecycle.
- DOCX comments, tracked changes, TOC fields, watermarks, redaction, content controls, template-style transfer, and accessibility audit.
- PDF OCR, AcroForm filling, signing, redaction, and page-level text editing.
- PPTX animations, speaker notes, template slide masters, and morph transitions.
- XLSX pivot tables, macros, data validation, conditional formatting, and shared-workbook features.
- Installing LibreOffice or Python on macOS/Linux; the plugin detects and reports, but only Windows auto-installs Python.
- Live GUI interaction (menu open, chip insertion, chip persistence, right-sidebar preview) was not exercised in a running DSH window. It compiles against the public `0.2.1-rc.2` types, but installation into the user's profile was intentionally not performed.

## UI API constraints recorded during implementation

- The public composer `ReferenceChip` shows a custom icon only for `session`, `file`, and `folder`. This plugin uses `appearance: 'file'` in the composer, so the chip shows the built-in file glyph plus the friendly format label. The `/` menu candidates and transcript chips do use the four custom format icons.
- `matchEnter` cannot create a reference chip; Enter on a highlighted `/` candidate goes through the source's `onPick`, which is the implemented path.
- The chip's stable internal ref is the feature id; clipboard/persistence text is `/documents` etc.; model serialization names the skill explicitly so the agent loads it before file work.
