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

/**
 * The next rate-reset date for a Variable 5Y track. The rate renegotiates every
 * 5 years from the loan's start date, on the monthly payment day-of-month (from
 * the first payout date, falling back to the start date's day). E.g. a loan
 * started 13.09.2023 with a first payout on the 10th resets on 10.09.2028.
 * Returns null when there is no (valid) start date.
 */
export function nextResetDate(
  startDate: string,
  firstPayoutDate?: string
): Date | null {
  if (!startDate) return null;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return null;
  const paymentDay = firstPayoutDate
    ? new Date(firstPayoutDate).getDate()
    : start.getDate();
  return new Date(start.getFullYear() + 5, start.getMonth(), paymentDay);
}

/**
 * Whole months until the next rate reset for a Variable 5Y track, as of a given
 * date (defaults to today). Returns null when there is no start date to derive
 * from.
 */
export function monthsToNextReset(
  startDate: string,
  firstPayoutDate?: string,
  asOfDate?: string | Date
): number | null {
  const reset = nextResetDate(startDate, firstPayoutDate);
  if (!reset) return null;
  const asOf = asOfDate ? new Date(asOfDate) : new Date();
  return monthsBetween(asOf, reset);
}

/**
 * Accrued daily interest (ריבית צבורה) since the last payment date, using
 * fractional-day precision.
 *
 * The last payment is due on the monthly payment day-of-month (`paymentDay`) in
 * the most recent month. The bank accrues interest daily at R/365 from the last
 * payment date to the as-of date. Elapsed days are computed with floating-point
 * precision (including the time-of-day fraction) and truncated to 1 decimal
 * place (e.g. 30.5 days); the resulting interest is rounded to 2 decimal places
 * (Agorot level).
 *
 * Returns 0 when the net principal is zero or the as-of date is on the payment
 * day (no days elapsed since the last payment).
 */
export function computeAccruedDailyInterest(
  netPrincipal: number,
  annualRate: number,
  paymentDay: number,
  asOfDate?: string | Date
): number {
  if (netPrincipal <= 0) return 0;

  // Parse a YYYY-MM-DD string as *local* midnight so the calendar day is
  // interpreted in the user's timezone (avoiding UTC-parsing timezone drift
  // that would otherwise shift the elapsed-day count). A Date object (or the
  // default "today") keeps its time-of-day so the fractional-day precision
  // reflects the actual moment of the query.
  const asOf =
    typeof asOfDate === "string"
      ? new Date(asOfDate + "T00:00:00")
      : asOfDate
        ? new Date(asOfDate)
        : new Date();

  const paymentMadeThisMonth = asOf.getDate() >= paymentDay;
  const lastPaymentDate = new Date(asOf.getFullYear(), asOf.getMonth(), paymentDay);
  if (!paymentMadeThisMonth) {
    // The as-of date is before this month's payment day → last payment was last month.
    lastPaymentDate.setMonth(lastPaymentDate.getMonth() - 1);
  }

  // Floating-point elapsed days including the time-of-day fraction.
  const msDiff = asOf.getTime() - lastPaymentDate.getTime();
  const rawElapsedDays = Math.max(0, msDiff / (1000 * 60 * 60 * 24));
  // Truncate elapsed days to 1 decimal place (e.g., 30.5 days).
  const elapsedDays = Number(rawElapsedDays.toFixed(1));
  // Accrued interest with floating precision (Agorot level).
  const dailyRate = netPrincipal * (annualRate / 365);
  return Number((dailyRate * elapsedDays).toFixed(2));
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
  // Parse a YYYY-MM-DD string as *local* midnight so the calendar day is
  // interpreted in the user's timezone (avoiding UTC-parsing timezone drift).
  const asOf =
    typeof asOfDate === "string"
      ? new Date(asOfDate + "T00:00:00")
      : asOfDate
        ? new Date(asOfDate)
        : new Date();


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
  // made and the remaining term. The monthly payment day-of-month comes from the
  // first payout date (falling back to the start date). When the as-of date is
  // on/after the payment day, this month's payment has already been made, so we
  // count it as an elapsed month and reset the accrued-interest clock to zero.
  const paymentDay = firstPayoutDate
    ? new Date(firstPayoutDate).getDate()
    : new Date(startDate).getDate();
  const paymentMadeThisMonth = asOf.getDate() >= paymentDay;

  let elapsed = monthsBetween(new Date(startDate), asOf);
  if (paymentMadeThisMonth) elapsed += 1;
  elapsed = Math.min(elapsed, originalTermMonths);


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

  // Accrued daily interest (ריבית צבורה) since the last payment date, using
  // fractional-day precision (see `computeAccruedDailyInterest`).
  const accruedDailyInterest = computeAccruedDailyInterest(
    netPrincipal,
    latestRate,
    paymentDay,
    asOf
  );



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
  // Parse a YYYY-MM-DD string as *local* midnight so the calendar day is
  // interpreted in the user's timezone (avoiding UTC-parsing timezone drift).
  const asOf =
    typeof asOfDate === "string"
      ? new Date(asOfDate + "T00:00:00")
      : asOfDate
        ? new Date(asOfDate)
        : new Date();


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
  // The monthly payment day-of-month comes from the first payout date (falling
  // back to the start date). When the as-of date is on/after the payment day,
  // this month's payment has already been made, so we count it as an elapsed
  // month and reset the accrued-interest clock to zero.
  const paymentDay = firstPayoutDate
    ? new Date(firstPayoutDate).getDate()
    : new Date(startDate).getDate();
  const paymentMadeThisMonth = asOf.getDate() >= paymentDay;

  let elapsed = monthsBetween(new Date(startDate), asOf);
  if (paymentMadeThisMonth) elapsed += 1;
  elapsed = Math.min(elapsed, originalTermMonths);


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

  // Accrued daily interest (ריבית צבורה) since the last payment date, using
  // fractional-day precision (see `computeAccruedDailyInterest`).
  const accruedDailyInterest = computeAccruedDailyInterest(
    netPrincipal,
    annualRate,
    paymentDay,
    asOf
  );



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


/**
 * The live amortization-derived payoff values for a track, computed as of today.
 *
 * This is the single source of truth for the "Auto-Calculated" figures shown in
 * the UI (net principal, accrued daily interest, total estimated payoff, current
 * payment, and remaining term). Prime tracks amortize along their historical BoI
 * rate timeline (`simulatePrimeAmortization`); all other tracks amortize at their
 * current constant rate (`simulateFixedAmortization`).
 *
 * Returns `null` when there is no original principal / original term to derive
 * from (the track has not been fully configured yet). Callers should fall back to
 * the track's stored `principal_balance` in that case.
 */
export function deriveTrackPayoff(track: Track): PrimeAmortizationResult | FixedAmortizationResult | null {
  const originalPrincipal = track.original_principal;
  const originalTerm = track.original_term_months && track.original_term_months > 0
    ? track.original_term_months
    : track.remaining_term_months && track.remaining_term_months > 0
      ? track.remaining_term_months
      : 0;

  if (originalPrincipal === undefined || originalPrincipal <= 0 || originalTerm <= 0) {
    return null;
  }

  if (track.track_type === "PRIME") {
    const history = track.rate_history || [];
    if (track.start_date && history.length > 0) {
      return simulatePrimeAmortization(
        originalPrincipal,
        track.start_date,
        originalTerm,
        history,
        track.first_payout_date
      );
    }
    return null;
  }

  // All non-Prime tracks (FIXED_UNLINKED, VARIABLE_5Y, FIXED_LINKED, OTHER)
  // amortize at the current block's constant rate over the elapsed months. Runs
  // even without a start date (elapsed = 0 → balance = original, payment =
  // Spitzer at the original principal over the full term).
  return simulateFixedAmortization(
    originalPrincipal,
    track.start_date || "",
    originalTerm,
    track.annual_interest_rate,
    track.first_payout_date
  );
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

/**
 * Clamp a rate to 6 decimal places to eliminate floating-point precision
 * artifacts (e.g. 0.049800000000000004 → 0.0498). Used when serializing rates
 * to JSON so exported files are clean and round-trip stable.
 */
export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) return 0;
  return Number(rate.toFixed(6));
}

/**
 * The total early-exit cost (Amlat Piraon Mukdam) for a track, broken into its
 * distinct line items per Bank of Israel terminology:
 *
 *   total_exit_cost = amlat_pearei_ribit + notice_fee + operational_fee
 *
 * where `operational_fee` is the fixed ₪60 operational fee (Amlat Hotza'ot
 * Tipuliyot). The interest-gap penalty (Amlat Pe'arei Ribit) is 0 for Prime
 * tracks and computed from the BoI market-rate gap for fixed/variable tracks.
 */
export function totalExitCost(track: Track): number {
  const operationalFee = track.operational_fee ?? 60;
  return track.amlat_pearei_ribit + track.notice_fee + operationalFee;
}

/**
 * Compute the interest-gap penalty (Amlat Pe'arei Ribit) for a track.
 *
 * - PRIME tracks: hardcoded to 0 (Prime follows the BoI base rate, so there is
 *   no interest gap to compensate the bank on early payoff).
 * - FIXED / VARIABLE tracks: the present value of the monthly interest-rate
 *   differential (loan rate − BoI average rate) over the remaining term, via
 *   `fixedTrackGapPenalty`.
 *
 * `boiAverageRate` is the average BoI base rate over the remaining term
 * (decimal). When omitted, the gap is computed against the current BoI base
 * rate. Returns the raw (unclamped) penalty so callers can round as needed.
 */
export function computeAmlatPeareiRibit(
  track: Track,
  boiAverageRate?: number
): number {
  if (track.track_type === "PRIME") return 0;

  const balance = track.principal_balance;
  const remaining = track.remaining_term_months;
  if (balance <= 0 || remaining <= 0) return 0;

  const avgRate = boiAverageRate ?? 0;
  return fixedTrackGapPenalty({
    netPrincipalBalance: balance,
    currentRate: track.annual_interest_rate,
    boiAverageRate: avgRate,
    remainingMonths: remaining,
  });
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
/**
 * The live total payoff balance for a track (net principal + accrued daily
 * interest as of today), consistent with the TrackCard header, the TrackForm's
 * "Total Estimated Payoff", and the Portfolio tab. Falls back to the stored
 * `principal_balance` when the track isn't fully configured (no original
 * principal/term) so the value is always defined.
 */
export function liveTrackBalance(track: Track): number {
  const derived = deriveTrackPayoff(track);
  return derived ? derived.totalPayoffBalance : track.principal_balance;
}

export function portfolioTotals(tracks: Track[]): PortfolioTotals {
  const totalBalance = tracks.reduce((sum, t) => sum + liveTrackBalance(t), 0);

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
  // The interest-gap penalty (Amlat Pe'arei Ribit) plus the fixed operational
  // fee (Amlat Hotza'ot Tipuliyot) are always due on early payoff. The notice
  // fee (Amlat Hoda'a Mukdamet) is separate and can be waived with advance notice.
  const penaltyPaid = L > 0 ? track.amlat_pearei_ribit + (track.operational_fee ?? 60) : 0;
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
// §4.3 Early Payoff — Deterministic Debt-Savings Diagnostics
// ---------------------------------------------------------------------------

export interface PayoffDiagnostics {
  /** Net principal + accrued daily interest + all exit fees (₪). */
  totalPayoffOutlay: number;
  /** Net cash interest avoided over the remaining term (₪). */
  guaranteedInterestSaved: number;
  /** Immediate drop in monthly repayment (₪/month). */
  monthlyCashflowRelief: number;
  /** Months of payments required for saved interest to offset the total exit fees. */
  penaltyPaybackHorizon: number;
}

/**
 * Deterministic early-payoff diagnostics for allocating `lumpSum` to a single
 * track. Unlike the removed opportunity-cost comparison, these metrics are
 * strictly debt-savings based — no speculative market assumptions:
 *
 *   totalPayoffOutlay      = L + amlat_pearei_ribit + notice_fee + operational_fee
 *   guaranteedInterestSaved = interest avoided over the remaining term
 *   monthlyCashflowRelief   = drop in the monthly repayment
 *   penaltyPaybackHorizon   = total exit fees / monthly cashflow relief
 *
 * `lumpSum` is clamped to the track's balance. `penaltyPaybackHorizon` is 0 when
 * there is no monthly relief (e.g. reduce_term mode keeps the payment constant).
 */
export function payoffDiagnostics({
  track,
  lumpSum,
  mode = "reduce_term",
  noticeWaived = false,
}: NpbInput): PayoffDiagnostics {
  const L = Math.max(0, Math.min(lumpSum, track.principal_balance));
  const originalPayment = effectiveMonthlyPayment(track);
  const interestBefore = totalRemainingInterest(
    track.principal_balance,
    originalPayment,
    track.remaining_term_months
  );

  const newBalance = track.principal_balance - L;

  let interestAfter: number;
  let monthlyCashflowRelief: number;
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
    monthlyCashflowRelief = originalPayment - newPayment;
  } else {
    // reduce_term: keep the original payment, solve for the new (shorter) term
    const newTerm = monthsToPayoff(
      newBalance,
      track.annual_interest_rate,
      originalPayment
    );
    const boundedTerm = Number.isFinite(newTerm) ? newTerm : track.remaining_term_months;
    interestAfter = totalRemainingInterest(newBalance, originalPayment, boundedTerm);
    // The payment is unchanged in reduce_term mode → no monthly cashflow relief.
    monthlyCashflowRelief = 0;
  }

  const guaranteedInterestSaved = interestBefore - interestAfter;

  // Total exit fees due on early payoff: interest-gap penalty + operational fee
  // (always due) + notice fee (waivable with advance notice).
  const exitFees =
    (L > 0 ? track.amlat_pearei_ribit + (track.operational_fee ?? 60) : 0) +
    (noticeWaived || L === 0 ? 0 : track.notice_fee);

  const totalPayoffOutlay = L + exitFees;

  // Months of payments required for the saved interest to offset the exit fees.
  const penaltyPaybackHorizon =
    monthlyCashflowRelief > 0 ? exitFees / monthlyCashflowRelief : 0;

  return {
    totalPayoffOutlay,
    guaranteedInterestSaved,
    monthlyCashflowRelief,
    penaltyPaybackHorizon,
  };
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
 * The engine is strictly debt-savings based — it compares each track's rate to
 * the portfolio's own weighted average (no speculative external market reference).
 */
export function recommendActionForTrack(
  track: Track,
  weightedRate: number
): TrackRecommendation {
  const penaltyRatio =
    track.principal_balance > 0 ? track.amlat_pearei_ribit / track.principal_balance : 0;

  // Rule 1: clearly above-average rate, no exit penalty
  if (track.annual_interest_rate > weightedRate + 0.005 && track.amlat_pearei_ribit === 0) {

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

  // Rule 3: high penalty exposure relative to balance
  if (penaltyRatio >= 0.05) {
    return {
      track_id: track.track_id,
      action: "HOLD",
      driver: `Exit penalty is ${(penaltyRatio * 100).toFixed(
        1
      )}% of balance — too high to act on now`,
    };
  }

  // Rule 4: default
  return {
    track_id: track.track_id,
    action: "HOLD",
    driver: "No strong signal either way",
  };
}

export function recommendActionsForPortfolio(tracks: Track[]): TrackRecommendation[] {
  const weightedRate = weightedAverageRate(tracks);
  return tracks.map((t) => recommendActionForTrack(t, weightedRate));
}


/** Priority score for sorting the Tab 4 action list, per PRD §4.5. Higher = act sooner. */
export function actionPriorityScore(track: Track, weightedRate: number): number {
  const penaltyRatio =
    track.principal_balance > 0 ? track.amlat_pearei_ribit / track.principal_balance : 0;
  return (track.annual_interest_rate - weightedRate) - penaltyRatio * 10;
}


export function rankTracksByPriority(tracks: Track[]): Track[] {
  const weightedRate = weightedAverageRate(tracks);
  return [...tracks].sort(
    (a, b) => actionPriorityScore(b, weightedRate) - actionPriorityScore(a, weightedRate)
  );
}
