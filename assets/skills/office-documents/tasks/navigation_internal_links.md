# Internal navigation

**Goal.** Let a reader jump around a long document — from a contents list to a section, and back — without relying on the TOC field being recalculated.

A hyperlink to a place inside the document is `w:hyperlink w:anchor="bookmark"`; the target is a `w:bookmarkStart`/`w:bookmarkEnd` pair with that name. Both live in the body, so an export to PDF keeps the links.

## Build a navigation set

```bash
"<python>" "<skill>/scripts/internal_nav.py" "<file.docx>" --out "<file-nav.docx>" --levels 1 2 \
  --toc_title "Contents"
```

What it does, in order:

1. Bookmarks every heading as `nav_h1`, `nav_h2`, … using its outline level.
2. Inserts a `Contents` heading and a quick-link bar (one link per heading) at the top.
3. Indents each contents entry by 360 twips per level so the hierarchy is visible.
4. Appends a small `Back to contents` link after each heading.
5. Bookmarks the top, the contents list and the bottom (`nav_top`, `nav_toc`, `nav_bottom`).

Flags: `--no_quicklinks` skips the horizontal bar, `--no_back_to_toc` skips the per-heading back link, `--no_top_bottom` skips the two edge targets.

The script reports `missing` when a link target could not be created — read that list, because a link without a bookmark is dead in Word and looks fine in a render.

## Static versus field-driven

`internal_nav.py` writes literal entries: it costs a rebuild when headings change, and it always looks the same in every renderer. `insert_toc.py` writes a live `TOC` field: it updates itself but needs a recalculation before it shows anything useful. A document that will be edited repeatedly wants the field; a document going out as a PDF export wants the static list.

## Verify

Render, then click through the pages you can see: entry indentation, that the contents heading is styled as a heading, and that `Back to contents` did not push a paragraph onto a new page. Dead anchors do not show in a screenshot — check `bookmarkStart` names against the `w:anchor` values when the script reports a miss.

## Pitfalls

- Bookmarks must be unique per document; re-running the script on its own output creates `nav_h1` twice, so start from the original.
- A hyperlink anchor is case-sensitive.
- Link styling comes from the `Hyperlink` character style; if links look like body text, the style is missing, not the link.
