# Valuation & Exit Planning Dashboard

A static, single-page dashboard for tracking a stock's valuation and planning a
mechanical exit. Default company is **AMD**; switchable to other semiconductor
names (NVDA, AVGO, MRVL, INTC, QCOM, MU) — and any of the fields can be
repurposed for another company entirely.

Fully offline: no network calls, no CDN, no build step. Open `index.html` in a
browser or host it on GitHub Pages. All entries persist in the browser's
`localStorage`, per ticker.

## How the math works

Core engine in `stock-math.js` (ported 1:1 from a Gemini-Pro-authored
TypeScript module; see `../goals/amd-valuation-exit-planning-dashboard/hidden_files/stock-math.ts`):

- **DCF** — 5-year explicit FCF projection, Gordon-growth terminal value, discounted at WACC. Throws if WACC ≤ terminal growth or shares ≤ 0.
- **Scenario FCF** — `FCF = EBIT·(1−tax) − capex − ΔWC`, with EBIT from a revenue-CAGR path and linearly interpolated gross/op-margin paths.
- **Sensitivity grid** — per-share fair value over a WACC × terminal-growth matrix; invalid cells render as n/a.
- **Trailing stop** — stop = peak × (1 − trail%); breached when the latest price is at/below the stop.
- **RSI** — Wilder's 14-period smoothing; returns 100 when average loss is 0.
- **Z-score** — population std-dev of your entered history; flags beyond ±2σ.
- **Exit tiers** — trigger prices from cost basis × (1 + return%); trims are percentages of the *original* position; errors if total trims exceed 100%.
- **Multiples-implied value** — metric × target multiple, minus net debt for EV-based metrics, divided by shares.

### Default assumptions (from the research brief, Gemini Pro, 2026-09-27)

- Bull: 25% revenue CAGR, gross margin 58→60%, op margin 30→35%, buybacks −1.5%/yr
- Base: 14% revenue CAGR, gross margin 54→56%, op margin 28→32%, flat share count
- Bear: 6% revenue CAGR, gross margin 50→52%, op margin 24→20%, +1%/yr dilution
- WACC default 9.5% (brief range 8.5–10.5%), terminal growth 3.5% (range 3–4%)
- Peer forward-P/E bands: NVDA 35–45, AMD 30–45, AVGO 20–30, MRVL 30–45, QCOM 15–20, INTC 10–20
- Exit defaults: trim 15% at +30%, 15% at +50%; trailing stop 15–20%

All assumptions are editable in the UI. The brief's Canadian capital-gains
inclusion-rate claim (66.67% above $250K) is marked **UNVERIFIED** in the app —
that federal proposal was reversed; confirm current rules with a tax
professional.

## How to use

1. **Company** — pick a ticker; fill in price, EPS, EBITDA, revenue, shares, net debt. AMD ships with price $630.63 (2026-09-27) and FY2024 revenue $25.8B; everything else is yours to enter.
2. **Multiples** — forward P/E, EV/EBITDA, EV/Sales, PEG auto-compute; compare against editable peer bands; paste a multiple history to get a z-score.
3. **DCF** — pick bull/base/bear, adjust margins and WACC/terminal-growth sliders, read the fair value and the sensitivity grid (green = ≥10% above current price).
4. **Exit plan** — enter cost basis + shares, set trim tiers, get trigger prices and proceeds; enter a price history and trail % for the stop level.
5. **Thesis risks** — check a box when an invalidation risk starts materializing; the app nudges you to re-run the bear case.
6. **Tax notes** — Canadian-specific reminders (ACB in CAD, RRSP vs TFSA withholding).

## Extending to other companies

- Press any ticker button, or reuse one for a different company — every field (bands, scenarios, tiers) is stored per ticker.
- Units are fixed: money in $B (revenue, EBITDA, net debt), shares in billions, margins/rates in %.
- For non-semis, edit the peer bands and the risk checklist wording is generic enough; margin paths in the DCF accept any start→end values.

## Data sources

- Research brief: `research_notes/amd-dashboard-2026-09-27/report.md` (Gemini Pro; segment mix is FY2024-era).
- AMD price $630.63: Yahoo Finance chart API, 2026-09-27. Update it yourself — the app fetches nothing.

## Disclaimer

Educational and organizational tool only — **not investment advice**. DCF outputs
are only as good as the assumptions typed in. Verify every figure against
primary sources (company filings, reputable data providers) before making
decisions. Consult a licensed professional for investment and tax decisions.
