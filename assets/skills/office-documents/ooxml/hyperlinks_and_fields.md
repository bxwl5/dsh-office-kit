# Hyperlinks and fields

A hyperlink and a field are both "a run that looks like text but is a pointer", and both break in the same way: the visible result is cached, so editing the text does not update anything.

## Hyperlinks

```xml
<w:hyperlink r:id="rId7">
  <w:r><w:rPr><w:rStyle w:val="Hyperlink"/></w:rPr><w:t>the report</w:t></w:r>
</w:hyperlink>
```

- The target is a relationship in `word/_rels/document.xml.rels` with `TargetMode="External"` for a URL, or a bare relative path for a file inside the package.
- An internal link uses `w:anchor="bookmarkName"` and no relationship at all.
- `w:hyperlink` is a wrapper around runs; a link that spans paragraphs is not legal — put one link per paragraph.

A link whose relationship is missing renders as blue underlined text that goes nowhere. That is also what a copy-paste between documents produces.

## Simple fields

```xml
<w:fldSimple w:instr=" REF tbl1 \h ">
  <w:r><w:t>Table 1</w:t></w:r>
</w:fldSimple>
```

The `w:t` inside is a cache, not the truth. Change the text and the next field update overwrites it.

## Complex fields

```xml
<w:r><w:fldChar w:fldCharType="begin"/></w:r>
<w:r><w:instrText xml:space="preserve"> TOC \o "1-3" \h \z \u </w:instrText></w:r>
<w:r><w:fldChar w:fldCharType="separate"/></w:r>
<w:r><w:t>Cached entries go here</w:t></w:r>
<w:r><w:fldChar w:fldCharType="end"/></w:r>
```

The begin/instrText/separate/result/end sequence must stay in that order inside one paragraph. Word shows the result between `separate` and `end`, or recomputes on open when `w:updateFields` is set in `settings.xml`:

```xml
<w:updateFields w:val="true"/>
```

Setting it makes Word prompt or update on open. A viewer that ignores it (a PDF export, some libraries) keeps showing the cache — which is why a document delivered as PDF can show "1" for every page number.

## Which field for which job

| Need | Instruction |
|---|---|
| Page number | `PAGE` / `NUMPAGES` |
| Table or figure number | `SEQ Table \* ARABIC` |
| Reference to a number | `REF tbl1 \h` |
| Table of contents | `TOC \o "1-3" \h \z \u` |
| Document title from properties | `TITLE` / `AUTHOR` |

## Editing fields safely

- To freeze a result, replace the whole field span with a plain run (`fields_materialize.py`, `flatten_ref_fields.py`).
- To renumber, update the cached result and leave the instruction alone; do not delete the begin/end markers.
- `w:instrText` is where the instruction lives — a search-and-replace over `w:t` will not find `TOC`.
- Bookmarks referenced by `REF` must exist (`w:bookmarkStart`/`w:bookmarkEnd` with matching `w:id`); a missing bookmark shows "Error! Reference source not found."

## See also

`tasks/fields_update.md`, `tasks/toc_workflow.md`, `tasks/captions_crossrefs.md`, and `ooxml/rels_and_content_types.md` for the relationship side.
