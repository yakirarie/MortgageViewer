# Mashkanta Decision Engine — Product & Design Specification (PRD)

Version: 1.0
Document type: Implementation-ready PRD for a single-developer / AI-assisted build
Target stack: Streamlit (reference implementation), portable to React or FastHTML
Author role: Lead Fintech PM / Principal UI-UX Architect

## 0. How to Use This Document

Every section below is written to be implementable without further clarification. Where a value is a judgment call (colors, default penalty %), a sensible default is given — treat these as configuration constants, not hardcoded literals, so they can be tuned later. Tables marked Component Spec are meant to map directly to code (a form field, a function signature, a UI component).

## 1. Executive Summary & Core UX Principles

### 1.1 System Purpose

A single-user, manually-driven decision-support tool for Israeli mortgage holders (mashkanta). The user re-creates their real mortgage — track by track — inside the app, then uses three simulation engines to answer three concrete financial questions:

- "Should I pay off part of my mortgage early, or invest that cash instead?"
- "Is the refinancing offer my bank/broker gave me actually worth it, and when do I break even?"
- "Given my current tracks and penalty structure, what should I do — and when?"

The tool does not connect to any bank API and does not store data server-side by default. It is a calculator with memory, not a live account viewer.

### 1.2 Target Audience

Israeli homeowners with an active mashkanta, typically 2–6 tracks, who received (or want to model) an early-payoff or refinancing scenario.

Comfortable reading a Hebrew-inflected banking vocabulary (Prime, Klatz, Mirzur, Amlat Pirachon) but not necessarily fluent in mortgage math.

Not necessarily technical — this is a consumer-facing tool, not a developer tool, despite the technical build.

### 1.3 Core UX Principles

| Principle | What it means in this product |
|-----------|-------------------------------|
| Privacy by default | All data lives in client-side state (st.session_state in Streamlit, browser memory/localStorage in React/FastHTML) unless the user explicitly exports/saves a JSON file. No mortgage numbers ever leave the browser without an explicit user action. |
| Scannability at a glance | The top of every view answers "am I OK?" in under 3 seconds: KPI cards before charts, charts before tables, tables before raw numbers. |
| High-density, low-noise visualization | Prefer stacked/grouped bars and single-line breakeven charts over decorative visuals. Every chart must answer one specific question stated in its title. |
| Instant feedback loop | Every simulator input (slider, number field) recalculates and re-renders on change with no "Calculate" button required, unless the calculation is expensive (not the case here — all math is closed-form, no Monte Carlo needed for v1). |
| Progressive disclosure | Advanced fields (manual monthly payment override, custom penalty override) are collapsed behind an "Advanced" expander per track, not shown by default. |
| Forgiving data entry | Nothing the user enters can crash a calculation. Missing/zero values degrade gracefully (see §2.2 validation table) rather than throwing errors. |

### 1.4 Non-Goals (v1)

No multi-user auth, no bank-grade encryption, no real BOI API integration.

No amortization-schedule-level day-count precision (monthly granularity is the contract for v1).

No mobile-first layout requirement — desktop/tablet-first, responsively degradable.

## 2. Profile & Manual Data Input System (Core Focus)

### 2.1 Track Form Architecture

A Track is the atomic data unit of the app. A Profile is an ordered list of 1–8 Tracks plus profile-level metadata (profile name, creation date, currency — fixed to ₪).

Interaction model:

- Tracks are managed in a dedicated Profile Manager panel — a modal (React/FastHTML) or an st.expander/dedicated page (Streamlit) — reachable from a persistent "Manage Tracks" button in the header.
- Each track renders as a collapsible card in an ordered list (drag-to-reorder is nice-to-have, not required for v1; up/down arrow buttons are sufficient).
- Card header (always visible, collapsed state): Track name badge (colored by type), balance, rate, term-remaining — i.e. enough to identify the track without expanding.
- Card body (expanded state): full field form (§2.2).
- Actions per card: Edit (expand in place), Duplicate (clone with "(copy)" suffix — useful for splitting a track), Delete (with a confirm step — a second click on a "Confirm delete" state, not a blocking modal).
- Global action: + Add Track button at the bottom of the list, opens a new card pre-selected to the most common type (Prime) with empty numeric fields.
- Hard cap: 8 tracks (real Israeli mortgages rarely exceed 6; 8 gives headroom without breaking layout). Show a disabled "+Add Track" with a tooltip once reached.

### 2.2 Field Definitions & Validation Rules per Track

**Component Spec — Track Form Fields**

| # | Field | Type | Widget | Default | Validation | Notes |
|---|-------|------|--------|---------|------------|-------|
| 1 | track_id | string (UUID, hidden) | — | auto-generated | n/a | Internal key, never shown to user |
| 2 | custom_name | string | text input | "Track {n}" | 1–40 chars, non-empty | e.g. "Prime", "Fixed Unlinked", "Variable 5Y #2" |
| 3 | track_type | enum | select dropdown | PRIME | must be one of enum (§2.2.1) | Drives default rate range, reset-window visibility, and color coding |
| 4 | principal_balance | number (₪) | number input | 0 | >= 0, warn if 0 ("this track has no balance — did you mean to delete it?") | Currency-formatted with thousands separator on blur |
| 5 | annual_interest_rate | number (%) | number input, step 0.01 | type-dependent default (§2.2.1) | 0 <= x <= 15; soft-warn above 8% ("unusually high — double check") | Stored as decimal internally (rate/100) |
| 6 | remaining_term_months | integer | number input, or toggle to enter as years | 240 (20y) | 1 <= x <= 360 | UI toggle: "months" / "years" both write to the same underlying months field |
| 7 | monthly_repayment | number (₪) | number input, with "Auto-calculate" button/toggle | computed via Spitzer formula (§4.1) unless overridden | >= 0; if 0 and balance > 0, auto-fill from Spitzer calc | Manual override persists until user clicks "Recalculate" |
| 8 | is_payment_manual_override | boolean (hidden) | — | false | n/a | Set to true the moment user edits field 7 directly |
| 9 | early_exit_penalty | number (₪) | number input, with "Estimate" helper link | 0 | >= 0 | This is Amlat Pirachon — see §2.2.2 for the estimation helper behavior |
| 10 | notice_fee | number (₪) | number input, auto-computed, editable | 0.15% × principal_balance | >= 0 | Auto-recalculates when balance changes, unless user has manually edited it (same override pattern as field 7) |
| 11 | months_to_reset | integer or null | number input, only visible if track_type requires a reset window | null for Fixed types; 60 for Variable 5Y; 1 for Prime (resets monthly, effectively N/A — see note) | 0 <= x <= remaining_term_months | Hidden entirely for FIXED_UNLINKED and FIXED_LINKED (they never reset) |
| 12 | is_cpi_linked | boolean | checkbox/toggle | type-dependent (§2.2.1) | n/a | Drives the CPI-adjustment disclaimer badge in diagnostics (v1 does not simulate CPI drift numerically — see §2.2.3) |

**Field-level UX notes:**

- All ₪ fields use a formatted number input: display 1,250,000 while editing, store as raw float.
- All % fields display with a % suffix affix in the input itself.
- Field 6 (term) and field 11 (reset) share a mini visual: a small horizontal progress bar under the field showing "X of Y months elapsed" — cheap to build, high scannability value.

### 2.2.1 Track Type Enum & Defaults

| track_type value | Display label (EN) | Hebrew label | Default rate | Has reset window? | Default is_cpi_linked | Color token |
|------------------|-------------------|--------------|--------------|-------------------|----------------------|-------------|
| PRIME | Prime-Linked | פריים | Prime rate − 0.5% (config constant, default assumes Prime = 6.0% → 5.5%) | No (floats monthly with BOI rate; treat as "no fixed reset") | false | --track-prime |
| FIXED_UNLINKED | Fixed Unlinked (Klatz) | קבועה לא צמודה (קל"צ) | 5.2% | No | false | --track-fixed-unlinked |
| FIXED_LINKED | Fixed CPI-Linked | קבועה צמודה | 3.8% | No | true | --track-fixed-linked |
| VARIABLE_5Y | Variable, 5-Year Reset | משתנה כל 5 שנים | 4.5% | Yes, default 60 months | configurable, default false | --track-variable-5y |
| VARIABLE_5Y_LINKED | Variable, 5-Year Reset (CPI-Linked) | משתנה כל 5 שנים צמודה | 4.0% | Yes, default 60 months | true | --track-variable-5y-linked |
| OTHER | Other / Custom | אחר | 5.0% | User-toggleable | User-toggleable | --track-other |

### 2.2.2 Penalty Estimation Helper (field 9)

Full BOI Amlat Pirachon calculation requires the bank's own discount curve and is out of scope for exact replication. Provide a labeled estimate, not a claimed-accurate figure:

```
estimated_penalty ≈ principal_balance × max(0, (track_rate − reference_market_rate)) × (remaining_term_months / 12) × discount_factor
```

Where reference_market_rate is a user-editable global assumption (default 4.3%, exposed in Settings, §3.1) and discount_factor defaults to 0.6 (accounts for the fact that the penalty is calculated on discounted future interest, not raw undiscounted interest — this is a simplification and must be labeled as such in the UI with a tooltip: "Estimate only. Your bank's actual penalty (Amlat Pirachon) uses a regulated discount formula — request the exact figure from your bank before acting."

This helper is a suggestion filled into the field, not an authoritative calculation baked into results — the user can accept it or overwrite it.

### 2.2.3 CPI-Linked Tracks — Scope Note

v1 does not simulate future CPI drift (that requires a macro assumption the user can't reasonably supply with confidence). is_cpi_linked = true tracks are calculated on their current, already-CPI-adjusted balance as entered by the user, with a persistent badge: "CPI-linked — balance shown does not project future indexation." This is a scope boundary to state explicitly in the UI, not silently omit.

### 2.3 Profile Persistence & Management

| Feature | Behavior |
|---------|----------|
| Auto-save to session | Every field edit writes immediately to in-memory state (st.session_state.profile or equivalent). No explicit "save" needed to keep working within a session. |
| Save Profile (export) | Button in header/Profile Manager → serializes the full profile object to JSON → triggers browser file download, filename mashkanta-profile-{YYYY-MM-DD}.json. |
| Load Profile (import) | File uploader accepting .json → validates schema (§2.3.1) → on success, replaces current profile after a confirm step ("This will replace your current 6 tracks. Continue?"); on failure, shows a specific error ("Missing field annual_interest_rate in track 3") rather than a generic parse error. |
| Load Demo Profile | Single-click button, visible prominently on first visit / empty state. Loads a realistic 4-track Israeli mortgage (see §2.3.2). Always available, not just first-visit-gated — a "reset to demo" affordance is useful for exploration. |
| Clear All / Start Fresh | Destructive action behind confirm, empties the track list back to the empty state (§5.3). |
| Browser persistence (optional enhancement) | If using React/FastHTML with localStorage, auto-persist the current profile so a refresh doesn't lose data. In Streamlit this is naturally handled by session state for the session's duration only — surface a small note: "Your data is kept for this session only. Export to save permanently." |

### 2.3.1 Profile JSON Schema (v1)

```json
{
  "schema_version": 1,
  "profile_name": "My Mashkanta",
  "created_at": "2026-08-03T00:00:00Z",
  "global_assumptions": {
    "reference_market_rate": 0.043,
    "alternative_investment_annual_return": 0.08,
    "prime_rate_current": 0.06
  },
  "tracks": [
    {
      "track_id": "uuid-string",
      "custom_name": "Prime",
      "track_type": "PRIME",
      "principal_balance": 480000,
      "annual_interest_rate": 0.055,
      "remaining_term_months": 220,
      "monthly_repayment": 3120.50,
      "is_payment_manual_override": false,
      "early_exit_penalty": 0,
      "notice_fee": 720,
      "months_to_reset": null,
      "is_cpi_linked": false
    }
  ]
}
```

### 2.3.2 Demo Profile Content (realistic 4-track example)

| Track | Type | Balance (₪) | Rate | Term Left | Reset |
|-------|------|-------------|------|-----------|-------|
| Prime | PRIME | 480,000 | 5.5% | 220 mo | — |
| Fixed Unlinked | FIXED_UNLINKED | 350,000 | 5.1% | 180 mo | — |
| Fixed CPI-Linked | FIXED_LINKED | 220,000 | 3.7% | 260 mo | — |
| Variable 5Y | VARIABLE_5Y | 150,000 | 4.4% | 190 mo | 34 mo to reset |

Total demo principal: ₪1,200,000 — a realistic mid-size Israeli mortgage. This dataset must produce non-trivial, non-degenerate results in every tab (i.e. at least one track should show a "favorable to pay off early" signal and at least one should show "wait for reset" in Tab 4).

## 3. Layout & Information Architecture

### 3.1 Page Layout Blueprint

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER: App name · [Manage Tracks] · [Save] [Load] · [Settings ⚙]│
├───────────────┬─────────────────────────────────────────────────┤
│ SIDEBAR       │  GLOBAL KPI ROW                                  │
│ (persistent,  │  [Total Balance][Weighted Avg Rate][Blended      │
│ collapsible)  │   Monthly Pmt][Est. Total Remaining Interest]    │
│               ├─────────────────────────────────────────────────┤
│ - Global      │  TAB BAR                                         │
│   assumptions │  [Portfolio & Diagnostics] [Early Payoff]        │
│   (market     │  [Refinancing] [Recommendations]                 │
│   rate, alt-  ├─────────────────────────────────────────────────┤
│   investment  │                                                  │
│   return)     │        ACTIVE TAB CONTENT AREA                   │
│ - Profile     │        (charts, forms, tables per tab spec)      │
│   quick-list  │                                                  │
│   (compact    │                                                  │
│   track       │                                                  │
│   summary)    │                                                  │
└───────────────┴─────────────────────────────────────────────────┘
```

**Sidebar contents (always visible, low-frequency-change controls):**

- Global Assumptions panel: reference_market_rate, alternative_investment_annual_return (this is the S&P 500 / market comparator, default 8% nominal), prime_rate_current. These feed Tabs 2 and 3.
- Compact profile summary: a mini list of tracks (name + balance) with a "Manage Tracks →" link into the full Profile Manager. Lets the user orient without leaving the analysis tabs.

**Global KPI Row (recomputed live from all tracks):**

| KPI Card | Formula reference | Format |
|----------|-------------------|--------|
| Total Outstanding Balance | Σ principal_balance | ₪ with thousands separator |
| Weighted Avg. Interest Rate | §4.1 | % to 2 decimals |
| Blended Monthly Repayment | Σ monthly_repayment | ₪ |
| Est. Total Remaining Interest | §4.1 (sum of per-track remaining interest) | ₪, with a "≈" prefix to signal estimate |

**Empty state:** If zero tracks exist, the KPI row and all tabs are replaced by the empty-state component (§5.3) — do not render zeroed-out KPI cards, which would misleadingly imply a ₪0 mortgage.

### 3.2 Tab Structure Definition

**Tab 1 — Mortgage Portfolio & Track Diagnostics**

Purpose: "What do I actually have, and how is it distributed?"

| Component | Detail |
|-----------|--------|
| Stacked bar / donut: balance by track | One segment per track, colored by track_type token, labeled with ₪ and % of total |
| Table: full track diagnostics | Columns: Name, Type, Balance, Rate, % of Portfolio, Monthly Pmt, Term Left, Reset Window, Penalty. Sortable by any column. |
| Weighted rate breakdown chart | Horizontal bar per track showing its rate against the portfolio-weighted average line, so above/below-average tracks are visually obvious |
| Reset timeline strip | Horizontal timeline (0 → max term) with markers for each track's reset window, so upcoming resets are visually scannable |

**Tab 2 — Early Payoff & Lump-Sum Simulator**

Purpose: "If I have ₪X to put toward the mortgage, where should it go — and is it even better than investing it?"

| Component | Detail |
|-----------|--------|
| Input: Available lump sum (₪) | Single number input, top of tab |
| Allocation control | Per-track slider/number set, must sum to the lump sum (auto-normalize or show a running "allocated / remaining" indicator). Includes a "Suggest optimal allocation" button (§4.2 — greedy allocation to highest-rate, lowest-penalty tracks first) |
| Per-track result cards | For each allocated track: interest saved, penalty paid, net benefit, new term/payment if partially paid down |
| Payoff vs. Invest comparison chart | Two bars/lines: (a) Net Payoff Benefit if applied to mortgage, (b) Projected value if invested at alternative_investment_annual_return over the same remaining term (§4.3). Clear winner is visually obvious (color-coded green/amber) |
| Verdict banner | One-line auto-generated verdict: "Paying off [Track] beats investing by ≈₪X over Y months" or the reverse |

**Tab 3 — Refinancing (Mirzur) Breakeven Engine**

Purpose: "The bank/broker offered me a new rate — is switching worth it, and when do I break even?"

| Component | Detail |
|-----------|--------|
| Track selector | Choose which existing track(s) to refinance (single or multi-select) |
| New offer inputs | New rate (%), new term (months), one-time switching costs (₪ — sum of exit penalty + notice fee + any broker/appraisal fee field) |
| Breakeven chart | X-axis: months, Y-axis: cumulative savings; line crosses zero at breakeven month, shaded region before/after |
| Result KPIs | Breakeven Month, Total Lifetime Net Savings, New Blended Monthly Payment (delta vs old) |
| Sensitivity mini-table | Breakeven month recalculated at new-rate ± 0.25% / ± 0.5% so the user sees how sensitive the deal is to the exact rate they're quoted |

**Tab 4 — Strategic Recommendation & Risk Matrix**

Purpose: "Given everything above, what should I actually do, per track?"

| Component | Detail |
|-----------|--------|
| Risk/Action matrix table | One row per track: Recommended Action (Pay off now / Wait for reset / Consider refinancing / Hold), Confidence driver (short text: e.g. "High rate, low penalty"), Reset window, Penalty exposure |
| Rule engine badges | Color-coded chip per track (green = favorable to act now, amber = wait, red = high penalty exposure) |
| Priority ranking | Tracks sorted by "action priority" — combination of rate delta above weighted average and penalty-to-balance ratio (§4.4) |

### 3.3 Navigation & State Rules

- Switching tabs never loses unsaved form state in the Profile Manager — track edits persist regardless of active tab.
- Global Assumptions (sidebar) apply instantly to Tabs 2 and 3 without needing a page reload — reactive recompute.
- Deep-linkable tab state is a nice-to-have (React: URL query param ?tab=refinance), not required for Streamlit v1.

## 4. Mathematical & Logic Engine Specs

All formulas operate monthly (30/360-style simplification is acceptable for v1; exact day-count is out of scope).

### 4.1 Core Portfolio Math

**Weighted Average Interest Rate:**

```
WeightedRate = Σ(balance_i × rate_i) / Σ(balance_i)   for i in tracks
```

**Monthly Repayment — Spitzer (French amortization) formula**, used to auto-calculate field 7 when not manually overridden:

```
r = annual_interest_rate / 12                     (monthly rate)
n = remaining_term_months
monthly_repayment = balance × r × (1 + r)^n / ((1 + r)^n − 1)
```

Edge case: if r == 0 (rate = 0%):
```
monthly_repayment = balance / n
```

**Total Remaining Interest (per track)**, used in the KPI row:

```
total_remaining_interest = (monthly_repayment × remaining_term_months) − principal_balance
```

Sum across tracks for the portfolio KPI. Guard against negative results (can occur with manually-overridden payments below the amortizing minimum) — if total_remaining_interest < 0, display "N/A — payment below amortizing minimum" instead of a negative number.

### 4.2 Early Payoff — Net Payoff Benefit (NPB)

For a lump sum L allocated to track i:

```
InterestSaved_i = RemainingInterest(balance_i, rate_i, term_i)
                  − RemainingInterest(balance_i − L_i, rate_i, term_i')
```

where term_i' is either:
- (a) the same term_i with a recalculated (lower) monthly payment, or
- (b) the same monthly payment with a recalculated (shorter) term

— this must be a user toggle: "Reduce payment" vs "Reduce term" (reduce-term produces larger InterestSaved and should be the default, as it's the financially dominant choice for a purely early-payoff-vs-invest comparison)

```
NPB_i = InterestSaved_i − EarlyExitPenalty_i − NoticeFee_i(if applicable)
```

**Suggested optimal allocation ("Suggest optimal allocation" button):** Greedy allocation — rank tracks by NPB_i / L_i (benefit per shekel allocated, i.e. marginal efficiency) descending, and fill each track's min(balance_i, remaining lump sum) in that order until the lump sum is exhausted. This is a reasonable heuristic, not a proven-optimal LP solution — label the button's tooltip accordingly: "Suggests an efficient allocation, not a guaranteed-optimal one."

**Notice Fee waiver logic (BOI 10-day rule):** If the user indicates (checkbox in the simulator: "I can give 10+ business days' notice") then NoticeFee_i is zeroed out in the NPB calculation, with an inline note: "Notice fee waived — 10-day advance notice rule (Amlat Hoda'a Mukdamet) applied." Default checkbox state: unchecked (conservative default).

### 4.3 Alternative Opportunity Cost (Invest Instead)

Compound growth of the same lump sum over the same remaining term, compared against the mortgage payoff:

```
FutureValue = L × (1 + annual_return/12)^T
```

where T = remaining_term_months of the track(s) the lump sum would have been applied to (use the longest remaining term among allocated tracks for a conservative, apples-to-apples horizon)

```
InvestmentNetGain = FutureValue − L
```

Comparison shown to user:

```
Verdict = "Payoff wins"      if Σ NPB_i > InvestmentNetGain
        = "Investing wins"   if InvestmentNetGain > Σ NPB_i
        = "Roughly equal"    if |difference| < 1% of L
```

This comparison is explicitly a pre-tax, no-risk-adjustment comparison — the UI must carry a persistent disclaimer: "Mortgage payoff is a guaranteed, risk-free return. Market investment returns are not guaranteed. This comparison does not account for capital gains tax, or your personal risk tolerance."

### 4.4 Refinancing (Mirzur) Breakeven

```
ΔMonthlyRepayment = OldMonthlyRepayment − NewMonthlyRepayment
                   (positive = new deal costs less per month)

TotalSwitchingCosts = Σ(EarlyExitPenalty_i for refinanced tracks)
                    + Σ(NoticeFee_i for refinanced tracks, unless waived)
                    + OtherFees (broker/appraisal, user-entered)

Month_breakeven = TotalSwitchingCosts / ΔMonthlyRepayment
                 (undefined / "Never breaks even" if ΔMonthlyRepayment <= 0)

LifetimeNetSavings = (ΔMonthlyRepayment × min(OldTermRemaining, NewTerm))
                    − TotalSwitchingCosts
```

Sensitivity table (§3.2, Tab 3) reruns this same block at new-rate ± 0.25% and ± 0.5%, holding switching costs constant.

### 4.5 Recommendation Engine (Tab 4 rule logic)

Deterministic rule table, evaluated top-to-bottom per track, first match wins:

| Priority | Condition | Recommended Action |
|----------|-----------|-------------------|
| 1 | rate_i > WeightedRate + 0.5% AND early_exit_penalty_i == 0 | Pay off now |
| 2 | months_to_reset_i is not null AND months_to_reset_i <= 6 | Wait for reset — reset window imminent, penalty likely drops or rate re-negotiates naturally |
| 3 | rate_i > reference_market_rate + 0.75% AND early_exit_penalty_i / balance_i < 0.02 | Consider refinancing — penalty is low relative to balance, rate gap is large |
| 4 | early_exit_penalty_i / balance_i >= 0.05 | Hold — penalty exposure too high relative to balance to act now |
| 5 | (default, no condition matched) | Hold — no strong signal either way |

Confidence driver text is generated from whichever comparison triggered the match (e.g. "Rate is 1.1% above your portfolio average, no exit penalty").

Priority ranking for the ordered list in Tab 4:

```
ActionPriorityScore_i = (rate_i − WeightedRate) − (early_exit_penalty_i / balance_i) × 10
```

Higher score = higher priority to act. Sort descending.

## 5. Visual Design & Theme System

### 5.1 Color Palette

**Dark theme (default):**

| Token | Hex | Usage |
|-------|-----|-------|
| --bg-primary | #0B0F14 | App background |
| --bg-surface | #141A21 | Cards, panels |
| --bg-surface-raised | #1C242D | Modals, elevated cards (Profile Manager) |
| --border-subtle | #2A333D | Card borders, dividers |
| --text-primary | #EAF0F6 | Headings, primary values |
| --text-secondary | #8B98A5 | Labels, helper text |
| --accent-primary | #3DDC97 | Positive gains, "Pay off now" |
| --accent-warning | #F5B759 | "Wait" / amber signals |
| --accent-danger | #EF5B5B | High penalty exposure, negative deltas |
| --accent-info | #5B9DEF | Neutral highlights, active tab indicator |

**Light theme (toggle):**

| Token | Hex |
|-------|-----|
| --bg-primary | #F7F9FB |
| --bg-surface | #FFFFFF |
| --bg-surface-raised | #FFFFFF (with box-shadow) |
| --border-subtle | #E1E6EB |
| --text-primary | #111820 |
| --text-secondary | #5B6672 |
| --accent-primary | #1F9D6E |
| --accent-warning | #B5790C |
| --accent-danger | #C0392B |
| --accent-info | #2A6FD6 |

**Track type color tokens (used consistently in charts, badges, timeline):**

| Token | Dark hex | Light hex |
|-------|----------|-----------|
| --track-prime | #5B9DEF | #2A6FD6 |
| --track-fixed-unlinked | #3DDC97 | #1F9D6E |
| --track-fixed-linked | #B98CE0 | #8B5FC7 |
| --track-variable-5y | #F5B759 | #B5790C |
| --track-variable-5y-linked | #F58F59 | #C25E1F |
| --track-other | #8B98A5 | #5B6672 |

### 5.2 Form UX & UI Controls

| Element | Spec |
|---------|------|
| Number inputs (₪, %) | Right-aligned text, monospace/tabular-nums font for value alignment, inline unit affix (₪ prefix, % suffix) |
| Input error state | 1px --accent-danger border + small inline message below field, not a toast (toasts are missed on fast-editing forms) |
| Tooltips for banking terms | (?) icon inline next to any Hebrew-derived term label (Amlat Pirachon, Mirzur, Klatz, Amlat Hoda'a Mukdamet). Tooltip content: plain-English definition, 1–2 sentences, no jargon-on-jargon |
| Toggle pattern (auto vs manual) | Fields 7, 9, 10 that have an "auto-calculated unless overridden" behavior use a small "Auto" pill button next to the field — clicking it recalculates and clears the override flag; typing in the field sets the override flag silently (no separate toggle switch needed — reduces control count) |
| Buttons | Primary action = filled --accent-primary background. Destructive action (Delete, Clear All) = outlined --accent-danger, requires second confirm click as noted in §2.1 |
| Sliders (allocation, Tab 2) | Paired with a synced number input — sliders alone are too imprecise for ₪ amounts in the tens/hundreds of thousands |

### 5.3 Micro-interactions & State Guidance

| State | Behavior |
|-------|----------|
| Empty state (0 tracks) | Centered illustration/icon + headline "No mortgage tracks yet" + two buttons: [Add Your First Track] (primary) and [Load Demo Profile] (secondary). No KPI row, no tabs rendered. |
| Partial state (tracks exist, but a required global assumption is missing) | Inline banner above the affected tab only (not global) — e.g. Tab 2 shows "Set your alternative investment return in the sidebar to see the invest-vs-payoff comparison" with a "Set now" shortcut. |
| Loading / recompute | All v1 math is synchronous and near-instant (no async calls) — no spinner needed for calculations. Only the JSON import/export flow needs a brief (<300ms) loading affordance. |
| Chart hover states | Every chart element (bar segment, line point) shows a tooltip with exact ₪ figures on hover — charts are for pattern-scanning, tooltips are for precision-checking. |
| Save confirmation | Non-blocking toast, 2s auto-dismiss: "Profile exported." / "Profile loaded — 4 tracks." |
| Validation feedback timing | Validate on blur, not on every keystroke (keystroke-level validation on a ₪ field like "1" → "12" → "125" would flash errors constantly). |
| Destructive-action confirm pattern | In-place two-step (button text changes from "Delete" to "Confirm Delete?" for 3 seconds, reverts if not clicked) rather than a modal — faster for power users managing many tracks. |

## 6. Open Questions / Assumptions Flagged for Your Review

These are the judgment calls made to keep this spec implementable without a back-and-forth; flag any you want changed before a developer starts:

1. Penalty estimation formula (§2.2.2) is a simplification, not a BOI-accurate replication — confirm the disclaimer language is prominent enough for your comfort, or tell me if you'd rather omit the auto-estimate entirely and require manual entry only.
2. CPI-linked tracks (§2.2.3) don't project future indexation — confirmed acceptable for v1, or do you want a basic CPI-drift assumption added to Global Assumptions (e.g. flat 2%/year)?
3. "Reduce term" vs "reduce payment" default (§4.2) is set to reduce-term. If your own usual preference is the opposite, say so and I'll flip the default.
4. Stack choice: this spec is stack-agnostic by design (Streamlit for speed of build, React/FastHTML for polish). If you tell me which one you're actually building in, I can follow up with concrete component code (React component tree / Streamlit function breakdown) rather than leaving it structural.

**End of specification.**
