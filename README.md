# dsh-office-suite

Office file work for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness): Word documents, PDFs, PowerPoint decks, and Excel workbooks, driven from a `/` command and a reusable input chip.

The plugin ships four DSH skills and one host-side JSON CLI. It does not call Codex, another agent, or an online Office service. Files are created and edited locally through documented Python libraries.

## Features

| Command | Format | Create / read / edit | Render to images | Other |
| --- | --- | --- | --- | --- |
| `/documents` | DOCX | Yes | Word, LibreOffice | tables, images, equations, headers/footers |
| `/pdf` | PDF | Yes | PyMuPDF | merge, rotate, remove pages, metadata |
| `/presentations` | PPTX | Yes | PowerPoint, LibreOffice | text, bullets, tables, charts, images |
| `/spreadsheets` | XLSX | Yes | Excel, LibreOffice | formulas, styles, charts, frozen panes, recalculation |

Typing `/` opens the menu with a separate icon and friendly name for each format. Pressing Enter on a highlighted item inserts a reference chip with a stable internal id (`documents`, `pdf`, `presentations`, `spreadsheets`); the chip survives reloads and draft restore and opens the matching skill in the right sidebar when clicked. Transcripts render the same chip with the format icon.

The four menu and transcript icons are from [Gravity UI Icons](https://github.com/gravity-ui/icons) (MIT); the vendored SVG files and license are in [`assets/icons`](assets/icons).

The corresponding skills are `office-documents`, `office-pdf`, `office-presentations`, and `office-spreadsheets`. The `office_status` tool reports the verified Python interpreter, installed packages, helper CLI, and available renderers.

## Requirements

- DeepSeek Harness `0.2.1-rc.2` (the version this plugin is built and tested against).
- Node.js 20 or newer.
- Python 3.10–3.13 with the packages in [`python/requirements.txt`](python/requirements.txt). Python 3.14 is rejected because some dependencies do not publish compatible wheels yet.
- A renderer for visual verification: Microsoft Office (Word/PowerPoint/Excel) on Windows, or LibreOffice on any platform. Without one, `render` returns an explicit error instead of a fake success.

On Windows the `postinstall` script detects Python. If none is installed it downloads the official Python 3.12.10 installer from python.org, verifies its Authenticode signature, installs it per-user into `%LOCALAPPDATA%\Programs\Python\Python312`, creates a virtual environment at `%LOCALAPPDATA%\dsh-office-suite\venv`, installs the requirements, verifies every import, and records the absolute interpreter path. On macOS and Linux it verifies an existing Python but does not download one.

## Install

From npm (after the package is published):

```bash
dsh plugin add dsh-office-suite
```

From a local checkout:

```bash
dsh plugin add /absolute/path/to/dsh-office-suite
```

Enable the plugin in **Settings → Plugins**. The package's `postinstall` runs during installation. To rebuild the Python environment later:

```bash
pnpm rebuild dsh-office-suite
# or: npm rebuild dsh-office-suite
```

Set `DSH_OFFICE_SKIP_POSTINSTALL=1` to skip setup, or `DSH_OFFICE_POSTINSTALL=1` to force it in CI.

If the installer could not update the user `PATH` (for example under a restricted Windows sandbox), it prints a warning instead of claiming success. The host and skills do not depend on `PATH`: they read the verified absolute interpreter path from the config file. Reopen the terminal only after a successful `PATH` update.

## Use

1. Type `/` in the composer and choose **Documents**, **PDF**, **Presentations**, or **Spreadsheets**.
2. Press Enter to insert the chip, then describe the work.
3. The agent calls `office_status`, loads the matching skill, writes a JSON spec, invokes the bundled CLI with the absolute Python path, and inspects rendered PNGs when a renderer is available.

Ask for a render when layout matters: the skills require visual inspection rather than assuming a file is correct because it was written.

### Direct CLI use

`office_status` returns paths; the CLI accepts JSON specs and prints JSON:

```bash
"C:\path\to\python.exe" "C:\path\to\office_cli.py" docx create \
  --spec report.json --out report.docx

"C:\path\to\python.exe" "C:\path\to\office_cli.py" xlsx read \
  --input workbook.xlsx --data-only
```

Commands: `status`; `docx|pdf|pptx|xlsx create|read|edit|render`; `xlsx recalc`. Flags: `--spec`, `--out`, `--input`, `--out-dir`, `--dpi`, `--json-out`, `--data-only`.

Spec and edit shapes are documented in the skills under [`assets/skills`](assets/skills) and summarized in [CAPABILITY.md](CAPABILITY.md).

## Configuration

- Config: `%APPDATA%\dsh-office-suite\config.json` (Windows), `~/Library/Application Support/dsh-office-suite/config.json` (macOS), `$XDG_CONFIG_HOME/dsh-office-suite/config.json` (Linux).
- `DSH_OFFICE_PYTHON` overrides interpreter discovery for both the host and `postinstall`.

The config records `python`, `basePython`, `pythonVersion`, `pluginVersion`, `updatedAt`, and the import verification result. A missing or malformed config falls back to normal discovery; a config pointing at a broken interpreter is skipped.

## Honest limits

This plugin does not implement Google Docs, Google Slides, Google Sheets, or any remote editing. It does not bundle the Codex `@oai/artifact-tool` runtime. It does not provide OCR, PDF forms filling or signing, DOCX comments/tracked changes/TOC/watermarks, PPTX animations/notes/templates, or XLSX pivots/macros/data validation/conditional formatting. Attempting to use a local file as if it were a remote document is not supported.

See [CAPABILITY.md](CAPABILITY.md) for the capability trace, test evidence, and the complete unsupported list.

## Development

```bash
pnpm install
pnpm run lint --fix
pnpm run typecheck
pnpm run test -- --run
pnpm run build
```

The integration tests create files in a temporary directory whose name contains Chinese characters and spaces. They skip Python-backed cases when no compatible interpreter is available; API snapshot and feature-registry tests still run. Rendering tests run when Word or LibreOffice is detected.

## License

[MIT](./LICENSE.md)
