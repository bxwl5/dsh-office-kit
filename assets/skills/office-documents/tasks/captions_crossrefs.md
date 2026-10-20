# Captions and cross-references

**Goal.** Number figures and tables automatically and refer to them from the prose without typing a number that will drift.

Two parts: a caption paragraph with a `SEQ` field (`SEQ Table \* ARABIC`), and a bookmark around it that the prose reaches with a `REF` field. Without the bookmark a `REF` has nothing to point at.

## Add captions

```bash
"<python>" "<skill>/scripts/captions_and_crossrefs.py" "<file.docx>" "<file-captioned.docx>" \
  --tables --figures --bookmarks --caption_text "Source: finance ledger"
```

- `--tables` adds `Table N` under each table, `--figures` adds `Figure N` under each picture. With neither flag, both run.
- Captions use the `Caption` style and sit inside the same visual block as the object, so a page break cannot orphan them.
- `--bookmarks` names the captions `tbl1`, `tbl2`, `fig1`, … so cross-references have targets.
- `--materialize` writes literal numbers instead of `SEQ` fields; use it for a frozen PDF export, not for a document that will change.
- `--caption_text` appends a fixed note after the number.

The bookmarks the script creates (`tblN`, `figN`) are what `insert_ref_fields.py` expects by default.

## Add cross-references

Write placeholders in your content, then convert them:

```bash
"<python>" "<skill>/scripts/insert_ref_fields.py" "<file.docx>" "<file-refs.docx>"
```

`[[REF:tbl1]]` becomes a `REF tbl1 \h` field, which renumbers when the table moves. `--pattern` accepts your own regular expression as long as it has a named group `bookmark`; `--prefix` prepends text such as `Table ` to each result.

If the reference should read "Table 2" rather than just "2", set the `REF` field's `\n` behaviour off and include the label in the prose — a field cannot know whether its target is a table or a figure.

## Order of operations

1. Add or restructure tables and figures.
2. Run `captions_and_crossrefs.py` (creates captions and bookmarks).
3. Run `insert_ref_fields.py` (turns placeholders into fields).
4. Re-render: caption positions and numbering are a layout decision.

## Verify

`fields_report.py`: one `SEQ` per caption, one `REF` per reference, no `REF` left with an empty result. Then read the rendered page — a caption above a table instead of below, or a caption separated from its object by a page break, is the usual defect.

## Pitfalls

- Renumbering happens on field update. Two captions claim `Table 2` until Word recalculates.
- A caption added by hand with the number typed in will not renumber; use the script or a `SEQ` field.
- Bookmarks must be unique; copying a caption copies its bookmark name and breaks the reference.
