# Rendering setup and failures

## First: does this machine render

```bash
"<python>" "<cli>" status
```

Look at `renderers.libreoffice` and `microsoft_office`. Both null means `docx render` will fail — not with a corrupt file, but with `no document renderer found`. That is a setup problem, not a document problem.

## LibreOffice

Install LibreOffice (Windows: winget `TheDocumentFoundation.LibreOffice`), then check:

```bash
soffice --headless --version
```

If the binary is not on `PATH`, the runtime cannot find it; either add its `program` directory to `PATH` or install into the default location the runtime probes. On Windows, `soffice.com` is the console wrapper — use that one, not `soffice.exe`, when a script needs to wait for exit.

## Microsoft Office

When Word is installed, the CLI can drive it through COM and does not need LibreOffice. Office must be activated and able to launch without a first-run dialog; a pending activation or a modal "sign in" blocks the render forever.

## Common failures

| Message | Cause | Fix |
|---|---|---|
| `no document renderer found` | Neither installed / not on PATH | Install one, re-check `status` |
| Render hangs | A dialog is waiting in the headless process | Kill the leftover process, add the `--headless --norestore` flags the CLI uses |
| Blank pages | Missing font | Install the font or substitute it |
| Text shifted | Font substitution | Compare with a render from the same renderer the user will use |
| `soffice already running` | A user profile lock from a crashed run | Remove the stale lock file under the LibreOffice user profile, or wait for the old process to exit |

## Working without a renderer

Structure, text and metadata are all verifiable headlessly (`docx read`, the audit scripts, `docx_kit.py parts|text|xml`). Layout is not. In that state:

1. Do the structural verification.
2. Tell the user that page layout was not visually checked, and why.
3. Offer the install, or ask them to open the file and say what looks wrong.

Never describe a page you did not render.

## Keep renders disposable

Render into a fresh temp directory each time (`--out-dir`). A stale PNG from a previous run reads as a pass and is the most common false confirmation.
