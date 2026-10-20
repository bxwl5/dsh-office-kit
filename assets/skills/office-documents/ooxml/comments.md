# Comments in the package

A comment is three pieces that must agree: `word/comments.xml` holds the content, `word/document.xml` holds a range marking which text is discussed, and the relationship plus content-type override make the part exist at all.

## The markup

```xml
<w:commentRangeStart w:id="1"/>
<w:r><w:t>the sentence under discussion</w:t></w:r>
<w:commentRangeEnd w:id="1"/>
<w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
  <w:commentReference w:id="1"/></w:r>
```

```xml
<w:comment w:id="1" w:author="Reviewer" w:date="2026-10-21T00:00:00Z" w:initials="R">
  <w:p><w:r><w:t>Please double-check this number.</w:t></w:r></w:p>
</w:comment>
```

Rules that matter in practice:

- `w:id` must be unique across comments **and** match in all three places. A range start without an end leaves Word showing a comment with no anchor; an end without a start can make the file refuse to open.
- The comment reference run belongs at the end of the range, not somewhere else in the paragraph.
- `word/comments.xml` needs an override in `[Content_Types].xml` and a relationship from `word/document.xml`; without both, the part is ignored or the file is corrupt.
- The file's root has `mc:Ignorable` listing `w14`/`w15` etc.; a `w15:done` attribute (the "resolved" flag) is only legal when those namespaces are declared.

## Resolved versus deleted

`w15:done="1"` on the `w:comment` keeps the comment in the file and shows it as resolved. Removing the comment is a different operation: delete the `w:comment`, both range markers and the reference run. Resolving hides it from the default pane; it does not remove the text from the file.

## Where comments hide

- Replies are comments too, linked by `w15:paraIdParent`; a strip that removes the parent leaves an orphan.
- Anchors can sit in headers, footnotes and text boxes as well as the body.
- A comment deleted in Word leaves no trace; a comment whose range was deleted may remain in `comments.xml` with nothing anchoring it. That is why extraction reports anchors: a comment with empty anchored text is evidence of drift.

## Working from the scripts

`comments_extract.py` reads the pairing and prints anchored text per comment; `comments_add.py` writes all three pieces; `comments_apply_patch.py` edits content and the resolved flag; `comments_strip.py` removes every trace and the part itself. Use `docx_kit.py xml '<file.docx>' word/comments.xml` when you need to see the raw part.
