# Rendering setup and failures

## First: does this machine render

```bash
"<python>" "<cli>" status
```

Look at `renderers.kit` and `renderers.can_render`. `can_render.docx: false` means `docx render` will fail — not with a corrupt file, but with `the LibreOffice renderer is not available`. That is a setup problem, not a document problem.

## What renders

Rendering goes through the LibreOffice kit that DeepSeek Harness ships (`@deepseek-ai/libreoffice-kit`). On macOS and Windows it uses the kit's native engine; on Linux it uses the WASM engine. A separately installed Microsoft Office, WPS Office, or system LibreOffice is **not** used and does not make rendering work on its own.

The plugin finds the kit by walking up from its own directory through `node_modules/@deepseek-ai/libreoffice-kit/lib/cli.js`. So:

- Installed inside the harness tree → the kit is found automatically.
- Installed anywhere else → install the plugin where the harness can see its dependencies, or set `DSH_LIBREOFFICE_KIT_CLI` to the kit's `lib/cli.js`.
- `DSH_NODE` overrides the node binary if `node` is not on `PATH`.

## Common failures

| Message | Cause | Fix |
|---|---|---|
| `the LibreOffice renderer is not available` | Kit not found from the plugin directory | Put the plugin inside the harness tree, or set `DSH_LIBREOFFICE_KIT_CLI` |
| `cannot start the LibreOffice kit` / `EEXIST` | Interrupted install, or a stale staging directory | Re-run the plugin postinstall; delete leftover `.kit-render-*` directories |
| `Unsupported LibreOfficeKit host` | Unsupported platform/arch (the kit ships Windows x64/arm64, macOS x64/arm64, Linux via WASM) | Render on a supported host |
| `warning: N font(s) used by this file are not installed` | Font substitution — the render succeeded but that text may reflow or show boxes | Install the font or substitute it deliberately, then re-render |
| Blank pages | Missing font | See the font warning above |
| Text shifted | Font substitution | Compare with a render from the same renderer the user will use |

## Working without a renderer

Structure, text and metadata are all verifiable headlessly (`docx read`, the audit scripts, `docx_kit.py parts|text|xml`). Layout is not. In that state:

1. Do the structural verification.
2. Tell the user that page layout was not visually checked, and why.
3. Ask them to fix the kit install, or open the file and say what looks wrong.

Never describe a page you did not render.

## Keep renders disposable

Render into a fresh temp directory each time (`--out-dir`). A stale PNG from a previous run reads as a pass and is the most common false confirmation.
