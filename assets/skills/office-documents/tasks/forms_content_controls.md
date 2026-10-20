# Forms and content controls

**Goal.** Fill or create a structured field — a name, a date, a choice — as a real content control, so the value is labelled in the XML instead of being plain text between two labels.

A content control is `w:sdt` with `w:sdtPr` (tag, alias, id, type) and `w:sdtContent`. The tag is the machine name; the alias is what Word shows in the properties panel.

## List what exists

```bash
"<python>" "<skill>/scripts/content_controls.py" list "<file.docx>"
```

Reports each control's part, tag, alias, id, type and current text, across the body, headers and footers. `--no_headers_footers` limits it to the body.

## Create

```bash
"<python>" "<skill>/scripts/content_controls.py" create "<file.docx>" \
  --placeholder "Client name" --tag client_name --alias "Client name" --out "<file-form.docx>"
```

The script wraps the paragraph containing the placeholder text (or appends a new one) in a `w:sdt`, so the field is a drop-in replacement for a typed placeholder line. `--json` prints the created control instead of a summary.

## Fill

```bash
"<python>" "<skill>/scripts/content_controls.py" set "<file-form.docx>" \
  --set client_name="Northwind" --set period="Q2 FY26" --out "<file-filled.docx>"
```

`--set TAG=VALUE` matches on the tag. The command exits 1 and lists `missing_tags` when a tag is not present — that is the check for a scripted fill, so a typo does not silently write nothing.

## Design

- One control per value; do not put a whole table into one control.
- Tag in `snake_case`, alias in the user's words.
- A choice control lists its options in `w:sdtPr`; a date control has `w:date` with a format. Plain text is the default and the safest thing to generate.
- Leave the surrounding labels in the body text; the alias is visible only in Word's properties panel.

## Verify

`content_controls.py list` after filling: tags present with the expected text. Then render — a control's content is normal text on the page, so the visual check is that nothing shifted and the filled value fits its line.

## Pitfalls

- Deleting an `sdt` wrapper while trying to "clear" a field deletes the value and the structure; set the text instead.
- Two controls with the same tag make `--set` ambiguous; the script updates the first and reports the rest.
- A content control cannot span two paragraphs without `w:sdtContent` holding both — keep one value per paragraph when generating.
