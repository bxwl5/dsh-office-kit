# Read and review a file

**Goal.** Understand an existing document before touching it: what it contains, how it is structured, and what is wrong with it.

## Read the content

```bash
"<python>" "<cli>" docx read --input "<file.docx>"
```

Returns the title, author, paragraphs with their styles, headings, tables, image and equation counts, and page dimensions. Use it as the first look, including for files you produced earlier in the session.

## Read the structure

```bash
"<python>" "<skill>/scripts/docx_kit.py" parts '<file.docx>'    # every package part and its size
"<python>" "<skill>/scripts/docx_kit.py" text '<file.docx>'     # paragraphs with style and outline level
"<python>" "<skill>/scripts/docx_kit.py" xml '<file.docx>' word/document.xml
```

`parts` tells you which features exist at all (a `comments.xml` means the file carries comments; its absence means none, even if the user says otherwise). `text` is faster than reading raw XML when you only need the words and their heading levels.

## Audit what is there

| Question | Command |
|---|---|
| Are headings consistent and styled? | `heading_audit.py` |
| Is the prose styled directly instead of by style? | `style_lint.py` |
| Are images described, sized sensibly? | `images_audit.py` |
| Is the page setup sane? | `section_audit.py` |
| Are there fields, TOC entries, cross-references? | `fields_report.py` |
| Are there footnotes or endnotes? | `footnotes_report.py` |
| What comments exist, and on what text? | `comments_extract.py` |

Every audit script prints JSON and exits non-zero when it found something, so the exit code alone tells you whether the document needs attention. Read the `findings` array rather than the exit code when you need the reason.

## Review for the user

When the job is "review this document" rather than "change it":

1. Read the text, not just the audits. Point out the argument, not only the formatting.
2. Separate defects (broken table, skipped heading level, missing alt text) from style preferences.
3. Cite locations by section heading and paragraph text — Word has no stable page numbers.
4. Offer the fix as a concrete next action, with the command that performs it.

## Pitfalls

- `docx read` shows the body only; headers, footers, footnotes and comments need `docx_kit.py xml` or the dedicated report scripts.
- Tracked changes are visible as plain text in a read; use `accept_tracked_changes.py --mode report` to see what is proposed.
- A field's displayed text is a cached result. `fields_report.py` shows the instruction, which is the truth.
