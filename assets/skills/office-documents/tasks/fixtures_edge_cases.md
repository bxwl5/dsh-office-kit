# Fixtures and edge cases

**Goal.** Have a file that contains the awkward cases *before* you are asked to handle them, so a fix is tested against a 1600-word paragraph and not only against clean prose.

## Build the fixture set

```bash
"<python>" "<skill>/scripts/make_fixtures.py" --outdir "<work-dir>" --only all
```

Writes:

| File | Contains |
|---|---|
| `tracked.docx` | A replacement as real `w:del`+`w:ins` markup, tracking switched on |
| `watermark.docx` | A DRAFT watermark in the header |
| `comments.docx` | One anchored comment in `word/comments.xml` |
| `edge_cases.docx` | Empty paragraph, H1 to H3 jump, 1600-word paragraph, email and phone, 2×10 unstyled table, image with no alt text |

`--only tracked|watermark|comments|edge` builds one.

These are inputs for testing a change, not templates. Do not ship them.

## The cases that break naive edits

- **Long paragraphs** — a replacement that rebuilds the paragraph loses run formatting across thousands of characters; check the result with `read_image`, not only with a text dump.
- **Nested tables** — text inside `table > cell > table > cell` is missed by `document.paragraphs`; walk `cell.tables` or use the pack scripts, which do.
- **Header/footer text** — a find-and-replace over the body never sees it.
- **Tables without a style** — borders come from the renderer default and change when the file is opened elsewhere; apply `Table Grid` or set explicit `#D9D9D9` borders.
- **Images with no alt text** — an accessibility finding, and also a sign the image was pasted rather than placed.
- **Manual spacing** — a document padded with empty paragraphs and spaces looks right in one renderer and wrong in the next; normalize instead (`tasks/style_lint_normalize.md`).
- **Mixed page sizes** — a landscape section inside a portrait document confuses footers and headers; `section_audit.py` reports it.

## Regression pass before delivery

```bash
for f in "<work-dir>"/*.docx; do
  echo "== $f"
  "<python>" "<skill>/scripts/heading_audit.py" "$f"        || true
  "<python>" "<skill>/scripts/style_lint.py" "$f"           || true
  "<python>" "<skill>/scripts/a11y_audit.py" "$f"           || true
  "<python>" "<skill>/scripts/section_audit.py" "$f"        || true
done
```

An audit that now reports nothing where it previously reported a real problem is the signal that a fix regressed. Keep the fixture out of the user's workspace; put it under the temp directory.

## Verify

Whatever the script produced, render it. Fixtures exist to be looked at: a 1600-word paragraph and a table that is too wide both fail visually first.
