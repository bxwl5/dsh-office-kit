# Compare two versions

**Goal.** Say what actually changed between two files, with evidence — not "the text differs somewhere".

Two useful comparisons: text-level (what words changed) and page-level (what the reader sees changed). Use both; a change in a style definition can leave the text identical and move every paragraph.

## Page-level diff

```bash
"<python>" "<skill>/scripts/render_and_diff.py" "<before.docx>" "<after.docx>" --outdir "<render-dir>" --dpi 120
```

Renders both through the helper CLI, pairs the pages, and writes `diff-NN.png` coloured by pixel difference. Reports which pages changed, the fraction of pixels differing, and a page-count delta.

The exit code is 3 when no renderer is available: render both files another way, or compare text only and say which comparison you could not run.

## Text-level diff

```bash
"<python>" "<skill>/scripts/docx_kit.py" text '<before.docx>' > before.json
"<python>" "<skill>/scripts/docx_kit.py" text '<after.docx>'  > after.json
```

Diff the two paragraph dumps (any diff tool, or a few lines of Python). This is the reliable way to separate content changes from layout changes.

## Review mode versus diff mode

If the user wants the *document* to carry the changes, use tracked changes (`tasks/clean_tracked_changes.md`) rather than a report: the reviewer accepts or rejects inside Word. A diff is evidence for a conversation; tracked changes are the artefact.

For a version that arrived with markup, `accept_tracked_changes.py --mode report` is the change list, with reviewer names and where each edit sits.

## Verify

Open the diff PNGs with `read_image` and look at them: a coloured block on a page that should not have changed usually means a font substitution or a margin change, not a content change. Cross-check with the text diff before writing a conclusion.

## Pitfalls

- Different renderers paginate differently; compare renders made by the same renderer and the same settings.
- Metadata and revision ids differ between saves and never appear on a page — a text diff of `word/document.xml` is noisy for that reason.
- An image replaced in place keeps the same relationship and page position; only a pixel comparison notices.
