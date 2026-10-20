# Comments

**Goal.** Add a review comment, read the comments someone else left, reply or resolve them, and remove comments before the document goes out.

Comments are not text: each one is a `w:comment` in `word/comments.xml`, anchored in the body by a `w:commentRangeStart` / `w:commentRangeEnd` pair plus a `w:commentReference` run. Editing the anchor without the comments part (or the reverse) leaves a document Word reports as corrupt.

## Add

```bash
"<python>" "<skill>/scripts/comments_add.py" "<file.docx>" --out "<file-commented.docx>" \
  --author "Review" --add "Renewals=Check the source of this claim" --add "42 new accounts=Who verified this?"
```

Each `--add` is `NEEDLE=COMMENT`. The needle is matched inside a paragraph; the anchored range covers exactly the matched text, so pick a distinctive phrase. `--ignore_case` relaxes matching, `--require_all` writes nothing and exits 1 if any needle is missing — use it when the comment set must be complete.

## Extract

```bash
"<python>" "<skill>/scripts/comments_extract.py" "<file.docx>" --out "<comments.json>"
```

Returns `id`, `author`, `initials`, `date`, `text`, `anchored_text`, `part` and `resolved`. An empty array means the file has no comments — do not assume comments exist because the user mentioned them.

## Patch or resolve

```bash
"<python>" "<skill>/scripts/comments_apply_patch.py" "<file.docx>" "<patch.json>" --out "<file-patched.docx>"
```

```json
{
  "ops": [
    { "id": 1, "append": "Confirmed against the ledger." },
    { "id": 2, "replace": "Resolved: revenue restated in Q3." },
    { "id": 1, "resolved": true }
  ]
}
```

`replace` rewrites the comment's first paragraph, `append` adds a paragraph, `resolved` sets the `w15:done` flag. The command exits 1 and names the ids it could not find.

## Remove

```bash
"<python>" "<skill>/scripts/comments_strip.py" "<file.docx>" --out "<file-clean.docx>"
```

Removes every anchor, drops `word/comments.xml`, its relationship and content-type override. Removing comments is required before sharing a file with a customer; check `privacy_scrub_metadata.md` too.

## Verify

`comments_extract.py` on the output (count and anchors), then render the page the comment sat on — a stripped anchor that leaves an empty run can show as a stray space.

## Pitfalls

- A comment anchored to a paragraph mark rather than text shows no `anchored_text`; that is normal for "comment on the whole paragraph".
- Two comments cannot share an id. `comments_add.py` continues from the highest existing id.
- The comment body is ordinary paragraphs, so a long comment can contain several; `comments_extract.py` joins them with newlines.
- Replying in-thread needs Word's `commentsExtended` part. Anchoring a new comment on the same phrase is the portable equivalent.
