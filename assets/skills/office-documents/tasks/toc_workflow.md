# Table of contents

**Goal.** Put a navigable contents list at the front of the document, built from heading styles rather than typed by hand.

The TOC is a `TOC` field. Word fills it in when it recalculates; the file stores the last result. A hand-typed list looks identical in a screenshot and then goes wrong on the first edit.

## Insert

```bash
"<python>" "<skill>/scripts/insert_toc.py" "<file.docx>" --out "<file-toc.docx>" --levels 1-3
```

The script looks for a placeholder paragraph containing `[[TOC]]` (override with `--placeholder`). If there is none it inserts the field at the start of the body. It writes `TOC \o "1-3" \h \z \u`, sets `w:updateFields`, and adds a short cached hint so the page is not blank before recalculation.

Check that every heading you want in the list uses a heading style: `heading_audit.py` finds headings formatted by hand, which the TOC will silently skip.

## Rebuild after edits

If headings changed, the cached list is stale. Either ask the user to update the field in Word (right-click → Update Field), or regenerate: strip the old field with `fields_materialize.py`? — no, that freezes it. Instead delete the field paragraphs and run `insert_toc.py` again. Freezing a TOC is almost never what a reader wants.

## Static contents list

Sometimes the requirement really is a fixed list — a PDF export that will not be recalculated, or a template with a hand-built contents page. `internal_nav.py` builds one: a heading plus hyperlink entries to every heading, with optional back-links.

```bash
"<python>" "<skill>/scripts/internal_nav.py" "<file.docx>" --out "<file-nav.docx>" --levels 1 2
```

See `tasks/navigation_internal_links.md`.

## Verify

Render the first pages and read them. A TOC that shows one line of grey hint text means the field never recalculated in that renderer; a TOC that shows the old headings means the document was rendered before the field updated. Say which one happened instead of claiming the TOC is correct.

## Pitfalls

- TOC entries come from outline levels, not from text that merely looks like a heading.
- A TOC inside a header or a text box does not work; it belongs in the body.
- Level 4+ headings are excluded unless you widen `--levels`.
