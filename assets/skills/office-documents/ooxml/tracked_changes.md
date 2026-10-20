# Tracked changes

Tracked changes are markup, not a diff. The file contains both the old and the new text, wrapped in elements that say which is which, plus enough metadata for Word to show reviewer names and accept or reject each edit.

## The elements

| Element | Meaning |
|---|---|
| `w:ins` | Text inserted (contains runs) |
| `w:del` | Text deleted (contains runs whose text is `w:delText`) |
| `w:moveFrom` / `w:moveTo` | Moved text, paired by `w:name` |
| `w:rPrChange` / `w:pPrChange` | Formatting change, with the previous properties inside |
| `w:delText` | The deleted characters — not `w:t` |
| `w:delInstrText` | A deleted field instruction |

Each carries `w:id`, `w:author`, `w:date`. Ids must be unique within the document; reusing one makes Word show the wrong reviewer.

A deletion is a `w:del` containing runs with `w:delText`, not a run with a strikethrough:

```xml
<w:del w:id="101" w:author="dsh-office" w:date="2026-10-21T00:00:00Z">
  <w:r><w:delText>Revenue grew</w:delText></w:r>
</w:del>
<w:ins w:id="102" w:author="dsh-office" w:date="2026-10-21T00:00:00Z">
  <w:r><w:t>Revenue climbed</w:t></w:r>
</w:ins>
```

## Tracking has to be on

`<w:trackRevisions/>` in `word/settings.xml` makes *Word* track subsequent edits. It does not affect markup already in the file. Write the markup directly when you are generating the change; turn tracking on when the user will continue editing.

## Accepting and rejecting

- **Accept** — keep `w:ins` content and unwrap it; delete `w:del` entirely; for moves keep `w:moveTo`.
- **Reject** — delete `w:ins` content; keep `w:del` content and convert `w:delText` back to `w:t` (unwrap the `w:del`).
- Either way, remove the revision containers afterwards; leaving an empty `w:ins` shows a stray marker.
- Format-change elements have no accept/reject choice in the content sense: accepted means the new properties stay, rejected means the old ones are restored.

## Where tracking hides

- Inside headers, footers, footnotes, endnotes, table cells, text boxes.
- Table-level changes: `w:trPr/w:ins` for an inserted row, `w:tcPr/w:cellIns` for a cell.
- Paragraph-level: a paragraph mark inserted or deleted uses `w:rPr/w:ins` in `w:pPr`, so "delete this paragraph" is not a `w:del` around the paragraph.
- Comments are separate markup; a comment can survive its being accepted.

## Reading markup without a renderer

```bash
"<python>" "<skill>/scripts/accept_tracked_changes.py" "<file.docx>" --mode report
```

The report lists insertions and deletions with authors and the text on each side. That is the honest way to answer "what changed" when there is no rendered view, and it is also how you confirm a generated change landed as markup rather than as plain text.
