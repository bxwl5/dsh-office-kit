# Marketing and advertising

Campaign, funnel, lead, CRM and ad-performance data. The failures here are almost always
grain, denominator or freshness — not arithmetic.

## Know what the export is

- **Extract freshness vs analysis time.** An export pulled Tuesday and analysed Friday is
  Tuesday's data. Record the extract date and the as-of date once, in the input area, and
  do not compare a Friday figure with a Tuesday one as if the difference were performance.
- **Channel setup.** A campaign may be split across an ad platform, a CRM and a billing
  system. Name which one each figure comes from before combining them.
- **Grain.** Daily rows are not campaign rows. Impressions are not sessions; clicks are not
  leads; leads are not qualified leads; a pipeline total is not revenue.
- **Denominators.** CTR uses impressions, CVR uses sessions or clicks depending on the
  platform's definition, CPA uses conversions attributed that period. Carry the platform's
  definition into the label; two vendors' "conversion rate" differ.

## Layout

- Name tabs by content and period: `Leads_Q1_2025`, `Pipeline Analysis`, `ROI Dashboard`.
- Keep the raw import intact on its own sheet; clean in derived columns or a prepared
  area, and record what you excluded or mapped (non-target region, test account,
  renamed source) so the exclusion is visible.
- One typed time-series date column with one format. Add an ISO helper column only when a
  downstream import needs it, and label it as such.
- Targets and traffic lights only when the source supplies a target and a direction. No
  invented targets, no green/amber/red on numbers nobody set a goal for.
- Every dashboard figure traces back to a cell in the prepared data. If a number cannot be
  traced, it does not go on the dashboard.

## Metrics

- Define abbreviations where they are used (CPC, CPM, CPA, ROAS, MQL) — a legend on the
  analysis sheet, not a glossary tab nobody opens.
- Keep the comparison basis visible: week over week, month over month, or the same period
  last year. Mixing bases across one chart is the most common misleading dashboard.
- Attribution: say which model (last click, first click, linear, platform-reported) and
  keep it consistent within a table. Platform-reported and analytics-reported conversions
  never reconcile exactly; report both rather than forcing a match.
- Charts only when they make a trend, a comparison or a funnel clearer than a table. A
  chart of six categories is a table with extra steps.

## Doing it live

- Read first: `info` (which sheets, which used ranges, whether the user is mid-edit) then
  `read_range --formulas` across the block you will extend.
- Append new periods as rows below the existing table and extend the table/conditional
  formatting/chart source with it. Do not create a second table beside the first.
- When a figure must be flagged for refresh (stale extract, missing platform), use the
  amber input fill and a note in the cell beside it, not a colour nobody explained.
- Verify with `read_range --formulas`: this is where a misaligned denominator shows up as a
  rate that is off by a factor of ten.
