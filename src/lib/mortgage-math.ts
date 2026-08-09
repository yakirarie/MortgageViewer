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
  RateHistoryEntry,
} from "./types";



export type { PayoffReductionMode };

// ---------------------------------------------------------------------------
// §4.1a Prime Rate History helpers
// ---------------------------------------------------------------------------

/**
 * The effective annual rate currently in effect for a track. For Prime tracks
 * with a populated `rate_history`, this is the latest entry's rate; otherwise
 * it falls back to the track's `annual_interest_rate`.
 */
export function currentEffectiveRate(track: Track): number {
  const history = track.rate_history;
  if (history && history.length > 0) {
    return history[history.length - 1].annual_interest_rate;
  }
  return track.annual_interest_rate;
}

/**
 * The effective annual rate in effect at a given month offset from the track's
 * start date. Month 0 is the first month of the loan. For Prime tracks with a
 * `rate_history`, the rate is looked up by walking the timeline; otherwise it
 * falls back to `annual_interest_rate`.
 *
 * Returns `annual_interest_rate` when the track has no start date or history.
 */
export function effectiveRateForMonth(track: Track, monthIndex: number): number {
  const history = track.rate_history;
  if (!history || history.length === 0 || !track.start_date) {
    return track.annual_interest_rate;
  }

  const start = new Date(track.start_date).getTime();
  if (isNaN(start)) return track.annual_interest_rate;

  const target = new Date(start);
  target.setMonth(target.getMonth() + monthIndex);
  const targetTime = target.getTime();

  // Find the latest history entry whose effective_date is <= target month.
  let effective = history[0].annual_interest_rate;
  for (const entry of history) {
    const entryTime = new Date(entry.effective_date).getTime();
    if (entryTime <= targetTime) {
      effective = entry.annual_interest_rate;
    } else {
      break;
    }
  }
  return effective;
}

/**
 * Spitzer (French/annuity) monthly repayment using a track's historical rate
 * timeline. The payment is recomputed at each BoI rate change so the amortization
 * reflects the Prime track's actual rate history. Falls back to the single-rate
 * `spitzerMonthlyPayment` when the track has no history.
 */
export function spitzerMonthlyPaymentWithHistory(track: Track): number {
  const history = track.rate_history;
  if (!history || history.length === 0 || !track.start_date) {
    return spitzerMonthlyPayment(
      track.principal_balance,
      track.annual_interest_rate,
      track.remaining_term_months
    );
  }

  const start = new Date(track.start_date).getTime();
  if (isNaN(start)) {
    return spitzerMonthlyPayment(
      track.principal_balance,
      track.annual_interest_rate,
      track.remaining_term_months
    );
  }

  // Walk the timeline month by month, recomputing the payment whenever the
  // effective rate changes, and amortizing the balance forward.
  let balance = track.principal_balance;
  let monthsLeft = track.remaining_term_months;
  let currentRate = effectiveRateForMonth(track, 0);
  let currentPayment = spitzerMonthlyPayment(balance, currentRate, monthsLeft);

  for (let m = 0; m < track.remaining_term_months; m++) {
    const rateThisMonth = effectiveRateForMonth(track, m);
    if (rateThisMonth !== currentRate) {
      currentRate = rateThisMonth;
      currentPayment = spitzerMonthlyPayment(balance, currentRate, monthsLeft);
    }
    const r = currentRate / 12;
    const interest = balance * r;
    const principal = currentPayment - interest;
    balance = Math.max(0, balance - principal);
    monthsLeft -= 1;
    if (balance <= 0) break;
  }

  return currentPayment;
}

/**
 * The effective annual rate in effect at a given month offset from a start date,
 * given a raw rate-history timeline. Month 0 is the first month of the loan.
 * Returns the latest history entry whose effective_date is <= the target month.
 * Falls back to the first entry's rate when no entry applies yet.
 */
export function rateForMonth(
  rateHistory: RateHistoryEntry[],
  startDate: string,
  monthIndex: number
): number {
  if (!rateHistory || rateHistory.length === 0 || !startDate) return 0;
  const start = new Date(startDate).getTime();
  if (isNaN(start)) return rateHistory[0].annual_interest_rate;

  const target = new Date(start);
  target.setMonth(target.getMonth() + monthIndex);
  const targetTime = target.getTime();

  let effective = rateHistory[0].annual_interest_rate;
  for (const entry of rateHistory) {
    const entryTime = new Date(entry.effective_date).getTime();
    if (entryTime <= targetTime) {
      effective = entry.annual_interest_rate;
    } else {
      break;
    }
  }
  return effective;
}

/** Whole months between two dates (rounded down). */
export function monthsBetween(from: Date, to: Date): number {
  let months = (to.getFullYear() - from.getFullYear()) * 12;
  months += to.getMonth() - from.getMonth();
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}



export interface PrimeAmortizationResult {
  /** Net principal balance today (before accrued daily interest). */
  netPrincipalBalance: number;
  /** Accrued daily interest since the last payment date (ריבית צבורה). */
  accruedDailyInterest: number;
  /** Total payoff balance = net principal + accrued daily interest. */
  totalPayoffBalance: number;
  /** The monthly payment currently in effect (recomputed at each rate change). */
  currentMonthlyPayment: number;
  /** Months remaining on the loan today. */
  remainingTermMonths: number;
  /** Number of months elapsed since the start date (clamped to the term). */
  monthsElapsed: number;
  /** Alias for `totalPayoffBalance` (backward compatibility). */
  currentBalance: number;
  /** Alias for `accruedDailyInterest` (backward compatibility). */
  accruedInterest: number;
}


/**
 * Simulate a Prime track's amortization from its start date to an as-of date
 * (defaults to today), applying the historical rate timeline. The monthly payment
 * is recomputed via the Spitzer formula whenever the effective rate changes, so
 * the result reflects the actual rate history. Returns the net principal balance,
 * accrued daily interest, total payoff balance, current payment, and remaining
 * term.
 *
 * Falls back to the original principal / original term when there is no start
 * date or rate history (nothing to simulate).
 */
export function simulatePrimeAmortization(
  originalPrincipal: number,
  startDate: string,
  originalTermMonths: number,
  rateHistory: RateHistoryEntry[],
  firstPayoutDate?: string,
  asOfDate?: string | Date
): PrimeAmortizationResult {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();

  if (!startDate || originalTermMonths <= 0) {
    return {
      currentBalance: originalPrincipal,
      netPrincipalBalance: originalPrincipal,
      accruedDailyInterest: 0,
      accruedInterest: 0,
      totalPayoffBalance: originalPrincipal,
      currentMonthlyPayment: 0,
      remainingTermMonths: originalTermMonths,
      monthsElapsed: 0,
    };
  }

  const start = new Date(startDate).getTime();
  if (isNaN(start) || !rateHistory || rateHistory.length === 0) {
    return {
      currentBalance: originalPrincipal,
      netPrincipalBalance: originalPrincipal,
      accruedDailyInterest: 0,
      accruedInterest: 0,
      totalPayoffBalance: originalPrincipal,
      currentMonthlyPayment: 0,
      remainingTermMonths: originalTermMonths,
      monthsElapsed: 0,
    };
  }

  // The amortization clock starts at the loan's start date. The bank counts the
  // number of full months since the loan was taken out (e.g. 34/360 for a loan
  // started 13.09.2023), which is what determines how many payments have been
  // made and the remaining term. The first payout date is *not* used to shift
  // this count — it only determines the monthly payment day-of-month, which is
  // used to compute accrued daily interest since the last payment.
  const elapsed = Math.min(monthsBetween(new Date(startDate), asOf), originalTermMonths);


  // Amortize the net principal forward, recomputing the Spitzer payment at each
  // BoI rate change.
  let netPrincipal = originalPrincipal;
  let monthsLeft = originalTermMonths;
  let currentRate = rateForMonth(rateHistory, startDate, 0);
  let currentPayment = spitzerMonthlyPayment(netPrincipal, currentRate, monthsLeft);

  for (let m = 0; m < elapsed; m++) {
    const rateThisMonth = rateForMonth(rateHistory, startDate, m);
    if (rateThisMonth !== currentRate) {
      currentRate = rateThisMonth;
      currentPayment = spitzerMonthlyPayment(netPrincipal, currentRate, monthsLeft);
    }
    const r = currentRate / 12;
    const interest = netPrincipal * r;
    const principal = currentPayment - interest;
    netPrincipal = Math.max(0, netPrincipal - principal);
    monthsLeft -= 1;
    if (netPrincipal <= 0) break;
  }

  // The payment currently in effect is computed at the *latest* rate in the
  // history (the rate in effect today), over the remaining term at the current
  // net principal. The amortization loop above may stop at the last full elapsed
  // month, which can predate the most recent BoI rate change within the current
  // month — so recompute the payment at the latest rate to reflect today.
  const latestRate = rateHistory[rateHistory.length - 1].annual_interest_rate;
  const currentMonthlyPayment =
    netPrincipal > 0 && monthsLeft > 0
      ? spitzerMonthlyPayment(netPrincipal, latestRate, monthsLeft)
      : currentPayment;

  // Accrued daily interest (ריבית צבורה) since the last payment date. The last
  // payment is due on the monthly payment day-of-month (from the first payout
  // date, falling back to the start date) in the most recent month. The bank
  // accrues interest daily at R/365 from the last payment date to the as-of date.
  const paymentDay = firstPayoutDate
    ? new Date(firstPayoutDate).getDate()
    : new Date(startDate).getDate();
  const lastPaymentDate = new Date(asOf.getFullYear(), asOf.getMonth(), paymentDay);
  if (lastPaymentDate.getTime() > asOf.getTime()) {
    // The as-of date is before this month's payment day → last payment was last month.
    lastPaymentDate.setMonth(lastPaymentDate.getMonth() - 1);
  }
  const accruedDays = Math.max(0, (asOf.getTime() - lastPaymentDate.getTime()) / 86400000);
  const accruedDailyInterest =
    netPrincipal > 0 ? netPrincipal * (latestRate / 365) * accruedDays : 0;

  const totalPayoffBalance = netPrincipal + accruedDailyInterest;

  return {
    currentBalance: totalPayoffBalance,
    netPrincipalBalance: netPrincipal,
    accruedDailyInterest,
    accruedInterest: accruedDailyInterest,
    totalPayoffBalance,
    currentMonthlyPayment,
    remainingTermMonths: monthsLeft,
    monthsElapsed: elapsed,
  };
}


export interface FixedAmortizationResult {
  /** Net principal balance today (before accrued daily interest). */
  netPrincipalBalance: number;
  /** Accrued daily interest since the last payment date (ריבית צבורה). */
  accruedDailyInterest: number;
  /** Total payoff balance = net principal + accrued daily interest. */
  totalPayoffBalance: number;
  /** The monthly payment currently in effect (fixed — never changes). */
  currentMonthlyPayment: number;
  /** Months remaining on the loan today. */
  remainingTermMonths: number;
  /** Number of months elapsed since the start date (clamped to the term). */
  monthsElapsed: number;
  /** Alias for `totalPayoffBalance` (backward compatibility). */
  currentBalance: number;
  /** Alias for `accruedDailyInterest` (backward compatibility). */
  accruedInterest: number;
}

/**
 * Simulate a Fixed Unlinked (Klatz) track's amortization from its start date to
 * an as-of date (defaults to today). Unlike Prime tracks, the rate is completely
 * immutable — it never changes over the life of the loan. The monthly payment is
 * therefore constant (computed once via the Spitzer formula at origination) and
 * the balance simply amortizes down month by month.
 *
 * Returns the net principal balance, accrued daily interest, total payoff
 * balance, current payment, and remaining term.
 *
 * Falls back to the original principal / original term when there is no start
 * date (nothing to simulate).
 */
export function simulateFixedAmortization(
  originalPrincipal: number,
  startDate: string,
  originalTermMonths: number,
  annualRate: number,
  firstPayoutDate?: string,
  asOfDate?: string | Date
): FixedAmortizationResult {
  const asOf = asOfDate ? new Date(asOfDate) : new Date();

  if (originalTermMonths <= 0) {
    return {
      currentBalance: originalPrincipal,
      netPrincipalBalance: originalPrincipal,
      accruedDailyInterest: 0,
      accruedInterest: 0,
      totalPayoffBalance: originalPrincipal,
      currentMonthlyPayment: 0,
      remainingTermMonths: originalTermMonths,
      monthsElapsed: 0,
    };
  }

  // No start date (or an invalid one) → no elapsed months, but we can still
  // compute the payment at the original principal over the full term. This lets
  // the form show a meaningful current balance / payment even before the user
  // enters a start date.
  if (!startDate) {
    const payment = spitzerMonthlyPayment(originalPrincipal, annualRate, originalTermMonths);
    return {
      currentBalance: originalPrincipal,
      netPrincipalBalance: originalPrincipal,
      accruedDailyInterest: 0,
      accruedInterest: 0,
      totalPayoffBalance: originalPrincipal,
      currentMonthlyPayment: payment,
      remainingTermMonths: originalTermMonths,
      monthsElapsed: 0,
    };
  }

  const start = new Date(startDate).getTime();
  if (isNaN(start)) {
    const payment = spitzerMonthlyPayment(originalPrincipal, annualRate, originalTermMonths);
    return {
      currentBalance: originalPrincipal,
      netPrincipalBalance: originalPrincipal,
      accruedDailyInterest: 0,
      accruedInterest: 0,
      totalPayoffBalance: originalPrincipal,
      currentMonthlyPayment: payment,
      remainingTermMonths: originalTermMonths,
      monthsElapsed: 0,
    };
  }


  // The amortization clock starts at the loan's start date (same convention as
  // the Prime track — the bank counts full months since the loan was taken out).
  const elapsed = Math.min(monthsBetween(new Date(startDate), asOf), originalTermMonths);


  // Fixed rate → the payment is constant. Compute it once at origination.
  let netPrincipal = originalPrincipal;
  let monthsLeft = originalTermMonths;
  const originationPayment = spitzerMonthlyPayment(netPrincipal, annualRate, monthsLeft);

  for (let m = 0; m < elapsed; m++) {
    const r = annualRate / 12;
    const interest = netPrincipal * r;
    const principal = originationPayment - interest;
    netPrincipal = Math.max(0, netPrincipal - principal);
    monthsLeft -= 1;
    if (netPrincipal <= 0) break;
  }

  // The payment currently in effect is the Spitzer payment at the current net
  // principal over the remaining term (identical to the origination payment for
  // a fixed rate, but recomputed to reflect any rounding drift).
  const currentMonthlyPayment =
    netPrincipal > 0 && monthsLeft > 0
      ? spitzerMonthlyPayment(netPrincipal, annualRate, monthsLeft)
      : originationPayment;

  // Accrued daily interest (ריבית צבורה) since the last payment date. The last
  // payment is due on the monthly payment day-of-month (from the first payout
  // date, falling back to the start date) in the most recent month. The bank
  // accrues interest daily at R/365 from the last payment date to the as-of date.
  const paymentDay = firstPayoutDate
    ? new Date(firstPayoutDate).getDate()
    : new Date(startDate).getDate();
  const lastPaymentDate = new Date(asOf.getFullYear(), asOf.getMonth(), paymentDay);
  if (lastPaymentDate.getTime() > asOf.getTime()) {
    // The as-of date is before this month's payment day → last payment was last month.
    lastPaymentDate.setMonth(lastPaymentDate.getMonth() - 1);
  }
  const accruedDays = Math.max(0, (asOf.getTime() - lastPaymentDate.getTime()) / 86400000);
  const accruedDailyInterest =
    netPrincipal > 0 ? netPrincipal * (annualRate / 365) * accruedDays : 0;

  const totalPayoffBalance = netPrincipal + accruedDailyInterest;

  return {
    currentBalance: totalPayoffBalance,
    netPrincipalBalance: netPrincipal,
    accruedDailyInterest,
    accruedInterest: accruedDailyInterest,
    totalPayoffBalance,
    currentMonthlyPayment,
    remainingTermMonths: monthsLeft,
    monthsElapsed: elapsed,
  };
}


export interface FixedGapPenaltyInput {
  /** Net principal balance today (₪). */
  netPrincipalBalance: number;
  /** The fixed annual rate on the loan (decimal, e.g. 0.049). */
  currentRate: number;
  /** The average BoI base rate over the remaining term (decimal). */
  boiAverageRate: number;
  /** Months remaining on the loan. */
  remainingMonths: number;
  /** Annual discount rate for the PV calculation (decimal). Defaults to `currentRate`. */
  discountRate?: number;
}

/**
 * Early-payoff gap penalty for a Fixed Unlinked (Klatz) track.
 *
 * The bank compensates itself for the interest it would have earned had the
 * loan run to term. The penalty is the present value of the monthly interest
 * rate differential (loan rate − BoI average rate) applied to the remaining
 * principal, discounted over the remaining months:
 *
 *   Penalty = Σ_{m=1..n} ( (R − R_boi) / 12 × B ) / (1 + d/12)^m
 *
 * Returns 0 when the loan rate is at or below the BoI average rate (no gap to
 * compensate), or when the balance/term is zero.
 */
export function fixedTrackGapPenalty({
  netPrincipalBalance,
  currentRate,
  boiAverageRate,
  remainingMonths,
  discountRate,
}: FixedGapPenaltyInput): number {
  if (netPrincipalBalance <= 0 || remainingMonths <= 0) return 0;

  const gap = currentRate - boiAverageRate;
  if (gap <= 0) return 0; // no penalty when the loan rate is at/below market

  const monthlyGap = gap / 12;
  const monthlyDiscount = (discountRate ?? currentRate) / 12;

  let penalty = 0;
  for (let m = 1; m <= remainingMonths; m++) {
    const monthlyInterestGap = netPrincipalBalance * monthlyGap;
    penalty += monthlyInterestGap / Math.pow(1 + monthlyDiscount, m);
  }
  return penalty;
}




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
