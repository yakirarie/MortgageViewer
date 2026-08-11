import { describe, it, expect } from "vitest";
import type { Track } from "./types";
import {
  weightedAverageRate,
  spitzerMonthlyPayment,
  effectiveMonthlyPayment,
  totalRemainingInterest,
  remainingInterestForTrack,
  portfolioTotals,
  monthsToPayoff,
  netPayoffBenefit,
  payoffDiagnostics,
  suggestOptimalAllocation,
  refinancingBreakeven,
  recommendActionForTrack,
  rankTracksByPriority,

  currentEffectiveRate,
  effectiveRateForMonth,
  spitzerMonthlyPaymentWithHistory,
  simulatePrimeAmortization,
  simulateFixedAmortization,
  deriveTrackPayoff,
  liveTrackBalance,
  fixedTrackGapPenalty,

  nextResetDate,
  monthsToNextReset,
  totalExitCost,
  computeAmlatPeareiRibit,
  computeAccruedDailyInterest,
  clampRate,
} from "./mortgage-math";








// ---------------------------------------------------------------------------
// Fixture: the demo profile from PRD §2.3.2
// ---------------------------------------------------------------------------

function makeTrack(overrides: Partial<Track>): Track {
  return {
    track_id: "test-id",
    custom_name: "Test Track",
    track_type: "OTHER",
    principal_balance: 0,
    annual_interest_rate: 0,
    remaining_term_months: 1,
    monthly_repayment: 0,
    is_payment_manual_override: false,
    amlat_pearei_ribit: 0,
    notice_fee: 0,
    operational_fee: 60,
    months_to_reset: null,
    is_cpi_linked: false,
    ...overrides,
  };
}


const prime = makeTrack({
  track_id: "prime",
  custom_name: "Prime",
  track_type: "PRIME",
  principal_balance: 480000,
  annual_interest_rate: 0.055,
  remaining_term_months: 220,
});

const fixedUnlinked = makeTrack({
  track_id: "fixed-unlinked",
  custom_name: "Fixed Unlinked",
  track_type: "FIXED_UNLINKED",
  principal_balance: 350000,
  annual_interest_rate: 0.051,
  remaining_term_months: 180,
});

const fixedLinked = makeTrack({
  track_id: "fixed-linked",
  custom_name: "Fixed CPI-Linked",
  track_type: "FIXED_LINKED",
  principal_balance: 220000,
  annual_interest_rate: 0.037,
  remaining_term_months: 260,
  is_cpi_linked: true,
});

const variable5y = makeTrack({
  track_id: "variable-5y",
  custom_name: "Variable 5Y",
  track_type: "VARIABLE_5Y",
  principal_balance: 150000,
  annual_interest_rate: 0.044,
  remaining_term_months: 190,
  months_to_reset: 34,
});

const demoProfile: Track[] = [prime, fixedUnlinked, fixedLinked, variable5y];

// ---------------------------------------------------------------------------
// §4.1 Core Portfolio Math
// ---------------------------------------------------------------------------

describe("weightedAverageRate", () => {
  it("matches the hand-computed value for the demo profile", () => {
    expect(weightedAverageRate(demoProfile)).toBeCloseTo(0.049158, 5);
  });

  it("returns 0 for an empty portfolio", () => {
    expect(weightedAverageRate([])).toBe(0);
  });

  it("returns 0 when total balance is 0", () => {
    expect(weightedAverageRate([makeTrack({ principal_balance: 0, annual_interest_rate: 0.05 })])).toBe(0);
  });
});

describe("spitzerMonthlyPayment", () => {
  it("matches hand-computed payments for each demo track", () => {
    expect(spitzerMonthlyPayment(480000, 0.055, 220)).toBeCloseTo(3468.22, 1);
    expect(spitzerMonthlyPayment(350000, 0.051, 180)).toBeCloseTo(2786.04, 1);
    expect(spitzerMonthlyPayment(220000, 0.037, 260)).toBeCloseTo(1231.4, 1);
    expect(spitzerMonthlyPayment(150000, 0.044, 190)).toBeCloseTo(1097.54, 1);
  });

  it("falls back to straight-line division at 0% interest", () => {
    expect(spitzerMonthlyPayment(120000, 0, 120)).toBeCloseTo(1000, 5);
  });

  it("returns 0 for a zero or negative balance", () => {
    expect(spitzerMonthlyPayment(0, 0.05, 120)).toBe(0);
    expect(spitzerMonthlyPayment(-500, 0.05, 120)).toBe(0);
  });

  it("returns 0 for a zero term", () => {
    expect(spitzerMonthlyPayment(100000, 0.05, 0)).toBe(0);
  });
});

describe("effectiveMonthlyPayment", () => {
  it("uses the Spitzer calculation when there is no manual override", () => {
    expect(effectiveMonthlyPayment(prime)).toBeCloseTo(3468.22, 1);
  });

  it("uses the manual override value when set", () => {
    const overridden = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      monthly_repayment: 4000,
      is_payment_manual_override: true,
    });
    expect(effectiveMonthlyPayment(overridden)).toBe(4000);
  });
});

describe("totalRemainingInterest / remainingInterestForTrack", () => {
  it("matches hand-computed remaining interest for the Prime track", () => {
    expect(remainingInterestForTrack(prime)).toBeCloseTo(283007.32, 0);
  });

  it("can go negative when payment is below the amortizing minimum (caller must guard)", () => {
    const belowMin = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      monthly_repayment: 100, // far below the ~₪3,468 minimum
      is_payment_manual_override: true,
    });
    expect(totalRemainingInterest(480000, 100, 220)).toBeLessThan(0);
    expect(remainingInterestForTrack(belowMin)).toBeLessThan(0);
  });
});

describe("portfolioTotals", () => {
  it("computes correct totals for the demo profile", () => {
    const totals = portfolioTotals(demoProfile);
    expect(totals.totalBalance).toBe(1200000);
    expect(totals.weightedRate).toBeCloseTo(0.049158, 5);
    expect(totals.blendedMonthlyPayment).toBeCloseTo(8583.19, 1);
    expect(totals.invalidInterestTrackIds).toEqual([]);
  });

  it("excludes tracks with negative remaining interest from the sum and flags them", () => {
    const badTrack = makeTrack({
      track_id: "bad",
      principal_balance: 100000,
      annual_interest_rate: 0.05,
      remaining_term_months: 120,
      monthly_repayment: 50,
      is_payment_manual_override: true,
    });
    const totals = portfolioTotals([prime, badTrack]);
    expect(totals.invalidInterestTrackIds).toEqual(["bad"]);
    // total should equal Prime's remaining interest alone, not include the bad track
    expect(totals.totalRemainingInterest).toBeCloseTo(283007.32, 0);
  });

  it("total balance uses the live total payoff balance for fully-configured tracks", () => {
    // A fully-configured fixed track (original principal/term + start date) has a
    // live total payoff balance derived from its amortization (net principal +
    // accrued daily interest), so the portfolio total must equal the sum of those
    // live balances — not the stored principal_balance snapshot.
    const fixed = makeTrack({
      track_id: "fixed-live",
      track_type: "FIXED_UNLINKED",
      principal_balance: 800000,
      original_principal: 800000,
      original_term_months: 360,
      start_date: "2023-09-13",
      first_payout_date: "2023-10-10",
      annual_interest_rate: 0.049,
      remaining_term_months: 326,
    });
    const live = liveTrackBalance(fixed);
    // The loan has amortized down over the elapsed months, so the live balance is
    // below the original principal but still includes accrued daily interest.
    expect(live).toBeLessThan(fixed.principal_balance);
    expect(live).toBeGreaterThan(0);

    const totals = portfolioTotals([fixed]);
    expect(totals.totalBalance).toBeCloseTo(live, 5);
  });

});


// ---------------------------------------------------------------------------
// §4.2 Early Payoff — Net Payoff Benefit
// ---------------------------------------------------------------------------

describe("monthsToPayoff", () => {
  it("matches the hand-computed new term for a ₪100k paydown on Prime", () => {
    const newBalance = 480000 - 100000;
    const originalPayment = spitzerMonthlyPayment(480000, 0.055, 220);
    expect(monthsToPayoff(newBalance, 0.055, originalPayment)).toBeCloseTo(152.53, 1);
  });

  it("returns Infinity if the payment doesn't cover monthly interest", () => {
    expect(monthsToPayoff(480000, 0.055, 100)).toBe(Infinity);
  });

  it("returns 0 for a zero/negative balance", () => {
    expect(monthsToPayoff(0, 0.05, 1000)).toBe(0);
  });
});

describe("netPayoffBenefit", () => {
  it("computes interest saved matching the hand-computed value (reduce_term, no penalty/fee)", () => {
    const result = netPayoffBenefit({ track: prime, lumpSum: 100000 });
    expect(result.interestSaved).toBeCloseTo(133987.45, 0);
    // The fixed ₪60 operational fee (Amlat Hotza'ot Tipuliyot) is always due on
    // early payoff, even when there is no interest-gap penalty.
    expect(result.penaltyPaid).toBe(60);
    expect(result.noticeFeePaid).toBe(0);
    expect(result.netPayoffBenefit).toBeCloseTo(133987.45 - 60, 0);
  });

  it("subtracts penalty and notice fee from the benefit", () => {
    const withCosts = makeTrack({
      ...prime,
      amlat_pearei_ribit: 20000,
      notice_fee: 720,
    });
    const result = netPayoffBenefit({ track: withCosts, lumpSum: 100000 });
    expect(result.netPayoffBenefit).toBeCloseTo(133987.45 - 20000 - 720 - 60, 0);
  });



  it("waives the notice fee when noticeWaived is true", () => {
    const withFee = makeTrack({ ...prime, notice_fee: 720 });
    const result = netPayoffBenefit({ track: withFee, lumpSum: 100000, noticeWaived: true });
    expect(result.noticeFeePaid).toBe(0);
  });

  it("clamps lump sum allocation to the track balance", () => {
    const result = netPayoffBenefit({ track: variable5y, lumpSum: 999999999 });
    // Full payoff: interest saved should equal the entire remaining interest
    expect(result.interestSaved).toBeCloseTo(remainingInterestForTrack(variable5y), 0);
  });

  it("produces zero benefit for a zero lump sum", () => {
    const result = netPayoffBenefit({ track: prime, lumpSum: 0 });
    expect(result.interestSaved).toBeCloseTo(0, 5);
    expect(result.penaltyPaid).toBe(0);
    expect(result.noticeFeePaid).toBe(0);
  });
});

describe("suggestOptimalAllocation", () => {
  it("allocates the full lump sum across tracks without exceeding any balance", () => {
    const allocations = suggestOptimalAllocation(demoProfile, 200000);
    const total = allocations.reduce((sum, a) => sum + a.allocated, 0);
    expect(total).toBeCloseTo(200000, 2);
    for (const a of allocations) {
      const track = demoProfile.find((t) => t.track_id === a.track_id)!;
      expect(a.allocated).toBeLessThanOrEqual(track.principal_balance);
    }
  });

  it("never over-allocates beyond total portfolio balance", () => {
    const allocations = suggestOptimalAllocation(demoProfile, 5_000_000);
    const total = allocations.reduce((sum, a) => sum + a.allocated, 0);
    expect(total).toBeCloseTo(1200000, 2); // capped at total balance
  });

  it("returns an empty allocation for a zero lump sum", () => {
    expect(suggestOptimalAllocation(demoProfile, 0)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §4.3 Payoff Diagnostics (deterministic debt-savings metrics)
// ---------------------------------------------------------------------------

describe("payoffDiagnostics", () => {
  it("computes the total payoff outlay as the full balance plus exit costs", () => {
    const track = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      amlat_pearei_ribit: 20000,
      notice_fee: 720,
      operational_fee: 60,
    });
    const d = payoffDiagnostics({ track, lumpSum: 480000 });
    // Full payoff: outlay = balance + penalty + notice + operational fee.
    expect(d.totalPayoffOutlay).toBeCloseTo(480000 + 20000 + 720 + 60, 0);
  });

  it("guaranteed interest saved equals the remaining interest on a full payoff", () => {
    const track = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
    });
    const d = payoffDiagnostics({ track, lumpSum: 480000 });
    expect(d.guaranteedInterestSaved).toBeCloseTo(remainingInterestForTrack(track), 0);
  });

  it("monthly cashflow relief equals the current monthly payment on a full payoff (reduce_payment)", () => {
    const track = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
    });
    const d = payoffDiagnostics({ track, lumpSum: 480000, mode: "reduce_payment" });
    expect(d.monthlyCashflowRelief).toBeCloseTo(spitzerMonthlyPayment(480000, 0.055, 220), 1);
  });


  it("penalty payback horizon is 0 when there is no monthly cashflow relief (reduce_term mode)", () => {
    const track = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      amlat_pearei_ribit: 20000,
      notice_fee: 720,
      operational_fee: 60,
    });
    // Default mode is reduce_term → the payment is unchanged, so there is no
    // monthly relief to recover the exit fees against.
    const d = payoffDiagnostics({ track, lumpSum: 480000 });
    expect(d.penaltyPaybackHorizon).toBe(0);
  });

  it("penalty payback horizon is the months of cashflow relief needed to cover exit costs (reduce_payment)", () => {
    const track = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      amlat_pearei_ribit: 20000,
      notice_fee: 720,
      operational_fee: 60,
    });
    const d = payoffDiagnostics({
      track,
      lumpSum: 480000,
      mode: "reduce_payment",
    });
    // Exit costs = 20000 + 720 + 60 = 20780. Monthly relief = the Spitzer payment.
    const monthly = spitzerMonthlyPayment(480000, 0.055, 220);
    expect(d.penaltyPaybackHorizon).toBeCloseTo(20780 / monthly, 1);
  });


  it("produces zero diagnostics for a zero lump sum", () => {
    const track = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
    });
    const d = payoffDiagnostics({ track, lumpSum: 0 });
    expect(d.totalPayoffOutlay).toBe(0);
    expect(d.guaranteedInterestSaved).toBe(0);
    expect(d.monthlyCashflowRelief).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// §4.4 Refinancing Breakeven
// ---------------------------------------------------------------------------


describe("refinancingBreakeven", () => {
  it("matches the hand-computed breakeven and lifetime savings", () => {
    const result = refinancingBreakeven({
      oldMonthlyRepayment: 3000,
      newMonthlyRepayment: 2700,
      totalSwitchingCosts: 15000,
      oldTermRemainingMonths: 200,
      newTermMonths: 180,
    });
    expect(result.deltaMonthlyRepayment).toBeCloseTo(300, 5);
    expect(result.breakevenMonth).toBeCloseTo(50, 5);
    expect(result.lifetimeNetSavings).toBeCloseTo(39000, 0);
  });

  it("returns null breakeven when the new deal costs the same or more per month", () => {
    const result = refinancingBreakeven({
      oldMonthlyRepayment: 2500,
      newMonthlyRepayment: 2600,
      totalSwitchingCosts: 5000,
      oldTermRemainingMonths: 120,
      newTermMonths: 120,
    });
    expect(result.breakevenMonth).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §4.5 Recommendation Engine
// ---------------------------------------------------------------------------

describe("recommendActionForTrack", () => {
  const weightedRate = weightedAverageRate(demoProfile);

  it("recommends PAY_OFF_NOW for a high-rate, zero-penalty track", () => {
    const highRateNoPenalty = makeTrack({
      track_id: "high-rate",
      annual_interest_rate: weightedRate + 0.01,
      amlat_pearei_ribit: 0,
      principal_balance: 100000,
    });

    const rec = recommendActionForTrack(highRateNoPenalty, weightedRate);
    expect(rec.action).toBe("PAY_OFF_NOW");

  });

  it("recommends WAIT_FOR_RESET when reset is imminent and rule 1 doesn't already match", () => {
    // Rule 1 requires rate > weighted+0.5% AND zero penalty. Give this track a
    // small non-zero penalty so rule 1 is skipped and rule 2 (reset window) is
    // the first actual match, per the strict top-to-bottom rule order in PRD §4.5.
    const nearReset = makeTrack({
      track_id: "near-reset",
      annual_interest_rate: weightedRate + 0.01,
      amlat_pearei_ribit: 500,
      months_to_reset: 3,
      principal_balance: 100000,
    });

    const rec = recommendActionForTrack(nearReset, weightedRate);
    expect(rec.action).toBe("WAIT_FOR_RESET");

  });

  it("rule 1 (pay off now) preempts rule 2 (reset) when both conditions are met, per strict priority order", () => {
    const bothMatch = makeTrack({
      track_id: "both-match",
      annual_interest_rate: weightedRate + 0.01,
      amlat_pearei_ribit: 0,
      months_to_reset: 3,
      principal_balance: 100000,
    });

    const rec = recommendActionForTrack(bothMatch, weightedRate);
    expect(rec.action).toBe("PAY_OFF_NOW");

  });

  it("recommends HOLD when penalty exposure is high relative to balance", () => {
    const highPenalty = makeTrack({
      track_id: "high-penalty",
      annual_interest_rate: weightedRate, // not above average, so rule 1 doesn't fire
      principal_balance: 100000,
      amlat_pearei_ribit: 8000, // 8% of balance
    });

    const rec = recommendActionForTrack(highPenalty, weightedRate);
    expect(rec.action).toBe("HOLD");
  });
});


describe("rankTracksByPriority", () => {
  it("ranks a high-rate, low-penalty track above a low-rate, high-penalty track", () => {
    const weightedRate = weightedAverageRate(demoProfile);
    const good = makeTrack({
      track_id: "good",
      annual_interest_rate: weightedRate + 0.02,
      amlat_pearei_ribit: 0,
      principal_balance: 100000,
    });
    const bad = makeTrack({
      track_id: "bad",
      annual_interest_rate: weightedRate - 0.01,
      amlat_pearei_ribit: 20000,
      principal_balance: 100000,
    });

    const ranked = rankTracksByPriority([bad, good]);
    expect(ranked[0].track_id).toBe("good");
    expect(ranked[1].track_id).toBe("bad");
  });
});

// ---------------------------------------------------------------------------
// §4.1a Prime Rate History
// ---------------------------------------------------------------------------

describe("currentEffectiveRate", () => {
  it("returns the latest rate_history entry for a Prime track", () => {
    const track = makeTrack({
      track_type: "PRIME",
      annual_interest_rate: 0.05,
      rate_history: [
        { effective_date: "2023-01-05", annual_interest_rate: 0.039 },
        { effective_date: "2023-02-23", annual_interest_rate: 0.044 },
      ],
    });
    expect(currentEffectiveRate(track)).toBeCloseTo(0.044);
  });

  it("falls back to annual_interest_rate when there is no history", () => {
    const track = makeTrack({ annual_interest_rate: 0.05 });
    expect(currentEffectiveRate(track)).toBeCloseTo(0.05);
  });
});

describe("effectiveRateForMonth", () => {
  const track = makeTrack({
    track_type: "PRIME",
    start_date: "2023-01-05",
    annual_interest_rate: 0.05,
    rate_history: [
      { effective_date: "2023-01-05", annual_interest_rate: 0.039 },
      { effective_date: "2023-02-23", annual_interest_rate: 0.044 },
      { effective_date: "2023-05-25", annual_interest_rate: 0.049 },
    ],
  });

  it("returns the rate in effect at month 0", () => {
    expect(effectiveRateForMonth(track, 0)).toBeCloseTo(0.039);
  });

  it("returns the updated rate after a BoI change", () => {
    // Month 2 lands in Feb 2023 → 4.4%
    expect(effectiveRateForMonth(track, 2)).toBeCloseTo(0.044);
    // Month 5 lands in Jun 2023 → 4.9%
    expect(effectiveRateForMonth(track, 5)).toBeCloseTo(0.049);
  });

  it("falls back to annual_interest_rate when there is no history or start date", () => {
    const noHistory = makeTrack({ annual_interest_rate: 0.05 });
    expect(effectiveRateForMonth(noHistory, 3)).toBeCloseTo(0.05);
  });
});

describe("spitzerMonthlyPaymentWithHistory", () => {
  it("falls back to the single-rate payment when there is no history", () => {
    const track = makeTrack({
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
    });
    expect(spitzerMonthlyPaymentWithHistory(track)).toBeCloseTo(
      spitzerMonthlyPayment(480000, 0.055, 220),
      5
    );
  });

  it("produces a payment that amortizes the balance over the term", () => {
    // A Prime track whose rate history is constant at 5.5% should produce the
    // same payment as the single-rate Spitzer formula.
    const track = makeTrack({
      track_type: "PRIME",
      start_date: "2023-01-05",
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      rate_history: [
        { effective_date: "2023-01-05", annual_interest_rate: 0.055 },
        { effective_date: "2023-02-23", annual_interest_rate: 0.055 },
        { effective_date: "2023-05-25", annual_interest_rate: 0.055 },
      ],
    });
    expect(spitzerMonthlyPaymentWithHistory(track)).toBeCloseTo(
      spitzerMonthlyPayment(480000, 0.055, 220),
      1
    );
  });

  it("returns a positive payment for a Prime track with a real BoI history", () => {
    const track = makeTrack({
      track_type: "PRIME",
      start_date: "2023-01-05",
      principal_balance: 480000,
      annual_interest_rate: 0.039,
      remaining_term_months: 220,
      rate_history: [
        { effective_date: "2023-01-05", annual_interest_rate: 0.039 },
        { effective_date: "2023-02-23", annual_interest_rate: 0.044 },
        { effective_date: "2023-05-25", annual_interest_rate: 0.049 },
        { effective_date: "2023-07-13", annual_interest_rate: 0.049 },
      ],
    });
    const payment = spitzerMonthlyPaymentWithHistory(track);
    expect(payment).toBeGreaterThan(0);
    // The payment should be within a reasonable band of the single-rate payment
    // computed at the current effective rate.
    const singleRate = spitzerMonthlyPayment(480000, 0.049, 220);
    expect(payment).toBeGreaterThan(singleRate * 0.9);
    expect(payment).toBeLessThan(singleRate * 1.1);
  });
});

describe("simulatePrimeAmortization", () => {
  it("falls back to the original principal/term when there is no start date or history", () => {
    const result = simulatePrimeAmortization(500000, "", 360, []);
    expect(result.currentBalance).toBe(500000);
    expect(result.remainingTermMonths).toBe(360);
    expect(result.monthsElapsed).toBe(0);
    expect(result.currentMonthlyPayment).toBe(0);
  });

  it("falls back when the start date is invalid", () => {
    const result = simulatePrimeAmortization(500000, "not-a-date", 360, [
      { effective_date: "2023-01-05", annual_interest_rate: 0.05 },
    ]);
    expect(result.currentBalance).toBe(500000);
    expect(result.remainingTermMonths).toBe(360);
  });

  it("amortizes a constant-rate loan correctly over the elapsed months", () => {
    // Start 12 months before the as-of date at a constant 5% rate, 360-month
    // term. The as-of date (day 9) is before the payment day (15th), so exactly
    // 12 full months have elapsed.
    const asOf = "2026-08-09";
    const start = new Date(asOf);
    start.setMonth(start.getMonth() - 12);
    start.setDate(5); // day 5 <= asOf day 9 → 12 full months
    const startDate = start.toISOString().slice(0, 10);

    const result = simulatePrimeAmortization(
      500000,
      startDate,
      360,
      [{ effective_date: startDate, annual_interest_rate: 0.05 }],
      "2025-09-15", // payment day 15 > asOf day 9 → no payment this month
      asOf
    );

    // 12 months elapsed, 348 remaining.
    expect(result.monthsElapsed).toBe(12);
    expect(result.remainingTermMonths).toBe(348);

    // The current balance should be less than the original (principal paid down).
    expect(result.currentBalance).toBeLessThan(500000);
    expect(result.currentBalance).toBeGreaterThan(0);

    // The current payment should match the single-rate Spitzer formula at 5%.
    expect(result.currentMonthlyPayment).toBeCloseTo(
      spitzerMonthlyPayment(500000, 0.05, 360),
      1
    );
  });

  it("applies rate changes over time (payment recomputed at each change)", () => {
    // Start 24 months before the as-of date. Rate is 4% for the first 12 months,
    // then 6%. The as-of date (day 9) is before the payment day (15th).
    const asOf = "2026-08-09";
    const start = new Date(asOf);
    start.setMonth(start.getMonth() - 24);
    start.setDate(5);
    const startDate = start.toISOString().slice(0, 10);

    const rateChangeDate = new Date(start);
    rateChangeDate.setMonth(rateChangeDate.getMonth() + 12);
    const rateChangeIso = rateChangeDate.toISOString().slice(0, 10);

    const result = simulatePrimeAmortization(
      500000,
      startDate,
      360,
      [
        { effective_date: startDate, annual_interest_rate: 0.04 },
        { effective_date: rateChangeIso, annual_interest_rate: 0.06 },
      ],
      "2024-09-15", // payment day 15 > asOf day 9 → no payment this month
      asOf
    );

    expect(result.monthsElapsed).toBe(24);
    expect(result.remainingTermMonths).toBe(336);

    // After the rate rose to 6%, the current payment should be higher than a
    // pure 4% payment would be.
    const paymentAt4 = spitzerMonthlyPayment(500000, 0.04, 360);
    expect(result.currentMonthlyPayment).toBeGreaterThan(paymentAt4);
  });


  it("clamps elapsed months to the original term", () => {
    // Start 400 months ago (beyond a 360-month term) — the loan should be fully paid.
    const start = new Date();
    start.setMonth(start.getMonth() - 400);
    const startDate = start.toISOString().slice(0, 10);

    const result = simulatePrimeAmortization(500000, startDate, 360, [
      { effective_date: startDate, annual_interest_rate: 0.05 },
    ]);

    expect(result.monthsElapsed).toBe(360);
    expect(result.remainingTermMonths).toBe(0);
    expect(result.currentBalance).toBe(0);
  });

  it("counts elapsed months from the start date regardless of the first payout date", () => {
    // The bank counts elapsed months from the loan's start date (e.g. 34/360 for
    // a loan started 13.09.2023). The first payout date does NOT shift this
    // count — it only determines the monthly payment day-of-month, which affects
    // the accrued daily interest component of the total payoff balance.
    const start = new Date();
    start.setMonth(start.getMonth() - 34);
    const startDate = start.toISOString().slice(0, 10);

    const payout = new Date(start);
    payout.setMonth(payout.getMonth() + 1);
    const payoutDate = payout.toISOString().slice(0, 10);

    const history = [
      { effective_date: startDate, annual_interest_rate: 0.05 },
    ];

    const fromSigning = simulatePrimeAmortization(200000, startDate, 360, history);
    const fromPayout = simulatePrimeAmortization(200000, startDate, 360, history, payoutDate);

    // Elapsed months and remaining term are identical — both counted from the
    // start date.
    expect(fromPayout.monthsElapsed).toBe(fromSigning.monthsElapsed);
    expect(fromPayout.remainingTermMonths).toBe(fromSigning.remainingTermMonths);

    // Net principal is identical too (same amortization schedule).
    expect(fromPayout.netPrincipalBalance).toBeCloseTo(fromSigning.netPrincipalBalance, 5);

    // The total payoff balance differs only by the accrued daily interest, which
    // depends on the payment day-of-month derived from the first payout date.
    expect(fromPayout.accruedInterest).toBeGreaterThanOrEqual(0);
    expect(fromPayout.currentBalance).toBeGreaterThanOrEqual(fromPayout.netPrincipalBalance);
  });



  it("computes the current payment at the latest history rate, not the last elapsed month", () => {

    // Start 34 months ago. The most recent BoI rate change (2026-07-09) falls
    // *within* the current month, after the last full elapsed month (which lands
    // in June). The current payment must be recomputed at the latest rate.
    const start = new Date();
    start.setMonth(start.getMonth() - 34);
    const startDate = start.toISOString().slice(0, 10);

    const history = [
      { effective_date: startDate, annual_interest_rate: 0.0545 },
      { effective_date: "2026-05-28", annual_interest_rate: 0.0445 },
      { effective_date: "2026-07-09", annual_interest_rate: 0.042 },
    ];

    const result = simulatePrimeAmortization(200000, startDate, 360, history);

    // The current payment should be computed at the latest rate (0.042) over the
    // remaining term at the current *net principal* balance — not at the rate of
    // the last elapsed month (0.0445). The total payoff balance includes accrued
    // daily interest, which is not part of the monthly payment base.
    expect(result.currentMonthlyPayment).toBeCloseTo(
      spitzerMonthlyPayment(result.netPrincipalBalance, 0.042, result.remainingTermMonths),
      1
    );
    // And it should be lower than a payment computed at the older 0.0445 rate.
    expect(result.currentMonthlyPayment).toBeLessThan(
      spitzerMonthlyPayment(result.netPrincipalBalance, 0.0445, result.remainingTermMonths)
    );
  });

});

// ---------------------------------------------------------------------------
// §4.1b Fixed Unlinked (Klatz) Track Engine
// ---------------------------------------------------------------------------

describe("simulateFixedAmortization", () => {
  it("computes the payment at the original principal over the full term when there is no start date", () => {
    const result = simulateFixedAmortization(800000, "", 360, 0.049);
    expect(result.currentBalance).toBe(800000);
    expect(result.remainingTermMonths).toBe(360);
    expect(result.monthsElapsed).toBe(0);
    // No start date → elapsed = 0, but the payment is still computed at the
    // original principal over the full term (so the form shows a meaningful
    // value before the user enters a start date).
    expect(result.currentMonthlyPayment).toBeCloseTo(
      spitzerMonthlyPayment(800000, 0.049, 360),
      1
    );
  });

  it("computes the payment when the start date is invalid", () => {
    const result = simulateFixedAmortization(800000, "not-a-date", 360, 0.049);
    expect(result.currentBalance).toBe(800000);
    expect(result.remainingTermMonths).toBe(360);
    expect(result.currentMonthlyPayment).toBeCloseTo(
      spitzerMonthlyPayment(800000, 0.049, 360),
      1
    );
  });


  it("matches the hand-computed Klatz spec values (800k @ 4.9%, 360m, 34 elapsed)", () => {
    // Spec: Original 800,000 @ 4.90%, 360 months, 34 months elapsed.
    // Expected: PMT ≈ 4,245.81, net principal ≈ 764,365, remaining 326.
    // Started 13.09.2023, first payout 10.10.2023 (payment day 10th). As of
    // 2026-08-09 (day 9 < payment day 10) exactly 34 months have elapsed.
    const result = simulateFixedAmortization(
      800000,
      "2023-09-13",
      360,
      0.049,
      "2023-10-10",
      "2026-08-09"
    );

    expect(result.monthsElapsed).toBe(34);
    expect(result.remainingTermMonths).toBe(326);

    // Monthly payment matches the Spitzer formula at origination.
    expect(result.currentMonthlyPayment).toBeCloseTo(4245.81, 1);

    // Net principal balance matches the hand-computed value (within rounding).
    expect(result.netPrincipalBalance).toBeCloseTo(764365.28, 0);

    // Daily interest accrual ≈ 102.61/day.
    const dailyInterest = result.netPrincipalBalance * (0.049 / 365);
    expect(dailyInterest).toBeCloseTo(102.61, 1);

    // Total payoff balance = net principal + accrued daily interest.
    expect(result.currentBalance).toBeGreaterThanOrEqual(result.netPrincipalBalance);
    expect(result.accruedInterest).toBeGreaterThanOrEqual(0);
  });


  it("produces a constant payment that never changes (immutable rate)", () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const startDate = start.toISOString().slice(0, 10);

    const result = simulateFixedAmortization(500000, startDate, 360, 0.05);

    // The current payment equals the origination payment (fixed rate).
    expect(result.currentMonthlyPayment).toBeCloseTo(
      spitzerMonthlyPayment(500000, 0.05, 360),
      1
    );
  });

  it("clamps elapsed months to the original term", () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 400);
    const startDate = start.toISOString().slice(0, 10);

    const result = simulateFixedAmortization(500000, startDate, 360, 0.05);

    expect(result.monthsElapsed).toBe(360);
    expect(result.remainingTermMonths).toBe(0);
    expect(result.currentBalance).toBe(0);
  });

  it("counts elapsed months from the start date regardless of the first payout date", () => {
    const start = new Date();
    start.setMonth(start.getMonth() - 34);
    const startDate = start.toISOString().slice(0, 10);

    const payout = new Date(start);
    payout.setMonth(payout.getMonth() + 1);
    const payoutDate = payout.toISOString().slice(0, 10);

    const fromSigning = simulateFixedAmortization(200000, startDate, 360, 0.05);
    const fromPayout = simulateFixedAmortization(200000, startDate, 360, 0.05, payoutDate);

    // Elapsed months and remaining term are identical — both counted from the
    // start date.
    expect(fromPayout.monthsElapsed).toBe(fromSigning.monthsElapsed);
    expect(fromPayout.remainingTermMonths).toBe(fromSigning.remainingTermMonths);

    // Net principal is identical too (same amortization schedule).
    expect(fromPayout.netPrincipalBalance).toBeCloseTo(fromSigning.netPrincipalBalance, 5);

    // The total payoff balance differs only by the accrued daily interest.
    expect(fromPayout.accruedInterest).toBeGreaterThanOrEqual(0);
    expect(fromPayout.currentBalance).toBeGreaterThanOrEqual(fromPayout.netPrincipalBalance);
  });

  it("anchors the calculation to an explicit as-of date (bank-statement reconciliation)", () => {
    // Klatz spec: 800k @ 4.9%, 360 months, started 13.09.2023, first payout
    // 10.10.2023. As of 2026-08-08 the loan has 34 elapsed months and a net
    // principal of ≈ ₪764,365.28. The as-of date makes the result deterministic
    // so it can be reconciled against a bank statement.
    const result = simulateFixedAmortization(
      800000,
      "2023-09-13",
      360,
      0.049,
      "2023-10-10",
      "2026-08-08"
    );

    expect(result.monthsElapsed).toBe(34);
    expect(result.remainingTermMonths).toBe(326);
    expect(result.netPrincipalBalance).toBeCloseTo(764365.28, 0);

    // The three balance fields are distinct and consistent:
    // totalPayoffBalance = netPrincipalBalance + accruedDailyInterest.
    expect(result.accruedDailyInterest).toBeGreaterThan(0);
    expect(result.totalPayoffBalance).toBeCloseTo(
      result.netPrincipalBalance + result.accruedDailyInterest,
      5
    );
    // Backward-compat aliases mirror the primary fields.
    expect(result.currentBalance).toBeCloseTo(result.totalPayoffBalance, 5);
    expect(result.accruedInterest).toBeCloseTo(result.accruedDailyInterest, 5);
  });

  it("defaults the as-of date to today when none is provided", () => {
    // Start 12 months ago (same day-of-month as today). Because the payment day
    // falls back to the start date's day-of-month, and today is on/after that
    // day, the current month's payment is counted → 13 elapsed months.
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const startDate = start.toISOString().slice(0, 10);

    const result = simulateFixedAmortization(500000, startDate, 360, 0.05);
    expect(result.monthsElapsed).toBe(13);
    expect(result.remainingTermMonths).toBe(347);
  });


  it("counts whole calendar days for accrued interest (2026-08-09 benchmark)", () => {
    // Klatz spec: 800k @ 4.9%, 360 months, started 13.09.2023, first payout
    // 10.10.2023 (payment day = 10th). As of 2026-08-09 (day 9 < payment day 10)
    // the last payment was 2026-07-10 → exactly 30 whole calendar days elapsed.
    const result = simulateFixedAmortization(
      800000,
      "2023-09-13",
      360,
      0.049,
      "2023-10-10",
      "2026-08-09"
    );

    // 34 elapsed months (Aug 10 hasn't happened yet), net principal unchanged.
    expect(result.monthsElapsed).toBe(34);
    expect(result.netPrincipalBalance).toBeCloseTo(764365.28, 0);

    // Daily rate = B × (R/365) ≈ ₪102.6103/day.
    const dailyRate = result.netPrincipalBalance * (0.049 / 365);
    expect(dailyRate).toBeCloseTo(102.6103, 2);

    // 30 whole calendar days → accrued interest = 30 × 102.6103 ≈ ₪3,078.31.
    expect(result.accruedDailyInterest).toBeCloseTo(3078.31, 0);

    // Total payoff = net principal + accrued interest ≈ ₪767,443.59.
    expect(result.totalPayoffBalance).toBeCloseTo(767443.59, 0);
  });

  it("resets accrued interest and increments elapsed months on the payment day (2026-08-10)", () => {
    // On the payment day (Aug 10) the monthly payment is made: elapsed months
    // increments to 35, accrued interest resets to 0, and the net principal is
    // amortized down to ≈ ₪763,245 (the exact figure depends on payment rounding).
    const result = simulateFixedAmortization(
      800000,
      "2023-09-13",
      360,
      0.049,
      "2023-10-10",
      "2026-08-10"
    );

    expect(result.monthsElapsed).toBe(35);
    expect(result.remainingTermMonths).toBe(325);
    expect(result.netPrincipalBalance).toBeCloseTo(763245, -1);
    expect(result.accruedDailyInterest).toBe(0);
    expect(result.totalPayoffBalance).toBeCloseTo(result.netPrincipalBalance, 5);
  });

  it("amortizes a Variable 5Y track at its current block rate (400k @ 4.98%, 34 elapsed)", () => {
    // Variable 5Y benchmark: original 400,000 @ 4.98% (current block), 360-month
    // term, started 13.09.2023, first payout 10.10.2023 (payment day 10th). As
    // of 2026-08-09 (day 9 < payment day 10) exactly 34 months have elapsed.
    // The track amortizes at the constant current-block rate over the elapsed
    // months — it must NOT fall back to a fresh 360-month loan.
    const result = simulateFixedAmortization(
      400000,
      "2023-09-13",
      360,
      0.0498,
      "2023-10-10",
      "2026-08-09"
    );

    // 1. Monthly payout = Spitzer over 360 months on 400,000 at 4.98%.
    expect(result.currentMonthlyPayment).toBeCloseTo(2142.4, 1);

    // 2. Net principal after 34 payments (monthly-compounding annuity balance).
    expect(result.netPrincipalBalance).toBeCloseTo(382423.95, 0);

    // 3. Remaining term = 360 − 34 = 326 months (27 years).
    expect(result.monthsElapsed).toBe(34);
    expect(result.remainingTermMonths).toBe(326);

    // 4. Accrued interest over 30 whole calendar days (last payment 2026-07-10).
    const dailyRate = result.netPrincipalBalance * (0.0498 / 365);
    expect(dailyRate).toBeCloseTo(52.177, 2);
    expect(result.accruedDailyInterest).toBeCloseTo(1565.32, 0);

    // 5. Total estimated payoff = net principal + accrued interest.
    expect(result.totalPayoffBalance).toBeCloseTo(383989.27, 0);
  });

  it("uses fractional-day precision when the as-of date carries a time-of-day", () => {
    // As-of 2026-08-09 at 12:00 local (payment day = 10th → last payment was
    // 2026-07-10). Elapsed = 30.5 days → accrued interest = 30.5 × daily rate.
    const result = simulateFixedAmortization(
      800000,
      "2023-09-13",
      360,
      0.049,
      "2023-10-10",
      new Date(2026, 7, 9, 12, 0, 0) // 2026-08-09 12:00 local
    );

    const dailyRate = result.netPrincipalBalance * (0.049 / 365);
    // 30.5 days × daily rate, rounded to 2 decimals (Agorot).
    expect(result.accruedDailyInterest).toBeCloseTo(30.5 * dailyRate, 2);
    expect(result.accruedDailyInterest).toBeGreaterThan(3078.31); // > 30 whole days
  });
});

// ---------------------------------------------------------------------------
// §4.1d deriveTrackPayoff — shared live payoff derivation (card + form)
// ---------------------------------------------------------------------------

describe("deriveTrackPayoff", () => {
  it("returns null when there is no original principal", () => {
    const track = makeTrack({
      track_type: "FIXED_UNLINKED",
      original_principal: undefined,
      original_term_months: 360,
      annual_interest_rate: 0.05,
    });
    expect(deriveTrackPayoff(track)).toBeNull();
  });

  it("returns null when there is no original term", () => {
    const track = makeTrack({
      track_type: "FIXED_UNLINKED",
      original_principal: 500000,
      original_term_months: undefined,
      remaining_term_months: 0,
      annual_interest_rate: 0.05,
    });
    expect(deriveTrackPayoff(track)).toBeNull();
  });

  it("falls back to remaining_term_months as the original term for older imports", () => {
    // Older profiles only stored remaining_term_months. deriveTrackPayoff treats
    // it as the committed full term so the amortization can still run.
    const track = makeTrack({
      track_type: "FIXED_UNLINKED",
      original_principal: 500000,
      original_term_months: undefined,
      remaining_term_months: 360,
      annual_interest_rate: 0.05,
    });
    const result = deriveTrackPayoff(track);
    expect(result).not.toBeNull();
    expect(result!.remainingTermMonths).toBe(360); // elapsed = 0 (no start date)
  });

  it("derives a non-Prime track via simulateFixedAmortization (matches the direct call)", () => {
    const track = makeTrack({
      track_type: "FIXED_UNLINKED",
      original_principal: 800000,
      original_term_months: 360,
      start_date: "2023-09-13",
      first_payout_date: "2023-10-10",
      annual_interest_rate: 0.049,
    });
    const derived = deriveTrackPayoff(track);
    const direct = simulateFixedAmortization(
      800000,
      "2023-09-13",
      360,
      0.049,
      "2023-10-10"
    );
    expect(derived).not.toBeNull();
    expect(derived!.netPrincipalBalance).toBeCloseTo(direct.netPrincipalBalance, 5);
    expect(derived!.totalPayoffBalance).toBeCloseTo(direct.totalPayoffBalance, 5);
    expect(derived!.currentMonthlyPayment).toBeCloseTo(direct.currentMonthlyPayment, 5);
    expect(derived!.remainingTermMonths).toBe(direct.remainingTermMonths);
  });

  it("derives a Prime track along its BoI rate timeline (matches the direct call)", () => {
    const startDate = "2023-01-05";
    const history = [
      { effective_date: startDate, annual_interest_rate: 0.039 },
      { effective_date: "2023-02-23", annual_interest_rate: 0.044 },
      { effective_date: "2023-05-25", annual_interest_rate: 0.049 },
    ];
    const track = makeTrack({
      track_type: "PRIME",
      original_principal: 500000,
      original_term_months: 360,
      start_date: startDate,
      annual_interest_rate: 0.049,
      rate_history: history,
    });
    const derived = deriveTrackPayoff(track);
    const direct = simulatePrimeAmortization(500000, startDate, 360, history);
    expect(derived).not.toBeNull();
    expect(derived!.netPrincipalBalance).toBeCloseTo(direct.netPrincipalBalance, 5);
    expect(derived!.totalPayoffBalance).toBeCloseTo(direct.totalPayoffBalance, 5);
    expect(derived!.currentMonthlyPayment).toBeCloseTo(direct.currentMonthlyPayment, 5);
    expect(derived!.remainingTermMonths).toBe(direct.remainingTermMonths);
  });

  it("returns null for a Prime track without a start date or rate history", () => {
    const track = makeTrack({
      track_type: "PRIME",
      original_principal: 500000,
      original_term_months: 360,
      annual_interest_rate: 0.05,
    });
    expect(deriveTrackPayoff(track)).toBeNull();
  });

  it("produces a total payoff balance that includes accrued daily interest", () => {
    // A fully-configured fixed track should show totalPayoffBalance >= net
    // principal (accrued interest is non-negative).
    const track = makeTrack({
      track_type: "FIXED_UNLINKED",
      original_principal: 800000,
      original_term_months: 360,
      start_date: "2023-09-13",
      first_payout_date: "2023-10-10",
      annual_interest_rate: 0.049,
    });
    const derived = deriveTrackPayoff(track);
    expect(derived).not.toBeNull();
    expect(derived!.accruedDailyInterest).toBeGreaterThanOrEqual(0);
    expect(derived!.totalPayoffBalance).toBeCloseTo(
      derived!.netPrincipalBalance + derived!.accruedDailyInterest,
      5
    );
  });
});




describe("computeAccruedDailyInterest", () => {

  it("returns 0 for a zero net principal", () => {
    expect(computeAccruedDailyInterest(0, 0.05, 10)).toBe(0);
  });

  it("returns 0 on the payment day (no days elapsed since the last payment)", () => {
    // Payment day = 10th; as-of 2026-08-10 → 0 days elapsed.
    expect(computeAccruedDailyInterest(191102, 0.049, 10, "2026-08-10")).toBe(0);
  });

  it("computes whole-day accrued interest for a date-string as-of (30 days)", () => {
    // As-of 2026-08-09 (day 9 < payment day 10) → last payment 2026-07-10,
    // exactly 30 whole days elapsed. 191,102 @ 4.9% → daily ≈ ₪25.66.
    const accrued = computeAccruedDailyInterest(191102, 0.049, 10, "2026-08-09");
    const dailyRate = 191102 * (0.049 / 365);
    expect(accrued).toBeCloseTo(30 * dailyRate, 2);
  });

  it("uses fractional-day precision for a Date as-of with a time-of-day", () => {
    // As-of 2026-08-09 12:00 local → 30.5 days elapsed since 2026-07-10.
    const accrued = computeAccruedDailyInterest(
      191102,
      0.049,
      10,
      new Date(2026, 7, 9, 12, 0, 0)
    );
    const dailyRate = 191102 * (0.049 / 365);
    expect(accrued).toBeCloseTo(30.5 * dailyRate, 2);
  });

  it("truncates elapsed days to 1 decimal place", () => {
    // As-of 2026-08-09 12:34:56 local → 30.524 days → truncated to 30.5.
    const accrued = computeAccruedDailyInterest(
      191102,
      0.049,
      10,
      new Date(2026, 7, 9, 12, 34, 56)
    );
    const dailyRate = 191102 * (0.049 / 365);
    expect(accrued).toBeCloseTo(30.5 * dailyRate, 2);
  });

  it("rounds the accrued interest to 2 decimal places (Agorot)", () => {
    const accrued = computeAccruedDailyInterest(191102, 0.049, 10, "2026-08-09");
    // The function rounds via .toFixed(2); re-rounding to 2 decimals must be a
    // no-op (i.e. the value is already at Agorot precision).
    expect(accrued).toBeCloseTo(Number(accrued.toFixed(2)), 10);
  });

});




describe("fixedTrackGapPenalty", () => {

  it("returns 0 when the loan rate is at or below the BoI average rate", () => {
    const penalty = fixedTrackGapPenalty({
      netPrincipalBalance: 764365.28,
      currentRate: 0.049,
      boiAverageRate: 0.05, // loan rate below market → no gap
      remainingMonths: 326,
    });
    expect(penalty).toBe(0);
  });

  it("returns 0 for a zero balance or zero remaining months", () => {
    expect(
      fixedTrackGapPenalty({
        netPrincipalBalance: 0,
        currentRate: 0.049,
        boiAverageRate: 0.035,
        remainingMonths: 326,
      })
    ).toBe(0);
    expect(
      fixedTrackGapPenalty({
        netPrincipalBalance: 764365.28,
        currentRate: 0.049,
        boiAverageRate: 0.035,
        remainingMonths: 0,
      })
    ).toBe(0);
  });

  it("computes a positive penalty when the loan rate exceeds the BoI average", () => {
    // 764,365.28 @ 4.9% vs BoI avg 3.5% over 326 months.
    // Gap = 1.4% annual → ~0.1167% monthly on the balance.
    const penalty = fixedTrackGapPenalty({
      netPrincipalBalance: 764365.28,
      currentRate: 0.049,
      boiAverageRate: 0.035,
      remainingMonths: 326,
    });
    expect(penalty).toBeGreaterThan(0);

    // The penalty should be a meaningful fraction of the balance (the bank
    // compensates itself for the rate gap over the remaining term).
    expect(penalty).toBeGreaterThan(10000);
    expect(penalty).toBeLessThan(764365.28);
  });

  it("produces a larger penalty for a larger rate gap", () => {
    const smallGap = fixedTrackGapPenalty({
      netPrincipalBalance: 500000,
      currentRate: 0.05,
      boiAverageRate: 0.04,
      remainingMonths: 120,
    });
    const largeGap = fixedTrackGapPenalty({
      netPrincipalBalance: 500000,
      currentRate: 0.06,
      boiAverageRate: 0.04,
      remainingMonths: 120,
    });
    expect(largeGap).toBeGreaterThan(smallGap);
  });

  it("produces a larger penalty for a longer remaining term", () => {
    const shortTerm = fixedTrackGapPenalty({
      netPrincipalBalance: 500000,
      currentRate: 0.05,
      boiAverageRate: 0.04,
      remainingMonths: 60,
    });
    const longTerm = fixedTrackGapPenalty({
      netPrincipalBalance: 500000,
      currentRate: 0.05,
      boiAverageRate: 0.04,
      remainingMonths: 120,
    });
    expect(longTerm).toBeGreaterThan(shortTerm);
  });

  it("uses the current rate as the discount rate by default", () => {
    const defaultDiscount = fixedTrackGapPenalty({
      netPrincipalBalance: 500000,
      currentRate: 0.05,
      boiAverageRate: 0.04,
      remainingMonths: 120,
    });
    const explicitDiscount = fixedTrackGapPenalty({
      netPrincipalBalance: 500000,
      currentRate: 0.05,
      boiAverageRate: 0.04,
      remainingMonths: 120,
      discountRate: 0.05,
    });
    expect(defaultDiscount).toBeCloseTo(explicitDiscount, 5);
  });
});

// ---------------------------------------------------------------------------
// §4.1c Variable 5Y Reset Window (derived, never entered manually)
// ---------------------------------------------------------------------------

describe("nextResetDate", () => {
  it("returns 5 years after the start date on the payment day-of-month", () => {
    // Started 13.09.2023, first payout 10.10.2023 → payment day = 10th.
    // Reset = 10.09.2028.
    const reset = nextResetDate("2023-09-13", "2023-10-10");
    expect(reset).not.toBeNull();
    expect(reset!.getFullYear()).toBe(2028);
    expect(reset!.getMonth()).toBe(8); // September (0-indexed)
    expect(reset!.getDate()).toBe(10);
  });

  it("falls back to the start date's day-of-month when there is no first payout date", () => {
    // Started 13.09.2023, no payout date → payment day = 13th. Reset = 13.09.2028.
    const reset = nextResetDate("2023-09-13");
    expect(reset).not.toBeNull();
    expect(reset!.getFullYear()).toBe(2028);
    expect(reset!.getMonth()).toBe(8);
    expect(reset!.getDate()).toBe(13);
  });

  it("returns null for an empty or invalid start date", () => {
    expect(nextResetDate("")).toBeNull();
    expect(nextResetDate("not-a-date")).toBeNull();
  });
});

describe("monthsToNextReset", () => {
  it("matches the hand-computed months until reset for the demo Variable 5Y track", () => {
    // Started 13.09.2023, first payout 10.10.2023 → reset 10.09.2028. As of
    // 09.08.2026 (day 9 < payment day 10) that is 25 whole months away.
    const months = monthsToNextReset("2023-09-13", "2023-10-10", "2026-08-09");
    expect(months).toBe(25);
  });

  it("counts a full month when the as-of day is on/after the reset day", () => {
    // As of 10.08.2026 (day 10 >= reset day 10) the reset is 25 months away
    // (Aug 2026 → Sep 2028 = 25 months, day 10 >= day 10 → no adjustment).
    const months = monthsToNextReset("2023-09-13", "2023-10-10", "2026-08-10");
    expect(months).toBe(25);
  });

  it("returns null when there is no start date to derive from", () => {
    expect(monthsToNextReset("", "2023-10-10")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §4.6 Early Exit Cost Helpers
// ---------------------------------------------------------------------------

describe("clampRate", () => {
  it("clamps a rate to 6 decimal places", () => {
    expect(clampRate(0.0551234567)).toBeCloseTo(0.055123, 6);
  });

  it("rounds a negative rate to 6 decimal places (does not sanitize sign)", () => {
    expect(clampRate(-0.01)).toBe(-0.01);
    expect(clampRate(-0.0551234567)).toBeCloseTo(-0.055123, 6);
  });


  it("returns 0 for NaN", () => {
    expect(clampRate(NaN)).toBe(0);
  });

  it("passes through a clean rate unchanged", () => {
    expect(clampRate(0.05)).toBe(0.05);
  });
});

describe("computeAmlatPeareiRibit", () => {
  it("returns 0 for a PRIME track (Prime follows the BoI base rate, no interest gap)", () => {
    const primeTrack = makeTrack({
      track_type: "PRIME",
      principal_balance: 500000,
      annual_interest_rate: 0.06,
      remaining_term_months: 120,
    });
    expect(computeAmlatPeareiRibit(primeTrack, 0.04)).toBe(0);
  });

  it("returns 0 when the loan rate is at or below the BoI average rate", () => {
    const track = makeTrack({
      track_type: "FIXED_UNLINKED",
      principal_balance: 500000,
      annual_interest_rate: 0.04,
      remaining_term_months: 120,
    });
    expect(computeAmlatPeareiRibit(track, 0.04)).toBe(0);
  });

  it("returns 0 for a zero balance or zero remaining months", () => {
    const zeroBalance = makeTrack({
      track_type: "FIXED_UNLINKED",
      principal_balance: 0,
      annual_interest_rate: 0.06,
      remaining_term_months: 120,
    });
    const zeroTerm = makeTrack({
      track_type: "FIXED_UNLINKED",
      principal_balance: 500000,
      annual_interest_rate: 0.06,
      remaining_term_months: 0,
    });
    expect(computeAmlatPeareiRibit(zeroBalance, 0.04)).toBe(0);
    expect(computeAmlatPeareiRibit(zeroTerm, 0.04)).toBe(0);
  });

  it("computes a positive penalty when the loan rate exceeds the BoI average", () => {
    const track = makeTrack({
      track_type: "FIXED_UNLINKED",
      principal_balance: 500000,
      annual_interest_rate: 0.06,
      remaining_term_months: 120,
    });
    const penalty = computeAmlatPeareiRibit(track, 0.04);
    expect(penalty).toBeGreaterThan(0);
    expect(penalty).toBeLessThan(500000);
  });

  it("produces a larger penalty for a larger rate gap", () => {
    const smallGapTrack = makeTrack({
      track_type: "FIXED_UNLINKED",
      principal_balance: 500000,
      annual_interest_rate: 0.05,
      remaining_term_months: 120,
    });
    const largeGapTrack = makeTrack({
      track_type: "FIXED_UNLINKED",
      principal_balance: 500000,
      annual_interest_rate: 0.06,
      remaining_term_months: 120,
    });
    const smallGap = computeAmlatPeareiRibit(smallGapTrack, 0.04);
    const largeGap = computeAmlatPeareiRibit(largeGapTrack, 0.04);
    expect(largeGap).toBeGreaterThan(smallGap);
  });
});



describe("totalExitCost", () => {
  it("sums the interest-gap penalty, notice fee, and operational fee", () => {
    const track = makeTrack({
      amlat_pearei_ribit: 20000,
      notice_fee: 720,
      operational_fee: 60,
    });
    expect(totalExitCost(track)).toBe(20000 + 720 + 60);
  });

  it("defaults the operational fee to 60 when not set", () => {
    const track = makeTrack({
      amlat_pearei_ribit: 1000,
      notice_fee: 100,
      operational_fee: undefined as any,
    });
    expect(totalExitCost(track)).toBe(1000 + 100 + 60);
  });

  it("returns 0 when all fees are zero", () => {
    const track = makeTrack({
      amlat_pearei_ribit: 0,
      notice_fee: 0,
      operational_fee: 0,
    });
    expect(totalExitCost(track)).toBe(0);
  });
});






