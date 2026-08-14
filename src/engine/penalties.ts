// Early Payoff Penalty Breakdown (Bank-Equivalent Statement)
//
// Pure, side-effect-free utilities that compute the full bank-equivalent payoff
// statement for a single track — the same line items a bank prints on an early
// discharge (Amlat Piraon Mukdam) statement:
//
//   יתרת קרן            remainingPrincipal
//   ריבית צבורה         accruedInterest
//   סה"כ יתרה           totalOutstandingBalance
//   עמלה תפעולית        operationalFee (₪60)
//   עמלת פערי ריבית     interestDifferentialFee (Amlat Pa'arei Ribit)
//   עמלת העדר הודעה     noNoticeFee (0.1% if no advance notice)
//   עמלת פירעון מוקדם   totalPenalties
//   סה"כ יתרה לסילוק    totalSettlementAmount
//
// All penalty values are derived automatically from the track's raw inputs
// (balance, contract rate, remaining term, start date) plus the BOI benchmark
// rate — the user never enters a calculated penalty by hand.

import type { Track } from "../lib/types";
import { spitzerMonthlyPayment, monthsBetween, fixedTrackGapPenalty } from "../lib/mortgage-math";
import { getBoiBenchmarkRate } from "../lib/rates-api";


export interface BankPayoffBreakdown {
  /** יתרת קרן — remaining principal (₪). */
  remainingPrincipal: number;
  /** ריבית צבורה — accrued interest since the last payment (₪). */
  accruedInterest: number;
  /** סה"כ יתרה — remainingPrincipal + accruedInterest (₪). */
  totalOutstandingBalance: number;
  /** עמלה תפעולית — statutory operational fee (₪60.00). */
  operationalFee: number;
  /** עמלת פערי ריבית — interest differential fee (Amlat Pa'arei Ribit) (₪). */
  interestDifferentialFee: number;
  /** עמלת העדר הודעה מוקדמת — 0.1% of payoff if no advance notice (₪). */
  noNoticeFee: number;
  /** עמלת הצמדה — indexation penalty for CPI-linked tracks (₪). */
  indexationPenalty: number;
  /** עמלת פירעון מוקדם — operationalFee + noNoticeFee + interestDifferentialFee + indexationPenalty (₪). */
  totalPenalties: number;
  /** סה"כ יתרה לסילוק — totalOutstandingBalance + totalPenalties (₪). */
  totalSettlementAmount: number;
}


/** Round a number to two decimal places (₪ precision). */
export function roundTwoDecimals(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

/**
 * Convert a nominal annual rate to an effective annual rate based on monthly
 * compounding, per Bank of Israel Directive 320 (early-repayment penalties use
 * compounding interest, r_effective).
 *
 * Example: 0.0498 (4.98%) → ~0.050945 (5.10%).
 *
 * Returns 0 for non-positive or non-finite inputs.
 */
export function convertNominalToEffectiveRate(nominalRateFraction: number): number {
  if (!Number.isFinite(nominalRateFraction) || nominalRateFraction <= 0) return 0;
  return Math.pow(1 + nominalRateFraction / 12, 12) - 1;
}


/**
 * The number of whole months elapsed since the track's start date (used to
 * place the track in the correct statutory age-discount bracket). Returns 0
 * when the start date is missing or invalid.
 */
export function calculateElapsedMonths(startDate?: string): number {
  if (!startDate) return 0;
  const start = new Date(startDate);
  if (isNaN(start.getTime())) return 0;
  return monthsBetween(start, new Date());
}

/**
 * The monthly payment for a track, derived from its balance, contract rate, and
 * remaining term via the Spitzer formula. Falls back to the track's stored
 * `monthly_repayment` when the inputs are insufficient to derive a payment.
 */
export function calculateMonthlyPayment(
  principal: number,
  contractInterestRate: number,
  remainingMonths: number,
  fallback?: number
): number {
  if (principal > 0 && remainingMonths > 0 && Number.isFinite(contractInterestRate)) {
    return spitzerMonthlyPayment(principal, contractInterestRate, remainingMonths);
  }
  return fallback ?? 0;
}

/**
 * Whether a track is a bank-indexed Variable Rate (Mishtana) track whose rate
 * renegotiates at a fixed reset date (VARIABLE_5Y / VARIABLE_5Y_LINKED).
 *
 * Bond-anchored variable tracks (VARIABLE_BOND_UNLINKED, משתנה עוגן אג"ח) are
 * deliberately EXCLUDED: their rate tracks a government bond index rather than
 * the bank's 5-year reset cycle, so the penalty horizon is the full remaining
 * term (see getPenaltyHorizon).
 */
export function isVariableRateTrack(track: Track): boolean {
  return track.track_type === "VARIABLE_5Y" || track.track_type === "VARIABLE_5Y_LINKED";
}

/**
 * The effective penalty horizon (in months) for a track.
 *
 * For bank-indexed Variable Rate (Mishtana) tracks (VARIABLE_5Y /
 * VARIABLE_5Y_LINKED) the interest-gap penalty and the BOI benchmark lookup
 * only apply up to the NEXT rate reset date — the bank cannot claim a gap
 * beyond the point where the rate renegotiates to market. The horizon is
 * therefore capped at the months until the next reset:
 *
 *   T = min(monthsToNextReset, remainingMonths)
 *
 * Bond-anchored variable tracks (VARIABLE_BOND_UNLINKED, משתנה עוגן אג"ח) are
 * NOT capped: their rate tracks a government bond index for the life of the
 * loan, so the bank can claim a gap over the FULL remaining term. The horizon
 * is therefore the full remaining term (e.g. 325 months), matching the bank
 * statement.
 *
 * For all other tracks the horizon is the full remaining term. Returns 0 when
 * the remaining term is missing/zero.
 */
export function getPenaltyHorizon(track: Track): number {
  const remaining = track.remaining_term_months;
  if (!Number.isFinite(remaining) || remaining <= 0) return 0;

  if (isVariableRateTrack(track)) {
    const toReset = track.months_to_reset;
    if (toReset !== null && Number.isFinite(toReset) && toReset > 0) {
      return Math.min(toReset, remaining);
    }
  }
  return remaining;
}



/**
 * Compute the full bank-equivalent payoff breakdown for a track.
 *
 * @param track              The track (uses `principal_balance`, `annual_interest_rate`,
 *                           `remaining_term_months`, `start_date`, `track_type`).
 * @param payoffAmount       The principal amount being paid off (₪). Defaults to the
 *                           full remaining principal.
 * @param boiAverageRate     The BOI benchmark market rate (decimal). Defaults to the
 *                           tier-matched benchmark for the track's type & remaining term.
 * @param hasNotice          Whether 10+ days advance notice was given (waives the
 *                           no-notice fee).
 * @param daysSinceLastPayment Days since the last payment (for accrued-interest
 *                           estimation). Defaults to 15.
 */
export function calculateTrackPayoffBreakdown(
  track: Track,
  payoffAmount: number,
  boiAverageRate: number,
  hasNotice: boolean,
  daysSinceLastPayment: number = 15
): BankPayoffBreakdown {
  const principal = track.principal_balance;
  const contractRate = track.annual_interest_rate;

  // 1. Accrued Interest (mid-month estimation).

  const monthlyRate = contractRate / 12;
  const accruedInterest = principal * monthlyRate * (daysSinceLastPayment / 30);
  const totalOutstandingBalance = principal + accruedInterest;

  // 2. Operational Fee (statutory ₪60).
  const operationalFee = payoffAmount > 0 ? 60.0 : 0.0;

  // 3. No-Notice Fee (0.1% of the payoff amount if no 10-day advance notice).
  const noNoticeFee = hasNotice ? 0.0 : payoffAmount * 0.001;

  // 4. Interest Differential Fee (Amlat Pa'arei Ribit).
  //
  // The bank compensates itself for the above-market interest it would have
  // earned had the loan run to term. When the contract rate exceeds the BOI
  // benchmark, the fee is the present value of the monthly rate differential
  // (contract − benchmark) applied to the prepaid principal, discounted over
  // the penalty horizon — the same gap formula the payoff engine uses
  // (`fixedTrackGapPenalty`). It is scaled by the payoff ratio for a partial
  // payoff, then reduced by the BOI statutory age discount (20% after 3 years,
  // 30% after 5 years).
  //
  // For Variable Rate (Mishtana) tracks the horizon is capped at the months
  // until the next rate reset (`getPenaltyHorizon`): the bank cannot claim a
  // gap beyond the point where the rate renegotiates to market. If the contract
  // rate is at or below the benchmark for that short horizon, the fee is 0.
  const horizon = getPenaltyHorizon(track);
  let interestDifferentialFee = 0.0;

  // Per Bank of Israel Directive 320, the interest-gap penalty is computed on
  // the COMPOUNDING (effective) annual rate, not the nominal rate the bank
  // quotes on the dashboard. Convert the user's nominal input to r_effective
  // before evaluating it against the BOI benchmark rate.
  const effectiveRate = convertNominalToEffectiveRate(contractRate);

  if (effectiveRate > boiAverageRate && payoffAmount > 0 && horizon > 0) {
    const elapsedMonths = calculateElapsedMonths(track.start_date);
    const payoffRatio = Math.min(1, payoffAmount / principal);

    const rawGap = fixedTrackGapPenalty({
      netPrincipalBalance: principal,
      currentRate: effectiveRate,
      boiAverageRate,
      remainingMonths: horizon,
    }) * payoffRatio;


    // Apply the BOI statutory age discount (20% after 3 yrs, 30% after 5 yrs).
    let discount = 0.0;
    if (elapsedMonths >= 60) discount = 0.3;
    else if (elapsedMonths >= 36) discount = 0.2;

    interestDifferentialFee = rawGap * (1 - discount);
  }

  // 5. Indexation Penalty (Amlat Hatzmada) — for CPI-linked tracks. There is no
  // stored indexation figure in the profile, so it defaults to 0; it is kept as
  // a distinct line item so the total always equals the sum of its parts.
  const indexationPenalty = 0.0;

  const totalPenalties =
    operationalFee + noNoticeFee + interestDifferentialFee + indexationPenalty;

  return {
    remainingPrincipal: roundTwoDecimals(principal),
    accruedInterest: roundTwoDecimals(accruedInterest),
    totalOutstandingBalance: roundTwoDecimals(totalOutstandingBalance),
    operationalFee: roundTwoDecimals(operationalFee),
    interestDifferentialFee: roundTwoDecimals(interestDifferentialFee),
    noNoticeFee: roundTwoDecimals(noNoticeFee),
    indexationPenalty: roundTwoDecimals(indexationPenalty),
    totalPenalties: roundTwoDecimals(totalPenalties),
    totalSettlementAmount: roundTwoDecimals(totalOutstandingBalance + totalPenalties),
  };
}


/**
 * Convenience wrapper that derives the BOI benchmark rate for a track from its
 * type and penalty horizon, then computes the full payoff breakdown. This is the
 * single entry point the UI and payoff engine use to auto-calculate penalties.
 *
 * For Variable Rate (Mishtana) tracks the benchmark is matched to the months
 * until the NEXT rate reset (not the full remaining term), because the rate
 * renegotiates to market at that point and no gap can be claimed beyond it.
 *
 * When the track carries an explicit `boiBenchmarkRateOverride` (e.g. a bank
 * statement quotes a specific benchmark for a bond-anchored variable track,
 * משתנה עוגן אג"ח), that user-supplied rate is used verbatim instead of the
 * default tier lookup.
 */
export function calculateTrackPayoffBreakdownAuto(
  track: Track,
  payoffAmount: number,
  hasNotice: boolean,
  daysSinceLastPayment: number = 15
): BankPayoffBreakdown {
  const horizon = getPenaltyHorizon(track);
  const benchmark =
    track.boiBenchmarkRateOverride !== undefined &&
    Number.isFinite(track.boiBenchmarkRateOverride)
      ? track.boiBenchmarkRateOverride
      : getBoiBenchmarkRate(track.track_type, horizon);
  return calculateTrackPayoffBreakdown(
    track,
    payoffAmount,
    benchmark,
    hasNotice,
    daysSinceLastPayment
  );
}

/**
 * The result of the minimal-input penalty flow: given ONLY the surface-level
 * bank-dashboard inputs (track type, principal balance, nominal annual rate,
 * remaining term, and optional months-to-next-reset), the engine automatically
 * converts the nominal rate to its effective (compounding) equivalent, matches
 * the BOI benchmark tier, and computes the interest-gap penalty and total early
 * payoff fee.
 */
export interface MinimalPayoffResult {
  /** The effective (compounding) annual rate derived from the nominal input. */
  effectiveRate: number;
  /** The BOI benchmark market rate matched to the track's type & horizon tier. */
  boiBenchmarkRate: number;
  /** The interest-gap penalty (Amlat Pa'arei Ribit) in ₪. */
  interestGapPenalty: number;
  /** The total early payoff fee in ₪ (gap + notice + operational). */
  totalPayoffFee: number;
  /** The full bank-equivalent payoff breakdown (all line items). */
  breakdown: BankPayoffBreakdown;
}

/**
 * Compute the full minimal-input penalty result for a track using only the
 * surface-level bank-dashboard fields. This is the single entry point for the
 * "minimal friction" flow: the user enters the nominal rate and the engine
 * handles the nominal→effective conversion, BOI benchmark tier matching, and
 * penalty math automatically.
 *
 * The payoff amount is the full remaining principal and no advance notice is
 * assumed (so the 0.1% no-notice fee applies), matching a standard early
 * discharge statement.
 */
export function calculateTrackPayoffBreakdownMinimal(track: Track): MinimalPayoffResult {
  const horizon = getPenaltyHorizon(track);
  const benchmark =
    track.boiBenchmarkRateOverride !== undefined &&
    Number.isFinite(track.boiBenchmarkRateOverride)
      ? track.boiBenchmarkRateOverride
      : getBoiBenchmarkRate(track.track_type, horizon);

  const effectiveRate = convertNominalToEffectiveRate(track.annual_interest_rate);
  const breakdown = calculateTrackPayoffBreakdown(
    track,
    track.principal_balance,
    benchmark,
    false
  );

  return {
    effectiveRate,
    boiBenchmarkRate: benchmark,
    interestGapPenalty: breakdown.interestDifferentialFee,
    totalPayoffFee: breakdown.totalPenalties,
    breakdown,
  };
}



