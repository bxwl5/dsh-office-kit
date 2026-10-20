---
description: Create, inspect, edit, redact, stamp, and render PDF files with the bundled Office helper CLI and self-contained Python scripts.
---

# PDF

A PDF page is a content stream of text-showing and path-painting operators behind a page box. Every job in this pack either reads that stream (PyMuPDF, pdfplumber, pypdf), writes a new one (reportlab), or rasterises the result so you can look at it. Work from the mechanics outward: inspect first, choose the smallest operation that changes what the user asked for, then prove the change on a render. The helper CLI and the scripts are fast paths, not limits — each task file carries a runnable snippet for jobs they do not cover yet.

| User job | What actually happens | Fast path |
| --- | --- | --- |
| Look at a page, crop, or measure geometry | Rasterise the page box with PyMuPDF at a DPI, read page size, rotation, text, drawings, widgets | `scripts/render_pages.py`, `pdf render` |
| Extract text or tables | pdfplumber reads characters and clusters table rules per page | `scripts/extract_text.py`, `pdf read` |
| Inspect or fill an AcroForm | pypdf walks `/AcroForm` widgets, then rebuilds each `/AP` appearance from `/V` | `scripts/forms.py`, snippet in `tasks/forms.md` |
| Remove a region (redaction) | PyMuPDF redaction annotations plus `apply_redactions` strip text and line art inside a rect | `scripts/redact_region.py`, snippet in `tasks/redact.md` |
| Read or rewrite metadata | The document info dictionary; producer keys cannot change page content | `scripts/metadata.py` |
| Merge, split, reorder, rotate, delete pages | Page-tree rearrangement; content is copied, not re-flowed | `scripts/page_ops.py`, `scripts/split_pages.py`, snippet in `tasks/edit-pages.md` |
| Stamp a footer, header, or banner | reportlab draws an overlay page, pypdf merges it over the target pages | `scripts/stamp_overlay.py` |
| Build a new document | reportlab draws primitives and text into a page | `pdf create`, `tasks/create.md` |

## Before any file work

1. Call the `office_status` tool.
2. Read the `## Office runtime` JSON block at the end of this file and use its `python`, `cli`, `skill`, and `shared` values verbatim, quoted: `"<python>"`, `"<cli>"`, `"<skill>/scripts/<name>.py"`.
3. If that block reports no working runtime, stop. Give the user the `node "..."` remedy command it names, then call `office_status` again. Never fabricate a PDF result you could not verify.

Scripts under `"<skill>/scripts/"` are standalone argparse CLIs. Run `<python> <script> --help` before using one you have not called in this session.

## Route selection

Decide the route before you type a command. Every route ends in the same render check.

- **The file does not exist** → create it from a `pdf create` spec, or with reportlab when the layout does not fit the block model (`tasks/create.md`).
- **The file exists and must change** → read it first (`pdf read`, and a render), then mutate it with the script named in the task file. The helper CLI has no edit verb: it creates, reads, renders, and reports status only; every change is a `scripts/*.py` call.
- **A script covers the job** → run it, then verify its JSON report and its rendered pages. Scripts refuse to overwrite their input and exit non-zero on a failed self-check; treat both as hard stops.
- **A read/render verb covers it** → `pdf read`, `pdf render`, or `pdf status`, then verify in the task's own way. Never route a mutation through the CLI.
- **Neither covers it** → run the runnable snippet in the matching `tasks/*.md` file, or adapt it. Do not invent a CLI verb, and do not tell the user the job is impossible because no verb exists.
- **Choose the smallest operation** that satisfies the request: metadata change before rebuild, page move before re-creation, one-line patch before re-typing the page.

## Failure handling

| Symptom | Meaning | Next step |
| --- | --- | --- |
| `{"ok": false, ...}` and non-zero exit | Invalid argument, missing file, or a refused overwrite | Read the `error` field, fix what it names, re-run. Never strip a step to make it pass. |
| `encrypted` in the error | The file needs a password | Ask the user for a decrypted copy; do not guess passwords or write one into a command. |
| `no renderer found: install LibreOffice or Microsoft Office` | Media conversion for docx/pptx/xlsx is unavailable | PDF rendering still works; for a PDF this is harmless. For other formats report that appearance could not be checked. |
| `leftover_chars_in_rect` greater than 0 | The redaction rectangle missed text | Enlarge `--pad` or reconvert the region; re-render before delivering. |
| `not_applied` is not empty | A form value did not persist after save | Treat as a failure: check the field name, its allowed states, and whether the widget has an appearance stream. |
| `chars: 0` on a page that shows text | Scanned page, no text layer | Say so; follow `references/limits.md` for the OCR situation. Do not return an empty extraction as success. |
| Render shows the change, `pdf read` does not | The edit landed in pixels only | Fix the content stream or note the limitation; a visible-only change usually means a cover-up, not an edit. |

## Quality rules

- One heading scale, one body size, and one margin system per document (`references/layout-quality.md`).
- Prove every structural change on a render of the changed page, not only on a text dump.
- Keep page geometry consistent when merging or stamping: use each page's own box.
- Do not claim redaction while the words are still extractable.
- Preserve the user's original: write `<original>-edited.pdf`, never over it.
- Mark deliberate shortcuts (a rebuild instead of a reflow, a stamped patch instead of a content edit) in the reply, so the user knows what kind of change they received.
- Deliver with `present`, then one sentence about what changed and where the file is.

## Delivery

Always hand the finished file to the user with the `present` tool, then summarise in one sentence what changed. A bare path is not delivery: the chat transcript renders `.docx`/`.pptx`/`.xlsx`/`.pdf` links as "二进制文件，无法显示改动" and the user cannot open them.

- Creating a file: write it into the user's workspace, verify it, then `present`.
- Editing an existing file: never overwrite the original. Write `<original>-edited.<ext>` (or a name the user asked for), verify it, `present` it, and state both paths.

## Annotations

The user may reply with an `office-annotations` block: `[{ page, text, requirement, region: { left, top, width, height } }]`. `region` is normalised 0–1 against the rendered preview page the user drew on; `requirement` is free-form natural language. Treat it as a change request, not as editor state: locate what the region covers, apply the smallest edit that satisfies `requirement`, re-render, and confirm the region now looks right.

When the payload cannot be mapped to a concrete object (the region is empty or the file has no geometry), do not guess silently — say what you could not locate.

For PDF the `page` value is the 1-based page of the file itself, and `region × page.rect` is the real place to operate on: convert once with PyMuPDF and use the device rect directly. `text` is the words under the mark and wins over the region when they disagree; `imageName`, when present, is a screenshot of the marked area that you can open with `read_image`. Full resolution recipe: `tasks/annotations.md` and `"<shared>/annotation-recipes.md"`.

## Verify

Render before you present, and again after every fix:

```bash
"<python>" "<cli>" pdf render --input "<file.pdf>" --out-dir "<render-dir>" --dpi 110
```

Open each PNG with `read_image`, and compare it with the same page rendered before the change. Look for text clipped at the page box, overlapping stamps or form fields, fonts replaced by boxes, rotated pages that now sit sideways, tables spilling past the margin, and scanned pages whose text is an image. Then run `"<python>" "<cli>" pdf read --input "<file.pdf>"` and confirm the text, page count, and form fields match what you edited. Two or three render/patch passes are normal; if a defect survives three, say what still looks wrong instead of calling it fixed.

## Tasks

| Task | Read |
| --- | --- |
| Create a PDF from a spec or reportlab | `tasks/create.md` |
| Extract text, tables, or page images | `tasks/read.md` |
| Inspect, fill, or flatten an AcroForm | `tasks/forms.md` |
| Remove a region of a page | `tasks/redact.md` |
| Merge, split, reorder, rotate, delete pages | `tasks/edit-pages.md` |
| Stamp a footer, header, or label | `tasks/stamp.md` |
| Resolve an `office-annotations` region | `tasks/annotations.md` |
| Decide what a PDF cannot do | `references/limits.md` |

`references/geometry.md` explains page boxes and normalised regions, `references/layout-quality.md` is the pre-delivery visual checklist, `references/form-fields.md` covers field flags, appearance streams, and flattening.

## Shared workflow

Follow `"<shared>/common-workflow.md"` for the create-or-edit decision, the failure ladder, and the edit naming rule, and `"<shared>/annotation-recipes.md"` for the payload shapes the client sends.
