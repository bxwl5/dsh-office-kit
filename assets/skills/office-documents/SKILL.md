---
description: Build, inspect, revise, and visually verify Word .docx files using the Office helper CLI and the bundled XML scripts.
---

# Documents (.docx)

A `.docx` is a zip of XML parts: `word/document.xml` holds the body, and headers, footers, footnotes, comments, styles and numbering live beside it. Two routes reach every part of it:

- **Fast path** — the helper CLI inspects, renders and creates: `docx create`, `docx read`, `docx render`. It performs no in-place mutation.
- **Structural path** — `scripts/*.py` in this skill do all editing: replace text, append blocks, set properties, and everything structural — comments, tracked changes, fields, protection, watermarks.

Pick the cheapest route that produces the structure the user asked for, then verify it visually. Never invent content, and never deliver a file you have not looked at.

## Before any file work

1. Call the `office_status` tool.
2. Read the `## Office runtime` block at the end of this file for the verified `python`, `cli`, `skill` and `shared` paths.
3. If that block says no runtime is available, stop and give the user the `node "..."` remedy command it names, then call `office_status` again. Do not fake a document or claim success.

Quote every path. Spaces, non-ASCII names and `&` are normal on Windows.

## Delivery

Always hand the finished file to the user with the `present` tool, then summarise in one sentence what changed. A bare path is not delivery: the chat transcript renders `.docx`/`.pptx`/`.xlsx`/`.pdf` links as "二进制文件，无法显示改动" and the user cannot open them.

- Creating a file: write it into the user's workspace, verify it, then `present`.
- Editing an existing file: never overwrite the original. Write `<original>-edited.<ext>` (or a name the user asked for), verify it, `present` it, and state both paths.

## Annotations

The user may reply with an `office-annotations` block: `[{ page, text, requirement, region: { left, top, width, height } }]`. `region` is normalised 0–1 against the rendered preview page the user drew on; `requirement` is free-form natural language. Treat it as a change request, not as editor state: locate what the region covers, apply the smallest edit that satisfies `requirement`, re-render, and confirm the region now looks right.

When the payload cannot be mapped to a concrete object (the region is empty or the file has no geometry), do not guess silently — say what you could not locate.

For `.docx`, `page` is the page of the *rendered PDF preview*, not a Word page. Use `text` (and the paragraph text near it) to locate the target; the region is a hint for near-misses only. A region that lands on a table row, a caption or a header is ambiguous — state which object you picked before editing.

## Verify

Rendering is the only proof that a document looks right.

```bash
"<python>" "<cli>" docx render --input "<file.docx>" --out-dir "<render-dir>"
```

The command writes a PDF plus one PNG per page and prints the paths. Open each PNG with `read_image` and check: heading hierarchy, table width and cell wrapping, page breaks, header/footer, clipped or overflowing text, missing glyphs (dashes, CJK, symbols), equation rendering, and caption placement.

- Iterate until the pages look correct, then deliver. "It parses" is not verification.
- If the runtime reports no renderer (`renderers.can_render.docx: false` — the DSH LibreOffice kit is missing), ask the user to fix the install, or fall back to `docx read` plus the audit scripts. Say plainly that layout was not visually verified — do not describe a page you did not see.
- After a script edits XML, re-render. A package can stay valid while the page it produces is broken.

## Choosing a route

| Job | Fast path | Structural path |
|---|---|---|
| New document from scratch | `docx create --spec` | `python-docx` snippet in `tasks/create_edit.md` |
| Replace or append text and blocks | — | `scripts/replace_text.py`, `scripts/append_blocks.py` |
| Document properties | — | `scripts/core_properties.py` |
| Read structure | `docx read` | `scripts/docx_kit.py text`, `style_lint`, audits |
| Comments, tracked changes | — | `scripts/comments_*.py`, `scripts/*tracked*.py` |
| Fields, TOC, cross-references | — | `scripts/insert_toc.py`, `insert_ref_fields.py`, `fields_*.py` |
| Footnotes, endnotes | — | `scripts/insert_note.py`, `footnotes_report.py` |
| Tables, layout geometry | `docx create` table block | `scripts/table_geometry.py`, `docx_table_to_csv.py` |
| Styles, templates | — | `scripts/style_*.py`, `apply_template_styles.py` |
| Protection, watermarks, privacy | — | `scripts/set_protection.py`, `watermark_*.py`, `privacy_scrub.py`, `redact_docx.py` |

Where no verb exists, the fallback is the listed script or a short `python-docx`/`lxml` snippet. Both are runnable with the runtime `python`; neither needs a new dependency.

## Task index

| Task | Read | Main tool |
|---|---|---|
| Create or edit a document | `tasks/create_edit.md` | CLI create, `replace_text.py`, `append_blocks.py`, `core_properties.py` |
| Read and review a file | `tasks/read_review.md` | CLI read, `docx_kit.py text` |
| Comments | `tasks/comments_manage.md` | `comments_add/extract/apply_patch/strip.py` |
| Tracked changes | `tasks/clean_tracked_changes.md` | `accept_tracked_changes.py`, `add_tracked_replacements.py` |
| Fields and updates | `tasks/fields_update.md` | `fields_report.py`, `fields_materialize.py` |
| Table of contents | `tasks/toc_workflow.md` | `insert_toc.py`, `fields_*.py` |
| Captions and cross-references | `tasks/captions_crossrefs.md` | `captions_and_crossrefs.py`, `insert_ref_fields.py` |
| Navigation links | `tasks/navigation_internal_links.md` | `internal_nav.py` |
| Footnotes and endnotes | `tasks/footnotes_endnotes.md` | `insert_note.py`, `footnotes_report.py` |
| Headings and numbering | `tasks/headings_numbering.md` | `heading_audit.py` |
| Tables | `tasks/tables_spreadsheets.md` | `table_geometry.py`, `docx_table_to_csv.py`, `xlsx_to_docx_table.py` |
| Images and figures | `tasks/images_figures.md` | `images_audit.py` |
| Sections and page setup | `tasks/sections_layout.md` | `section_audit.py` |
| Styles | `tasks/style_lint_normalize.md` | `style_lint.py`, `style_normalize.py` |
| Templates | `tasks/templates_style_packs.md` | `apply_template_styles.py`, `references/template-elicitation.md` |
| Accessibility | `tasks/accessibility_a11y.md` | `a11y_audit.py` |
| Content controls | `tasks/forms_content_controls.md` | `content_controls.py` |
| Editing protection | `tasks/protection_restrict_editing.md` | `set_protection.py` |
| Watermarks | `tasks/watermarks_background.md` | `watermark_add.py`, `watermark_audit_remove.py` |
| Privacy and metadata | `tasks/privacy_scrub_metadata.md` | `privacy_scrub.py` |
| Redaction | `tasks/redaction_anonymization.md` | `redact_docx.py` |
| Merging documents | `tasks/multi_doc_merge.md` | `merge_docx_append.py` |
| Comparing versions | `tasks/compare_diff.md` | `render_and_diff.py` |
| Equations | `tasks/equations.md` | CLI `equation` block |
| Visual verification | `tasks/verify_render.md` | `render_docx.py` (skill root) |
| Fixtures and edge cases | `tasks/fixtures_edge_cases.md` | `make_fixtures.py` |

## Document defaults

- Letter 8.5×11 portrait (A4 when the user or template says so), 1in margins, body 11–12pt, single column.
- Black headings and body text; colour only for deliberate emphasis, links and chart series.
- Tables: light grey `#D9D9D9` borders, a bold header row, `w:tblHeader` so the header repeats across pages, no vertical merges in wide tables.
- No decorative callout boxes, drop shadows or coloured sidebars. Structure comes from headings, lists and tables.
- Captions sit under figures and above tables, in the `Caption` style, and stay with their object.
- Prefer native structures — heading styles, real lists, real tables, OMML equations — over hand-positioned runs, because the next edit depends on that structure.

## Writing quality

Write the content the user asked for, in plain sentences, without filler. `references/writing-quality.md` holds the checklist; `references/docx-structure.md` explains which package part each feature lives in before you touch XML.

## Shared workflow

Cross-format habits, the review loop and how to read annotation payloads live in `"<shared>/common-workflow.md"` and `"<shared>/annotation-recipes.md"`; read them when the job spans more than one Office format.
