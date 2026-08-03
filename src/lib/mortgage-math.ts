// Mashkanta Decision Engine — core math library
// Implements PRD §4 (Mathematical & Logic Engine Specs) as pure, side-effect-free
// functions. No track object is ever mutated. Nothing here throws on zero/missing
// numeric input — everything degrades to a defined value (0, null, or Infinity)
// per PRD §1.4 / §2's "forgiving data entry" principle. UI layers decide how to
// render null/Infinity ("N/A", "Never breaks even", etc.) — this module never
// produces user-facing strings.

import type {
  Track,
  PayoffReductionMode,
  TrackRecommendation,
} from "./types";

export type { PayoffReductionMode };

// ---------------------------------------------------------------------------
// §4.1 Core Portfolio Math
// ---------------------------------------------------------------------------

/** Weighted average interest rate across tracks. Returns 0 for an empty/zero-balance portfolio. */
export function weightedAverageRate(tracks: Track[]): number {
  const totalBalance = tracks.reduce((sum, t) => sum + t.principal_balance, 0);
  if (totalBalance <= 0) return 0;
  const weighted = tracks.reduce(
    (sum, t) => sum + t.principal_balance * t.annual_interest_rate,
    0
  );
  return weighted / totalBalance;
}

/**
 * Spitzer (French/annuity) monthly repayment.
 * Falls back to straight-line division when the rate is 0 (edge case per PRD §4.1).
 * Returns 0 if balance <= 0 or term <= 0 (nothing to amortize).
 */
export function spitzerMonthlyPayment(
  balance: number,
  annualInterestRate: number,
  remainingTermMonths: number
): number {
  if (balance <= 0 || remainingTermMonths <= 0) return 0;

  const r = annualInterestRate / 12;
  const n = remainingTermMonths;

  if (r === 0) {
    return balance / n;
  }

  const factor = Math.pow(1 + r, n);
  return (balance * r * factor) / (factor - 1);
}

/**
 * The monthly payment actually in effect for a track: the manual override if the
 * user set one, otherwise the Spitzer-calculated payment (PRD §2.2, field 7/8).
 */
export function effectiveMonthlyPayment(track: Track): number {
  if (track.is_payment_manual_override) return track.monthly_repayment;
  return spitzerMonthlyPayment(
    track.principal_balance,
    track.annual_interest_rate,
    track.remaining_term_months
  );
}

/**
 * Total remaining interest for a fixed balance/payment/term combination.
 * Can legitimately go negative if `monthlyPayment` is below the amortizing
 * minimum (manual override set too low) — PRD §4.1 says the UI must show
 * "N/A — payment below amortizing minimum" in that case, so this function
 * returns the raw (possibly negative) number and lets the caller decide.
 */
export function totalRemainingInterest(
  balance: number,
  monthlyPayment: number,
  termMonths: number
): number {
  return monthlyPayment * termMonths - balance;
}

/** Convenience wrapper: remaining interest for a track using its effective payment. */
export function remainingInterestForTrack(track: Track): number {
  return totalRemainingInterest(
    track.principal_balance,
    effectiveMonthlyPayment(track),
    track.remaining_term_months
  );
}

export interface PortfolioTotals {
  totalBalance: number;
  weightedRate: number;
  blendedMonthlyPayment: number;
  /** Sum of remaining interest across tracks with a *valid* (non-negative) figure. */
  totalRemainingInterest: number;
  /** track_ids excluded from totalRemainingInterest because their remaining interest was negative. */
  invalidInterestTrackIds: string[];
}

/** Portfolio-level KPI row values (PRD §3.1). */
export function portfolioTotals(tracks: Track[]): PortfolioTotals {
  const totalBalance = tracks.reduce((sum, t) => sum + t.principal_balance, 0);
  const blendedMonthlyPayment = tracks.reduce(
    (sum, t) => sum + effectiveMonthlyPayment(t),
    0
  );

  let totalRemInterest = 0;
  const invalidInterestTrackIds: string[] = [];
  for (const t of tracks) {
    const ri = remainingInterestForTrack(t);
    if (ri < 0) {
      invalidInterestTrackIds.push(t.track_id);
    } else {
      totalRemInterest += ri;
    }
  }

  return {
    totalBalance,
    weightedRate: weightedAverageRate(tracks),
    blendedMonthlyPayment,
    totalRemainingInterest: totalRemInterest,
    invalidInterestTrackIds,
  };
}

// ---------------------------------------------------------------------------
// §4.2 Early Payoff — Net Payoff Benefit (NPB)
// ---------------------------------------------------------------------------

/**
 * Months required to pay off `balance` at `monthlyPayment` given `annualInterestRate`.
 * Used by the "reduce term" payoff mode. Returns Infinity if the payment doesn't
 * even cover monthly interest (balance never amortizes down).
 */
export function monthsToPayoff(
  balance: number,
  annualInterestRate: number,
  monthlyPayment: number
): number {
  if (balance <= 0) return 0;
  if (monthlyPayment <= 0) return Infinity;

  const r = annualInterestRate / 12;
  if (r === 0) return balance / monthlyPayment;

  const monthlyInterest = balance * r;
  if (monthlyPayment <= monthlyInterest) return Infinity; // never pays down

  const ratio = 1 - (r * balance) / monthlyPayment;
  return -Math.log(ratio) / Math.log(1 + r);
}

export interface NpbInput {
  track: Track;
  lumpSum: number; // ₪ allocated to this track (L_i)
  mode?: PayoffReductionMode; // default "reduce_term" per PRD §4.2
  noticeWaived?: boolean; // 10-day advance notice rule, PRD §4.2
}

export interface NpbResult {
  interestSaved: number;
  penaltyPaid: number;
  noticeFeePaid: number;
  netPayoffBenefit: number;
}

/**
 * Net Payoff Benefit for allocating `lumpSum` to a single track.
 * `lumpSum` is clamped to the track's balance — you can't pay off more than is owed.
 */
export function netPayoffBenefit({
  track,
  lumpSum,
  mode = "reduce_term",
  noticeWaived = false,
}: NpbInput): NpbResult {
  const L = Math.max(0, Math.min(lumpSum, track.principal_balance));
  const originalPayment = effectiveMonthlyPayment(track);
  const interestBefore = totalRemainingInterest(
    track.principal_balance,
    originalPayment,
    track.remaining_term_months
  );

  const newBalance = track.principal_balance - L;

  let interestAfter: number;
  if (mode === "reduce_payment") {
    const newPayment = spitzerMonthlyPayment(
      newBalance,
      track.annual_interest_rate,
      track.remaining_term_months
    );
    interestAfter = totalRemainingInterest(
      newBalance,
      newPayment,
      track.remaining_term_months
    );
  } else {
    // reduce_term: keep the original payment, solve for the new (shorter) term
    const newTerm = monthsToPayoff(
      newBalance,
      track.annual_interest_rate,
      originalPayment
    );
    const boundedTerm = Number.isFinite(newTerm) ? newTerm : track.remaining_term_months;
    interestAfter = totalRemainingInterest(newBalance, originalPayment, boundedTerm);
  }

  const interestSaved = interestBefore - interestAfter;
  const penaltyPaid = L > 0 ? track.early_exit_penalty : 0;
  const noticeFeePaid = noticeWaived || L === 0 ? 0 : track.notice_fee;
  const netPayoffBenefit = interestSaved - penaltyPaid - noticeFeePaid;

  return { interestSaved, penaltyPaid, noticeFeePaid, netPayoffBenefit };
}

export interface AllocationSuggestion {
  track_id: string;
  allocated: number;
}

/**
 * Greedy "suggest optimal allocation" per PRD §4.2: rank tracks by NPB-per-shekel
 * efficiency (computed at full-payoff trial amount), then fill each track's
 * min(balance, remaining lump sum) in that order until the lump sum is exhausted.
 * This is a heuristic, not a guaranteed-optimal allocation — label it as such in the UI.
 */
export function suggestOptimalAllocation(
  tracks: Track[],
  lumpSum: number,
  opts: { mode?: PayoffReductionMode; noticeWaived?: boolean } = {}
): AllocationSuggestion[] {
  const ranked = tracks
    .map((track) => {
      const trialL = track.principal_balance;
      const { netPayoffBenefit: npb } = netPayoffBenefit({
        track,
        lumpSum: trialL,
        mode: opts.mode,
        noticeWaived: opts.noticeWaived,
      });
      const efficiency = trialL > 0 ? npb / trialL : -Infinity;
      return { track, efficiency };
    })
    .sort((a, b) => b.efficiency - a.efficiency);

  let remaining = Math.max(0, lumpSum);
  const allocations: AllocationSuggestion[] = [];

  for (const { track } of ranked) {
    if (remaining <= 0) break;
    const allocated = Math.min(track.principal_balance, remaining);
    if (allocated > 0) {
      allocations.push({ track_id: track.track_id, allocated });
      remaining -= allocated;
    }
  }

  return allocations;
}

// ---------------------------------------------------------------------------
// §4.3 Alternative Opportunity Cost (Invest Instead)
// ---------------------------------------------------------------------------

/** Future value of investing `lumpSum` for `termMonths` at `annualReturn`, compounded monthly. */
export function investmentFutureValue(
  lumpSum: number,
  annualReturn: number,
  termMonths: number
): number {
  if (lumpSum <= 0) return 0;
  return lumpSum * Math.pow(1 + annualReturn / 12, termMonths);
}

export function investmentNetGain(
  lumpSum: number,
  annualReturn: number,
  termMonths: number
): number {
  return investmentFutureValue(lumpSum, annualReturn, termMonths) - lumpSum;
}

export type PayoffVsInvestVerdict = "PAYOFF_WINS" | "INVEST_WINS" | "ROUGHLY_EQUAL";

/**
 * Compares total NPB across allocated tracks against the opportunity cost of
 * investing the same lump sum instead. "Roughly equal" is a 1%-of-lumpSum band,
 * per PRD §4.3.
 */
export function comparePayoffVsInvest(
  totalNpb: number,
  investGain: number,
  lumpSum: number
): PayoffVsInvestVerdict {
  const band = Math.abs(lumpSum) * 0.01;
  const diff = totalNpb - investGain;
  if (Math.abs(diff) < band) return "ROUGHLY_EQUAL";
  return diff > 0 ? "PAYOFF_WINS" : "INVEST_WINS";
}

// ---------------------------------------------------------------------------
// §4.4 Refinancing (Mirzur) Breakeven
// ---------------------------------------------------------------------------

export interface RefinanceInput {
  oldMonthlyRepayment: number;
  newMonthlyRepayment: number;
  totalSwitchingCosts: number; // penalties + notice fees (unless waived) + other fees
  oldTermRemainingMonths: number;
  newTermMonths: number;
}

export interface RefinanceResult {
  deltaMonthlyRepayment: number;
  /** null when the new deal never breaks even (delta <= 0) */
  breakevenMonth: number | null;
  lifetimeNetSavings: number;
}

export function refinancingBreakeven({
  oldMonthlyRepayment,
  newMonthlyRepayment,
  totalSwitchingCosts,
  oldTermRemainingMonths,
  newTermMonths,
}: RefinanceInput): RefinanceResult {
  const deltaMonthlyRepayment = oldMonthlyRepayment - newMonthlyRepayment;

  const breakevenMonth =
    deltaMonthlyRepayment > 0 ? totalSwitchingCosts / deltaMonthlyRepayment : null;

  const horizon = Math.min(oldTermRemainingMonths, newTermMonths);
  const lifetimeNetSavings = deltaMonthlyRepayment * horizon - totalSwitchingCosts;

  return { deltaMonthlyRepayment, breakevenMonth, lifetimeNetSavings };
}

// ---------------------------------------------------------------------------
// §4.5 Recommendation Engine
// ---------------------------------------------------------------------------

/**
 * Deterministic per-track recommendation, first matching rule wins, per PRD §4.5.
 */
export function recommendActionForTrack(
  track: Track,
  weightedRate: number,
  referenceMarketRate: number
): TrackRecommendation {
  const penaltyRatio =
    track.principal_balance > 0 ? track.early_exit_penalty / track.principal_balance : 0;

  // Rule 1: clearly above-average rate, no exit penalty
  if (track.annual_interest_rate > weightedRate + 0.005 && track.early_exit_penalty === 0) {
    return {
      track_id: track.track_id,
      action: "PAY_OFF_NOW",
      driver: `Rate is ${((track.annual_interest_rate - weightedRate) * 100).toFixed(
        1
      )}pp above your portfolio average, no exit penalty`,
    };
  }

  // Rule 2: reset window imminent
  if (track.months_to_reset !== null && track.months_to_reset <= 6) {
    return {
      track_id: track.track_id,
      action: "WAIT_FOR_RESET",
      driver: `Reset window in ${track.months_to_reset} month(s) — penalty/rate will renegotiate naturally`,
    };
  }

  // Rule 3: large gap to market rate, low penalty relative to balance
  if (track.annual_interest_rate > referenceMarketRate + 0.0075 && penaltyRatio < 0.02) {
    return {
      track_id: track.track_id,
      action: "CONSIDER_REFINANCING",
      driver: `Rate is ${((track.annual_interest_rate - referenceMarketRate) * 100).toFixed(
        1
      )}pp above the market reference, penalty exposure is low (${(penaltyRatio * 100).toFixed(
        1
      )}% of balance)`,
    };
  }

  // Rule 4: high penalty exposure relative to balance
  if (penaltyRatio >= 0.05) {
    return {
      track_id: track.track_id,
      action: "HOLD",
      driver: `Exit penalty is ${(penaltyRatio * 100).toFixed(
        1
      )}% of balance — too high to act on now`,
    };
  }

  // Rule 5: default
  return {
    track_id: track.track_id,
    action: "HOLD",
    driver: "No strong signal either way",
  };
}

export function recommendActionsForPortfolio(
  tracks: Track[],
  referenceMarketRate: number
): TrackRecommendation[] {
  const weightedRate = weightedAverageRate(tracks);
  return tracks.map((t) => recommendActionForTrack(t, weightedRate, referenceMarketRate));
}

/** Priority score for sorting the Tab 4 action list, per PRD §4.5. Higher = act sooner. */
export function actionPriorityScore(track: Track, weightedRate: number): number {
  const penaltyRatio =
    track.principal_balance > 0 ? track.early_exit_penalty / track.principal_balance : 0;
  return (track.annual_interest_rate - weightedRate) - penaltyRatio * 10;
}

export function rankTracksByPriority(tracks: Track[]): Track[] {
  const weightedRate = weightedAverageRate(tracks);
  return [...tracks].sort(
    (a, b) => actionPriorityScore(b, weightedRate) - actionPriorityScore(a, weightedRate)
  );
}
