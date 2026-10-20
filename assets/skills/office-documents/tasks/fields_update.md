# Fields and field updates

**Goal.** Find out what a document computes, and decide whether to keep it live or freeze it.

A field is an instruction the reader's Word evaluates: `SEQ` numbers captions, `REF` repeats a bookmark, `PAGE`/`NUMPAGES` count pages, `TOC` builds the contents list, `DATE` prints today. Until Word recalculates it, the file shows a cached result — which is why a TOC in a freshly edited file can look stale.

## Inspect

```bash
"<python>" "<skill>/scripts/fields_report.py" "<file.docx>" --max-examples 5
```

Reports the instruction, whether the field is a simple (`w:fldSimple`, one attribute) or complex field (begin/separate/end runs), and the cached result. `docx_kit.py xml` shows the raw runs when the report is not enough:

```bash
"<python>" "<skill>/scripts/docx_kit.py" xml '<file.docx>' word/document.xml | grep -o 'instrText[^<]*' | head
```

## Freeze a field to its current value

```bash
"<python>" "<skill>/scripts/fields_materialize.py" "<file.docx>" --out "<file-static.docx>" --only SEQ REF
"<python>" "<skill>/scripts/flatten_ref_fields.py" "<file.docx>" --out "<file-static.docx>"
```

Materialising replaces the field span with one run holding the cached text, keeping the run formatting. `flatten_ref_fields.py` is the narrow version for `REF` and `PAGEREF` only.

Freeze when: the document is going to a reader who must see exactly this number, the target bookmark is being deleted, or a downstream tool mangles fields. Keep it live when the document will be edited again — a frozen caption number stops following its table.

## Keep it live

- Word recalculates on open when `w:updateFields val="true"` is set in `word/settings.xml`. `insert_toc.py` sets it for a new TOC; if you need it for an existing file, add the element yourself and tell the user the first open will prompt.
- LibreOffice and the renderer also refresh fields; a stale cached value in a preview usually means the field was never recalculated, not that the field is broken.
- `insert_ref_fields.py` converts `[[REF:bookmark]]` placeholders into real `REF` fields, which is the reliable way to build cross-references after restructuring.

## Verify

`fields_report.py` after the change: frozen fields disappear from the report, live ones keep their instruction. Render and read the page to confirm the number the reader sees.

## Pitfalls

- A field split across paragraphs is invalid; keep begin/separate/end together.
- `w:fldSimple` and complex fields both appear in the report — do not assume the absence of `w:fldSimple` means there are no fields.
- Copying a field to another document copies the instruction but not the bookmark it refers to; recreate it there.
