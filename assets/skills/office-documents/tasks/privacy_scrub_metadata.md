# Privacy: metadata and residue

**Goal.** A file that carries only the content the user meant to send: no author name, no tracked review history, no comments, no template identity, no editing session ids.

`.docx` stores more than the text: `docProps/core.xml` (author, last modifier, title, keywords, description), `docProps/app.xml` (company, manager, template), `docProps/custom.xml`, `word/comments.xml`, revision data and per-author `w:rsid` attributes.

## Scrub metadata

```bash
"<python>" "<skill>/scripts/privacy_scrub.py" "<file.docx>" --out "<file-clean.docx>"
```

Clears creator, last-modified-by, keywords, description, subject, title, category, company, manager and application; resets the revision counter; drops `docProps/custom.xml` and its relationships and content-type override; strips `w:rsid*` attributes, `w:proofErr` and `w:lastRenderedPageBreak` across the Word parts.

`--keep_title` leaves the title in place when the title is real content the user wants.

## The rest of the residue

| Residue | Command |
|---|---|
| Comments and their authors | `comments_strip.py` |
| Tracked changes and reviewer names | `accept_tracked_changes.py --mode accept` (or reject) |
| Watermarks naming the old client | `watermark_audit_remove.py --mode remove` |
| Emails and phone numbers in the text | `redact_docx.py` |

Run them in that order — scrub metadata, resolve markup, then redact the text that survived.

## Check before delivery

```bash
"<python>" "<skill>/scripts/docx_kit.py" parts '<file-clean.docx>'
"<python>" "<skill>/scripts/docx_kit.py" xml '<file-clean.docx>' docProps/core.xml
```

`parts` shows whether `docProps/custom.xml` or `word/comments.xml` still exist; the core part shows what a recipient would see in File > Info. Both are cheap and both catch the mistake the scripts did not.

## Verify

Metadata is not visible in a page render. Verify with the commands above, and render to be sure the document still looks right after the scrub — clearing `w:lastRenderedPageBreak` can change where a viewer chooses to break a long line.

## Pitfalls

- Author names also appear in comment and revision entries, not only in core properties.
- `docProps/app.xml` names the editing application; it is regenerated on next save by whatever app opens the file.
- Removing revision ids does not undo content — the text is still there.
