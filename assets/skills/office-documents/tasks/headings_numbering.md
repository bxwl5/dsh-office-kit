# Headings and numbering

**Goal.** A single outline a reader can follow and Word can turn into a TOC: no skipped levels, no headings faked with bold text, consistent spacing.

Heading level comes from the paragraph style (`Heading 1`…`Heading 9`, `Title` uses outline level 0), not from size or weight. `heading_audit.py` reads that structure and flags the common breakages.

## Audit

```bash
"<python>" "<skill>/scripts/heading_audit.py" "<file.docx>" --max_findings 20
```

Findings:

- `skipped_level` — a level 3 heading directly under a level 1. Fix by inserting the missing level or by promoting the deeper heading.
- `empty_heading` — a heading with no text; a stale outline entry that will appear in the TOC as a blank line.
- `manual_formatting` — a real heading that also carries direct bold or a large font size; the style already does that, so the extra formatting fights restyling.
- `heading_not_styled` — body text that looks like a heading (bold, 13pt+) but is styled `Normal`. This is the expensive one: the TOC misses it and every later style change misses it.

## Fix

Prefer styles over direct formatting. `style_normalize.py --clear_paragraph_format --enforce_heading_spacing` strips direct run formatting and sets standard space-before/after on headings:

```bash
"<python>" "<skill>/scripts/style_normalize.py" "<file.docx>" --out "<file-fixed.docx>" --clear_paragraph_format --enforce_heading_spacing
```

For a heading that is only bold text, promote it to the right style rather than making it bolder:

```bash
"<python>" - <<'PY'
from docx import Document
d = Document(r"<file.docx>")
for p in d.paragraphs:
    if p.text.strip() == "<exact heading text>":
        p.style = d.styles["Heading 1"]
d.save(r"<file-fixed.docx>")
PY
```

## Numbered headings

Numbering is a numbering definition attached to the heading style, not text like `1.2`. Two consequences: a typed number keeps lying after an insert, and a numbered outline needs `numPr` on the style with an `abstractNum` that uses `%1.%2` level text. When a document must have numbered sections and the original numbering is lost, restore the style's `numPr` rather than typing numbers into the headings.

Lists are the same machinery at body level: `List Number` restarts only when the numbering definition says so, which is why two separate numbered lists sometimes continue each other.

## Verify

`heading_audit.py` should exit 0, then render and read the page: heading hierarchy visible, no orphaned heading at the bottom of a page (`keepNext`), and the same spacing before every heading of a level.

## Pitfalls

- Changing a heading's style does not change its text, but it can change its size and colour — re-render.
- A heading inside a table cell still counts for the outline, which is rarely wanted; use a bold paragraph there.
- Copying a heading from another document brings a direct-formatting payload with it; run the audit afterwards.
