# DOCX structure reference

## The package

```
[Content_Types].xml          extensions and per-part overrides
_rels/.rels                  package relationships (document, core props)
docProps/core.xml            author, title, subject, keywords, revision
docProps/app.xml             application, company, manager
word/document.xml            the body: paragraphs, tables, sections
word/styles.xml             paragraph/character/table style definitions
word/numbering.xml           abstract lists and their num instances
word/settings.xml            protection, tracking, updateFields
word/theme/theme1.xml        fonts and colour scheme
word/header1.xml, footer1.xml
word/media/*                 images
word/comments.xml, footnotes.xml, endnotes.xml   optional
```

## The body

`word/document.xml` is a sequence of block-level elements: `w:p` (paragraph), `w:tbl` (table), `w:sdt` (content control), and finally one `w:sectPr` per section (the last one sits in the body, earlier ones inside a paragraph's `pPr`).

A paragraph is:

```xml
<w:p>
  <w:pPr>                     <!-- paragraph properties -->
    <w:pStyle w:val="Heading1"/>
    <w:spacing w:before="240" w:after="80"/>
    <w:keepNext/>
    <w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>
    <w:jc w:val="center"/>
  </w:pPr>
  <w:r>                       <!-- run -->
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>   <!-- sz is half-points: 24 = 12pt -->
    <w:t xml:space="preserve">text</w:t>
  </w:r>
</w:p>
```

Everything a reader sees is a run inside a paragraph; everything that makes it look different from its style is direct formatting in `pPr`/`rPr`. Direct formatting is why `style_normalize.py` exists.

A table is `w:tbl` > `w:tblPr` (style, width, layout) + `w:tblGrid` (column widths) + `w:tr` > `w:tc` > `w:p`. A cell always contains at least one paragraph.

## Units

| Unit | Where | Conversion |
|---|---|---|
| twip (1/1440 in) | margins, widths, indents, cell widths | 1440 per inch |
| half-point | `w:sz` | 2 per point |
| eighth-point | border widths (`w:sz` on borders) | 8 per point |
| EMU (914400/in) | drawing extents | 914400 per inch |

A Letter page is 12240×15840 twips. Text width = page width − left − right margins (default 9360 twips with 1in margins).

## Styles

`w:style` with `w:type` of `paragraph`, `character`, `table` or `numbering`. Attributes: `w:styleId` (the internal name), `w:name` (the UI name), `w:basedOn`, `w:next`, `w:link`, plus `w:pPr`/`w:rPr`.

- `Normal` is the root; `Heading1`..`Heading9` drive the outline level and the TOC.
- Outline level can also be set explicitly with `w:outlineLvl` (0-based) in `pPr`; a paragraph can look like a heading without being one, and the TOC will not see it.
- Latent styles do not exist in the file until used; a document may reference `Heading3` while `styles.xml` has no definition for it.

## Numbering

`word/numbering.xml` holds `w:abstractNum` (the list definition, per level: format, text, indentation) and `w:num` (`w:numId` → `w:abstractNumId`, optionally overridden). A paragraph joins a list with `w:numPr` referencing a `numId`. Two paragraphs with the same `numId` share a counter.

## Sections

`w:sectPr` carries page size (`w:pgSz`), margins (`w:pgMar`), orientation (implied by width vs height, or `w:orient`), columns, and the header/footer references. A document with one section has one `sectPr`; a new section is a paragraph whose `pPr` contains the *previous* section's `sectPr`.

## Fields

Simple (`w:fldSimple`) and complex (`fldChar` begin/separate/end with `w:instrText`). The visible text is a cache. `w:updateFields` in `settings.xml` asks the editor to refresh on open. See `ooxml/hyperlinks_and_fields.md`.

## Revision markup

`w:ins`, `w:del` (with `w:delText`), `w:moveFrom`/`w:moveTo`, `w:rPrChange`/`w:pPrChange`, each with author and date. See `ooxml/tracked_changes.md`.

## Minimum valid package

`[Content_Types].xml`, `_rels/.rels`, `word/document.xml`, `word/_rels/document.xml.rels`. Word accepts a document without styles or settings; most libraries add them. When hand-building, write `[Content_Types].xml` first in the zip.
