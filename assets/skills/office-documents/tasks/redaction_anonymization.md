# Redaction and anonymisation

**Goal.** Remove personal data — addresses, phone numbers, names, account references — from a document before it leaves the organisation, in the text and in the places text hides.

Text lives in `w:t` (and `w:delText` for deletions, `w:instrText` for field instructions). A redaction that only rewrites paragraphs via `python-docx` misses headers, footers, footnotes and comments.

## Redact

```bash
"<python>" "<skill>/scripts/redact_docx.py" "<file.docx>" "<file-redacted.docx>" --emails --phones
"<python>" "<skill>/scripts/redact_docx.py" "<file.docx>" "<file-redacted.docx>" --pattern "ACCT-\d{6}" --replacement "<account>"
```

- Default run covers emails and phone numbers; add `--pattern` (repeatable) for account numbers, case ids, postcodes.
- `--mask_char *` keeps the shape of the value visible (`***@***.com` style), `--replacement` swaps in a token, `--no_preserve_length` stops padding to the original length.
- `--include_comments` also rewrites `word/comments.xml`; without it, comments keep the original text.
- Applied to body, every header and footer, footnotes and endnotes.

Matching happens per text run, because merging runs would destroy the surrounding formatting. A value split across runs (bolded digits inside a phone number) is not found — an acceptable trade only if you check the result; when the file mixes formatting inside the sensitive value, flatten that paragraph first (`tasks/style_lint_normalize.md`).

## Redaction versus anonymisation

Redaction removes the value; anonymisation replaces it consistently. If the same account number appears four times and the argument depends on it matching, replace all occurrences with the same token rather than `[redacted]` every time — `--replacement "<account-A>"` per pattern does that.

## Check the whole file

```bash
"<python>" "<skill>/scripts/docx_kit.py" text '<file-redacted.docx>' --part word/footnotes.xml
"<python>" "<skill>/scripts/docx_kit.py" xml '<file-redacted.docx>' word/document.xml | grep -c "example.com"
```

A grep over dumped XML is the honest check: run it for each sensitive term, across the document, header, footer, footnote and comment parts.

## Verify

Render, then read the pages the data appeared on. A redaction that changed the line length enough to shift the layout is worth a look; a redaction that left a `<w:t>` intact shows up in the grep, not the page.

## Pitfalls

- Field results and field instructions can both contain data; the script rewrites `w:t` and `w:delText` only.
- Images are not scanned — a screenshot of a spreadsheet is not redacted by any text pass. Say so plainly.
- Charts store category labels in `word/charts/*.xml`; inspect those parts when a chart carried the sensitive data.
