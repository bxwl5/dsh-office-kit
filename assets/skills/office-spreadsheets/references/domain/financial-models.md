# Financial models

Applies to forecasts, budgets, cash-flow plans, and valuation work in any
industry.

- Periods run left to right with the scale in the header (Actual, Forecast,
  Budget). Do not mix a monthly column with a quarterly total in the same row
  without a labelled total column at the edge.
- Drivers first, results second: volume × price, headcount × cost, days × rate.
  A revenue row that jumps straight to a number cannot be reviewed.
- Units are stated once and kept: thousands vs millions in the same block is the
  classic reconciliation failure. Put the unit in the title, not in a footnote.
- Three statements or none: if the workbook includes a balance sheet and a cash
  flow, the balance sheet must balance and closing cash must equal the cash-flow
  ending balance. Add those as checks, not as comments.
- Working capital moves: receivables from revenue × DSO, payables from cost × DPO,
  inventory from COGS × days. Hard-coded changes in working capital break when the
  drivers move.
- Scenarios: one selector, one set of case inputs per driver, and an explicit
  `Case Selected:` on each output. A workbook with two switch cells reports two
  answers.
- Never hard-code a total that already exists as a sum, and never sum a column that
  already contains a total (double counting is silent).
- Sensitivity: one or two variables, closed-form or a small grid with the base case
  marked. A native What-If Data Table is a different object with its own limits —
  only build one when the user asks for it and the engine supports it.

## Checks a finance reader looks for first

| Check | Expected |
| --- | --- |
| Balance sheet balances | Assets − Liabilities − Equity = 0 |
| Cash ties | Closing cash on the balance sheet = cash-flow ending balance |
| Sum of segments | Segment revenue = consolidated revenue |
| Period total | Sum of monthly columns = annual total column |
| Case consistency | Every tab shows the same selected case |
| No hard-coded totals | Total cells are formulas |

Put them on a check tab, terminal and read-only, and make a failing check visually
obvious without painting passing checks green.
