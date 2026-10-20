# Create or edit a document

**Goal.** Produce a `.docx` that opens cleanly in Word, with real heading styles, real lists and real tables, then change it later without destroying what is already there.

## Create

Write a JSON spec next to the output, then run:

```bash
"<python>" "<cli>" docx create --spec "<spec.json>" --out "<out.docx>"
```

```json
{
  "title": "Regional revenue review",
  "subtitle": "FY26 Q2",
  "author": "Finance",
  "header": "Internal — do not circulate",
  "footer": "FY26 Q2 review",
  "page_size": "Letter",
  "orientation": "portrait",
  "blocks": [
    { "type": "heading", "level": 1, "text": "Summary" },
    { "type": "paragraph", "text": "Revenue grew 18% year over year." },
    { "type": "bullets", "items": ["Renewals at 92%", "42 new accounts"] },
    { "type": "table", "headers": ["Region", "Revenue"], "rows": [["EMEA", "4.1M"], ["APAC", "3.2M"]] },
    { "type": "page_break" }
  ]
}
```

Block types and keys: `heading` (`level`, `text`), `paragraph` (`text`, `bold`, `italic`, `size`, `color`, `align`, `style`), `bullets` / `numbered` (`items`), `table` (`headers`, `rows`, optional `style`, default `Table Grid`), `image` (`path`, optional `width` in inches), `equation` (`latex`), `quote`, `page_break`, `spacer`. Page keys: `page_size` (`Letter` or `A4`), `orientation`, and `top_margin` / `bottom_margin` / `left_margin` / `right_margin` in inches.

The command prints counts for headings, paragraphs, list items, tables, images and equations. Check `equation_fallbacks`: a non-zero value means some LaTeX was emitted as styled text instead of OMML.

## Edit

The helper CLI does not mutate documents. Every edit is a script that reads the original, writes a copy, and refuses to overwrite its input. Omit `--out` and the copy lands next to the source as `<name>-edited.docx`.

Replace text — body, tables, and every header and footer:

```bash
"<python>" "<skill>/scripts/replace_text.py" --input "<original.docx>" --out "<original-edited.docx>" \
  --find "18%" --replace "21%" --find "Hardware flat" --replace "Hardware steady"
```

`--find` / `--replace` are paired in order; `--spec edits.json` takes `{"replace": [{"find": "...", "replace": "..."}]}` instead. The command prints a per-pair count. A match inside one run keeps that run's formatting; a match that straddles runs collapses the paragraph into its first run, so keep needles inside a single styled span when mixed formatting matters. `--require-all` exits 1 if a pair matched nothing, which is the check you want for a scripted edit.

Append blocks — the same block types `docx create` accepts:

```bash
"<python>" "<skill>/scripts/append_blocks.py" --input "<original.docx>" --out "<original-edited.docx>" --blocks "blocks.json"
```

```json
[{ "type": "heading", "level": 1, "text": "Appendix" }, { "type": "table", "headers": ["Region", "Revenue"], "rows": [["EMEA", "4.1M"]] }]
```

`--spec` takes a full document spec and appends its `blocks` array. The builder is the CLI's own, so anything that works in `docx create` works here, including images (`path`, `width`) and equations (`latex`).

Set properties:

```bash
"<python>" "<skill>/scripts/core_properties.py" --input "<original.docx>" --out "<original-edited.docx>" \
  --title "Regional revenue review (final)" --author "Finance" --keywords "revenue, FY26"
```

`--show` reports the current properties without writing; the same names work in `--spec core.json` under a `core` object.

Three independent scripts means a pipeline writes an intermediate copy (append, then properties). That is deliberate: each step is re-runnable and its output is a valid document you can inspect.

## When the CLI is not enough

| Need | Route |
|---|---|
| Edit inside a header, footer, footnote or comment | `scripts/docx_kit.py xml <file> <part>` to inspect, then the snippet below or a purpose script |
| Mark edits as tracked changes | `scripts/add_tracked_replacements.py`, `tasks/clean_tracked_changes.md` |
| Header date, footer page numbers, first hyperlink | `scripts/docx_ooxml_patch.py` |
| Replace a paragraph but keep its formatting | `python-docx` snippet below |

```bash
"<python>" - <<'PY'
from docx import Document
d = Document(r"<file.docx>")
for p in d.paragraphs:
    if "18%" in p.text:
        runs = p.runs or [p.add_run()]
        runs[0].text = p.text.replace("18%", "21%")
        for r in runs[1:]:
            r.text = ""
        break
d.save(r"<file-edited.docx>")
PY
```

Editing `w:t` text directly (via `docx_kit`) is safe for plain word swaps; anything that changes paragraph structure should go through `python-docx` so the surrounding XML stays consistent.

## Verify

`docx read` to confirm text and counts, then render and look at every page (`tasks/verify_render.md`). A spec that produces three pages instead of two means the table or margins need work, not that the renderer is wrong.

## Pitfalls

- Deleting and retyping a heading loses its outline level; edit the text, keep the style.
- `append_blocks.py` inserts before the final section properties, so a trailing landscape section or page setup keeps working.
- Replacing text that lives in a field result changes only the cached value; the field recalculates on open in Word.
- Copying content between documents by hand drops styles and relationships — use `scripts/merge_docx_append.py`.
