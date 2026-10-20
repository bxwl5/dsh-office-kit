# Financial models

Financial modelling has a short list of distinctions that decide whether a sheet is
right, and a live edit makes each of them visible to a user who is watching.

## The distinctions that matter

| Looks similar | Actually different |
| --- | --- |
| Revenue (earned) | Collections (cash received) — timing, bad debt, deferred revenue |
| Payroll expense | Cash paid to employees — accruals, timing, employer costs |
| Capex | Depreciation / amortisation — cash out once, expense over life |
| Earnings | Cash flow — working capital, non-cash items, financing |
| Budget | Forecast — one is a target, the other an expectation; never mix them silently |

Also, before typing a number: which fiscal calendar, which horizon (monthly / quarterly /
annual), and which grain (total company, segment, product)? A number without those three
is not a model input.

Actuals and forecast must be visibly different (a divide, a label, a different fill). The
reader has to know where history stops.

## Schedules

Build a driver schedule per line, then a statement, then the output. Each step is a range
the user can audit:

- **Revenue**: volume × price, with mix if there are segments; recognition timing if
  contracts span periods. Do not model revenue as a straight growth percentage unless the
  user asked for that — it hides the drivers.
- **Payroll**: headcount, FTE and paid FTE are three different numbers. Prorate hires and
  exits by month; do not divide an annual salary by 12 twice (an annual figure already
  contains the monthly rate); make the commission and employer-cost basis explicit.
- **Opex**: units × rate, fixed amounts, or one-time costs — say which. A growing opex line
  needs a driver, not a percent of revenue, unless that is the stated policy.
- **D&A**: cost, residual value, in-service date, useful life, convention. Reconcile gross
  asset and accumulated depreciation roll-forwards to the prior period.
- **Statements**: retained earnings rolls from opening + net income − dividends; the
  cash-flow statement's ending cash equals the balance sheet's cash. If it does not, there
  is a plug, and a plug is a finding, not a fix.

A worked unit check, done in the cells: actual salary cost $60,000 across 10 paid FTE is
$6,000 per FTE; a forecast of $6,300 per FTE on 11 FTE gives $69,300 against $66,000 for
the prior per-FTE rate — the difference is rate *and* headcount, and both drivers belong
on separate rows. If either missing pay or zero FTE is in the source, the implied rate
cannot be established; mark it unavailable, do not divide by zero and call it 0.

## Refreshes and merges

A refresh merges complete periods on the business key (a date that exists in the calendar,
a product code that exists in the master). Never append a partial period as if it were
complete, and never let a merge drop a dimension silently — report rows that did not match.

## Variances and audit

- Variances need an amount **and** a percent. When the base is zero or missing, the percent
  is unavailable — write `n.a.`, not `0%`.
- Check totals: parts sum to the whole, schedules tie to statements, the bridge closes to
  zero. Compare to two decimals, including `0.00`; a check that passes at 0.01 is not
  passing.
- Failed checks: light red fill (`#FFC7CE`) with bold red text (`#9C0006`), neutral for
  passes. Missing or untested data is "unavailable", never "PASS".

## Valuation, if it comes up

- Build the method the user asked for. A DCF needs drivers, tax, D&A, capex, working
  capital, unlevered free cash flow, the discounting convention, a terminal value method
  and the enterprise-to-equity bridge — skipping two of these is not a shortcut, it is a
  wrong answer.
- IRR/XIRR need cash flows with valid signs and dates; a series with no sign change has no
  IRR, and the function returning `#NUM!` is the correct answer to report.
- Sensitivities the user asks for belong in a native what-if data table, not in a grid of
  hand-typed scenarios that will drift.

## Doing it live

- Read the workbook before you model: `info` for tabs and objects, then
  `read_range --formulas` across the rows you are extending. Match the existing anchoring
  (`$C$4` for a rate, `C$9` for a period header) and the existing aggregation style
  (`SUMIFS` over hand-rolled sums).
- Add one driver row at a time, each with a formula you can point at, and verify after each
  block; a 200-cell scenario grid written blind is the expensive way to fail.
- If the model has a check tab, extend the checks to cover your new rows. If it has none
  and the model is small, add one labelled verification row next to the output.
- Never write a hard-coded total when a formula can tie it. And never "fix" an existing
  `#REF!` — report it.
