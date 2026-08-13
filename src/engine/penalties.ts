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
  /** עמלת פירעון מוקדם — operationalFee + noNoticeFee + interestDifferentialFee (₪). */
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
  const remainingMonths = track.remaining_term_months;

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
  // the remaining months — the same gap formula the payoff engine uses
  // (`fixedTrackGapPenalty`). It is scaled by the payoff ratio for a partial
  // payoff, then reduced by the BOI statutory age discount (20% after 3 years,
  // 30% after 5 years).
  let interestDifferentialFee = 0.0;

  if (contractRate > boiAverageRate && payoffAmount > 0) {
    const elapsedMonths = calculateElapsedMonths(track.start_date);
    const payoffRatio = Math.min(1, payoffAmount / principal);

    const rawGap = fixedTrackGapPenalty({
      netPrincipalBalance: principal,
      currentRate: contractRate,
      boiAverageRate,
      remainingMonths,
    }) * payoffRatio;

    // Apply the BOI statutory age discount (20% after 3 yrs, 30% after 5 yrs).
    let discount = 0.0;
    if (elapsedMonths >= 60) discount = 0.3;
    else if (elapsedMonths >= 36) discount = 0.2;

    interestDifferentialFee = rawGap * (1 - discount);
  }


  const totalPenalties = operationalFee + noNoticeFee + interestDifferentialFee;

  return {
    remainingPrincipal: roundTwoDecimals(principal),
    accruedInterest: roundTwoDecimals(accruedInterest),
    totalOutstandingBalance: roundTwoDecimals(totalOutstandingBalance),
    operationalFee: roundTwoDecimals(operationalFee),
    interestDifferentialFee: roundTwoDecimals(interestDifferentialFee),
    noNoticeFee: roundTwoDecimals(noNoticeFee),
    totalPenalties: roundTwoDecimals(totalPenalties),
    totalSettlementAmount: roundTwoDecimals(totalOutstandingBalance + totalPenalties),
  };
}

/**
 * Convenience wrapper that derives the BOI benchmark rate for a track from its
 * type and remaining term, then computes the full payoff breakdown. This is the
 * single entry point the UI and payoff engine use to auto-calculate penalties.
 */
export function calculateTrackPayoffBreakdownAuto(
  track: Track,
  payoffAmount: number,
  hasNotice: boolean,
  daysSinceLastPayment: number = 15
): BankPayoffBreakdown {
  const benchmark = getBoiBenchmarkRate(track.track_type, track.remaining_term_months);
  return calculateTrackPayoffBreakdown(
    track,
    payoffAmount,
    benchmark,
    hasNotice,
    daysSinceLastPayment
  );
}
