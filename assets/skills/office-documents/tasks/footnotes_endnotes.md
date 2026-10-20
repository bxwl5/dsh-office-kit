# Footnotes and endnotes

**Goal.** Attach a reference note at exactly one place in the text, and keep the note body in the notes part rather than in the body.

Notes live outside the flow: `word/footnotes.xml` (or `word/endnotes.xml`) holds the text, and a `w:footnoteReference w:id="N"` run in the body points at it. The part also needs the separator notes (ids -1 and 0) or Word repairs the file.

## Insert a note

Put a marker where the reference belongs, then convert it:

```bash
"<python>" "<skill>/scripts/insert_note.py" "<file.docx>" --kind footnote --text "Source: ledger extract, June." --out "<file-notes.docx>"
```

The marker defaults to `[[NOTE]]`; change it with `--marker`. The script creates the notes part (with separator and continuation-separator entries) if it does not exist, allocates the next free id, splits the surrounding run so only the marker is replaced by the reference, and styles the note text with `FootnoteText` and the reference with `FootnoteReference`. `--kind endnote` writes to the endnotes part instead.

## Report

```bash
"<python>" "<skill>/scripts/footnotes_report.py" "<file.docx>"
```

Lists each note's text, how many references point at it, and which references dangle or which notes are orphaned. Orphans appear when content is copied between documents; dangling references appear when a note is deleted but its marker stays.

## Renumbering

Note ids are numbers, but Word displays them sequentially by position, so inserting a note in the middle renumbers the rest automatically. Do not try to keep ids in display order — keep them unique.

## Verify

Render the page with the note and read the note area: the marker should sit immediately after the word it annotates, with no space before it, and the note text should match. Also check the last page — an endnote section that lands after the signature block is a layout defect.

## Pitfalls

- A footnote reference inside a table cell is allowed; inside a header it is not.
- Copying a paragraph with `python-docx` copies the reference but not the note body — recreate the note in the target document.
- Deleting note text without deleting the reference leaves a broken document that opens with a repair prompt.
- Field instructions are not allowed in the note separator; keep the built-in separator notes untouched.
