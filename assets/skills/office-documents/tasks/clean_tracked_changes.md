# Tracked changes

**Goal.** Propose edits as tracked changes so a reviewer can accept or reject them, or clean up a file that arrives full of markup.

A tracked edit is markup, not text: an insertion is `w:ins` wrapping runs, a deletion is `w:del` wrapping `w:delText`, and formatting changes are `w:rPrChange` / `w:pPrChange`. The setting `w:trackRevisions` in `word/settings.xml` makes Word record new edits the same way.

## Propose an edit

```bash
"<python>" "<skill>/scripts/add_tracked_replacements.py" "<file.docx>" --out "<file-tracked.docx>" \
  --author "Review" --replace "18%=21%" --replace "flat=steady"
```

Each `--replace` is `OLD=NEW`; the script splits runs at the match so only the changed characters are marked, keeps the surrounding formatting, and turns on `trackRevisions`. Quote the `--author` the reviewer should see.

Limit: one replacement per pattern per paragraph, and a match split across runs is still found because the split is computed on paragraph text. Reword the pattern if the paragraph repeats the phrase.

## Inspect what is proposed

```bash
"<python>" "<skill>/scripts/accept_tracked_changes.py" "<file.docx>" --mode report
"<python>" "<skill>/scripts/docx_kit.py" xml "<file.docx>" word/document.xml
```

The report counts insertions, deletions, move pairs and format changes. Use `docx_kit.py xml` when you need to know exactly which words change.

## Accept or reject

```bash
"<python>" "<skill>/scripts/accept_tracked_changes.py" "<file.docx>" --mode accept --out "<file-accepted.docx>"
"<python>" "<skill>/scripts/accept_tracked_changes.py" "<file.docx>" --mode reject --out "<file-rejected.docx>"
```

Accept keeps inserted text and drops deleted text; reject does the reverse and restores `w:delText` as ordinary text. Format-only changes are discarded either way. `--keep_tracking_on` leaves `trackRevisions` enabled, so the next person's edits are also recorded.

## Before delivery

Rendered pages contain no markup, so a document can look finished while still carrying redlines. Always check `--mode report` on a file you are about to send, and accept or reject explicitly.

## Verify

After accepting, `docx_kit.py text` should show the new wording and no `w:ins`/`w:del` should remain in `word/document.xml`. Render and read the affected page.

## Pitfalls

- `w:del` contains `w:delText`, not `w:t`; a text extraction that only looks at `w:t` silently loses deletions.
- Tables, headers and footnotes can each carry their own tracked changes — the script covers every text part, but a hand edit in one part can miss another.
- Accepting a move pair (`w:moveFrom`/`w:moveTo`) as two unrelated edits duplicates content; the script treats them as a pair.
- Comments are not tracked changes. See `comments_manage.md`.
