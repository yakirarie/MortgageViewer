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
  suggestOptimalAllocation,
  investmentFutureValue,
  investmentNetGain,
  comparePayoffVsInvest,
  refinancingBreakeven,
  recommendActionForTrack,
  rankTracksByPriority,
  currentEffectiveRate,
  effectiveRateForMonth,
  spitzerMonthlyPaymentWithHistory,
  simulatePrimeAmortization,
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
    early_exit_penalty: 0,
    notice_fee: 0,
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
    expect(result.penaltyPaid).toBe(0);
    expect(result.noticeFeePaid).toBe(0);
    expect(result.netPayoffBenefit).toBeCloseTo(133987.45, 0);
  });

  it("subtracts penalty and notice fee from the benefit", () => {
    const withCosts = makeTrack({
      ...prime,
      early_exit_penalty: 20000,
      notice_fee: 720,
    });
    const result = netPayoffBenefit({ track: withCosts, lumpSum: 100000 });
    expect(result.netPayoffBenefit).toBeCloseTo(133987.45 - 20000 - 720, 0);
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
// §4.3 Alternative Opportunity Cost
// ---------------------------------------------------------------------------

describe("investmentFutureValue / investmentNetGain", () => {
  it("matches the hand-computed compound growth value", () => {
    expect(investmentFutureValue(50000, 0.08, 24)).toBeCloseTo(58644.4, 0);
    expect(investmentNetGain(50000, 0.08, 24)).toBeCloseTo(8644.4, 0);
  });

  it("returns 0 for a non-positive lump sum", () => {
    expect(investmentFutureValue(0, 0.08, 24)).toBe(0);
    expect(investmentFutureValue(-100, 0.08, 24)).toBe(0);
  });
});

describe("comparePayoffVsInvest", () => {
  it("declares payoff the winner when NPB clearly exceeds investment gain", () => {
    expect(comparePayoffVsInvest(50000, 10000, 100000)).toBe("PAYOFF_WINS");
  });

  it("declares investing the winner when investment gain clearly exceeds NPB", () => {
    expect(comparePayoffVsInvest(5000, 20000, 100000)).toBe("INVEST_WINS");
  });

  it("calls it roughly equal within the 1% band", () => {
    expect(comparePayoffVsInvest(10000, 10050, 100000)).toBe("ROUGHLY_EQUAL");
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
      early_exit_penalty: 0,
      principal_balance: 100000,
    });
    const rec = recommendActionForTrack(highRateNoPenalty, weightedRate, 0.043);
    expect(rec.action).toBe("PAY_OFF_NOW");
  });

  it("recommends WAIT_FOR_RESET when reset is imminent and rule 1 doesn't already match", () => {
    // Rule 1 requires rate > weighted+0.5% AND zero penalty. Give this track a
    // small non-zero penalty so rule 1 is skipped and rule 2 (reset window) is
    // the first actual match, per the strict top-to-bottom rule order in PRD §4.5.
    const nearReset = makeTrack({
      track_id: "near-reset",
      annual_interest_rate: weightedRate + 0.01,
      early_exit_penalty: 500,
      months_to_reset: 3,
      principal_balance: 100000,
    });
    const rec = recommendActionForTrack(nearReset, weightedRate, 0.043);
    expect(rec.action).toBe("WAIT_FOR_RESET");
  });

  it("rule 1 (pay off now) preempts rule 2 (reset) when both conditions are met, per strict priority order", () => {
    const bothMatch = makeTrack({
      track_id: "both-match",
      annual_interest_rate: weightedRate + 0.01,
      early_exit_penalty: 0,
      months_to_reset: 3,
      principal_balance: 100000,
    });
    const rec = recommendActionForTrack(bothMatch, weightedRate, 0.043);
    expect(rec.action).toBe("PAY_OFF_NOW");
  });

  it("recommends HOLD when penalty exposure is high relative to balance", () => {
    const highPenalty = makeTrack({
      track_id: "high-penalty",
      annual_interest_rate: weightedRate, // not above average, so rule 1 doesn't fire
      principal_balance: 100000,
      early_exit_penalty: 8000, // 8% of balance
    });
    const rec = recommendActionForTrack(highPenalty, weightedRate, 0.043);
    expect(rec.action).toBe("HOLD");
  });

  it("recommends CONSIDER_REFINANCING for a large market-rate gap with low penalty", () => {
    const refiCandidate = makeTrack({
      track_id: "refi",
      annual_interest_rate: 0.043 + 0.01, // clearly above reference market rate
      principal_balance: 100000,
      early_exit_penalty: 1000, // 1% of balance, under the 2% threshold
    });
    // Use a low weighted rate so rule 1 (pay off now) doesn't preempt this
    const rec = recommendActionForTrack(refiCandidate, 0.043 + 0.01, 0.043);
    expect(rec.action).toBe("CONSIDER_REFINANCING");
  });
});

describe("rankTracksByPriority", () => {
  it("ranks a high-rate, low-penalty track above a low-rate, high-penalty track", () => {
    const weightedRate = weightedAverageRate(demoProfile);
    const good = makeTrack({
      track_id: "good",
      annual_interest_rate: weightedRate + 0.02,
      early_exit_penalty: 0,
      principal_balance: 100000,
    });
    const bad = makeTrack({
      track_id: "bad",
      annual_interest_rate: weightedRate - 0.01,
      early_exit_penalty: 20000,
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
    // Start 12 months ago at a constant 5% rate, 360-month term.
    const start = new Date();
    start.setMonth(start.getMonth() - 12);
    const startDate = start.toISOString().slice(0, 10);

    const result = simulatePrimeAmortization(500000, startDate, 360, [
      { effective_date: startDate, annual_interest_rate: 0.05 },
    ]);

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
    // Start 24 months ago. Rate is 4% for the first 12 months, then 6%.
    const start = new Date();
    start.setMonth(start.getMonth() - 24);
    const startDate = start.toISOString().slice(0, 10);

    const rateChangeDate = new Date(start);
    rateChangeDate.setMonth(rateChangeDate.getMonth() + 12);
    const rateChangeIso = rateChangeDate.toISOString().slice(0, 10);

    const result = simulatePrimeAmortization(500000, startDate, 360, [
      { effective_date: startDate, annual_interest_rate: 0.04 },
      { effective_date: rateChangeIso, annual_interest_rate: 0.06 },
    ]);

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



