# Accessibility

**Goal.** A document a screen reader can navigate: real headings, described images, tables with a header row, no fake emphasis carrying meaning.

The accessibility tree in Word comes from structure, not appearance. Bold text announces as bold; a `Heading 1` announces as a heading and appears in the navigation pane. Alt text lives in `wp:docPr @descr`.

## Audit

```bash
"<python>" "<skill>/scripts/a11y_audit.py" "<file.docx>" --out_json "<report.json>"
```

Checks: images without a description or title, tables without a repeating header row, heading levels that jump, empty headings, links whose text is only "click here" / "here" / "link", and a missing core title.

Exit code 1 means at least one finding; `--out_json` writes the same report for a larger pass.

## Fix the mechanical parts

```bash
"<python>" "<skill>/scripts/a11y_audit.py" "<file.docx>" \
  --fix_image_alt from_filename --fix_table_headers first_row \
  --out "<file-a11y.docx>"
```

Both fixes are honest placeholders: the file name as alt text is better than an empty description, and a header row that repeats across pages helps a reader who lands mid-table. Neither substitutes for real text.

## Fix the parts that need judgement

- **Alt text.** Describe what the reader would lose without the picture: "Bar chart: revenue by region, EMEA 4.1M ahead of APAC 3.2M." Decorative rules and dividers get an empty description.
- **Link text.** "Download the Q2 ledger" instead of "click here".
- **Reading order.** Decorative text boxes and floating images insert themselves at awkward places in the reading order; convert to inline if the flow matters.
- **Colour.** Meaning carried only by colour (red = bad) fails for a colour-blind reader; add a word.
- **Tables for layout.** A layout table announces as a data table. Restructure into paragraphs if the content is not tabular.

Long documents also want a TOC (`tasks/toc_workflow.md`), which is the screen-reader equivalent of the navigation pane, and language tags so a screen reader pronounces correctly.

## Verify

Re-run the audit to zero findings, then render and read the page: heading hierarchy visible, alt text is not visible (it is metadata), table header row distinct. If a screen reader is available, open the document and navigate by heading — that is the true test.

## Pitfalls

- Alt text on a decorative image is worse than none; an empty description plus `title` marks it decorative.
- A table header row is `w:tblHeader` on the row, not a bold first row.
- Images inside a table cell still need descriptions.
