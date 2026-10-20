# Styles: lint and normalize

**Goal.** Formatting that comes from styles, not from pressing bold on each run, so the document can be restyled, exported and understood later.

A paragraph carries a `pStyle` reference; a run carries an `rStyle` plus direct formatting (`w:b`, `w:i`, `w:sz`, `w:color`). Direct formatting wins over the style, which is why a "make all body text 11pt" request fails on the runs someone bolded and resized by hand.

## Lint

```bash
"<python>" "<skill>/scripts/style_lint.py" "<file.docx>" --json "<report.json>"
```

Findings: undefined style references, headings carrying their own paragraph or run formatting, empty runs, manual bullets (`•` typed into text instead of a list style), double spaces, trailing spaces, body sizes that appear once or twice against the dominant size, tables without a style.

Exit code 1 means findings; the JSON has the counts and examples, which is what you want when the number is large.

## Normalize

```bash
"<python>" "<skill>/scripts/style_normalize.py" "<file.docx>" --out "<file-clean.docx>" \
  --clear_paragraph_format --enforce_heading_spacing
```

- `--clear_paragraph_format` strips everything from each run's `rPr` except `rStyle`, `rtl` and `lang`, and drops the paragraph-mark run properties. The style then controls the look.
- `--enforce_heading_spacing` sets space-before/space-after per heading level and `keepNext`, so a heading cannot sit alone at the bottom of a page.

Run this before applying a template; a template cannot win against direct formatting.

## What "correct" looks like

- Body text 11–12pt from `Normal`; headings from `Heading 1`–`Heading 3` with no direct bold or size.
- Bold used for emphasis inside a sentence, via a character style or a single `w:b` run — not for whole paragraphs that are really headings.
- Lists from `List Bullet` / `List Number`, never typed bullet characters.
- One table style per document, usually `Table Grid`.

## Verify

Re-run `style_lint.py` (counts should drop), then render: clearing direct formatting can change the visual hierarchy when a document faked emphasis with size. Compare the rendered page with the original before you claim the clean-up is neutral.

## Pitfalls

- Clearing `rPr` removes field-result formatting too; re-run the field-related scripts afterwards if the number must be bold.
- A style referenced but not defined falls back to `Normal` silently — the lint is the only warning you get.
- `w:rsid` and proofing attributes are noise, not style; `privacy_scrub.py` removes them when the file leaves the organisation.
