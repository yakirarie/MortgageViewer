// Early Payoff Simulator Engine
// Implements the Bank of Israel (BOI) early discharge (Amlat Piraon Mukdam)
// penalty rules and payoff amortization math as pure, side-effect-free functions.
//
//   Effective Rate = BoI Base Rate + Margin   (Prime tracks)
//   Notice Fee      = 0.1% of principal paid off unless 10+ days advance notice
//   Interest Gap    = PV(R_contract − R_boi_avg, remaining months, prepaid principal)
//                     × time-elapsed discount (0% / 20% / 30%)
//
// Nothing here throws on zero/missing numeric input — everything degrades to a
// defined value (0, null, or Infinity) per the app's "forgiving data entry"
// principle. UI layers decide how to render null/Infinity.

import type { Track, PayoffReductionMode } from "../lib/types";
import {
  spitzerMonthlyPayment,
  monthsToPayoff,
  effectiveMonthlyPayment,
  totalRemainingInterest,
  liveTrackBalance,
  remainingInterestForTrack,
  fixedTrackGapPenalty,
} from "../lib/mortgage-math";
import { getBoiAverageRate } from "../lib/rates-api";

export type { PayoffReductionMode };

// ---------------------------------------------------------------------------
// §1 Notice Fee (Amlat Hoda'a Muvdashat)
// ---------------------------------------------------------------------------

/**
 * The notice fee due on an early payoff.
 *
 *   hasAdvanceNotice === true  → 0.0% (10+ days advance notice given)
 *   hasAdvanceNotice === false → 0.1% of the principal paid off
 *
 * Returns 0 when nothing is being paid off.
 */
export function computeNoticeFee(
  principalPaid: number,
  hasAdvanceNotice: boolean
): number {
  if (principalPaid <= 0) return 0;
  return hasAdvanceNotice ? 0 : principalPaid * 0.001;
}

// ---------------------------------------------------------------------------
// §2 Interest Differential Penalty (Amlat Pe'arei Ribit)
// ---------------------------------------------------------------------------

/**
 * The legal discount factor applied to the interest-gap penalty based on the
 * number of years elapsed since the loan was originated (or last reset):
 *
 *   < 3 years elapsed → 0% discount  (100% of the raw penalty)
 *   3–5 years elapsed → 20% discount (80% of the raw penalty)
 *   ≥ 5 years elapsed → 30% discount (70% of the raw penalty)
 */
export function interestDifferentialDiscountFactor(yearsElapsed: number): number {
  if (yearsElapsed < 3) return 1;
  if (yearsElapsed < 5) return 0.8;
  return 0.7;
}

/**
 * The interest differential penalty (Amlat Pe'arei Ribit) for paying off
 * `prepaidPrincipal` on a track.
 *
 * - PRIME tracks: always 0 (Prime follows the BoI base rate, so there is no
 *   interest gap to compensate the bank).
 * - FIXED / VARIABLE tracks: the present value of the monthly interest-rate
 *   differential (loan rate − BoI average rate) over the remaining term,
 *   applied to the prepaid principal, then reduced by the time-elapsed legal
 *   discount. If the loan rate is at or below the BoI average rate, the
 *   penalty is 0.
 *
 * `yearsElapsed` defaults to 0 (full penalty). `boiAverageRate` defaults to the
 * average BoI base rate over the track's remaining term.
 */
export function computeInterestDifferentialPenalty(
  track: Track,
  prepaidPrincipal: number,
  opts: { boiAverageRate?: number; yearsElapsed?: number } = {}
): number {
  if (prepaidPrincipal <= 0) return 0;
  if (track.track_type === "PRIME") return 0;

  const remaining = track.remaining_term_months;
  if (remaining <= 0) return 0;

  // Variable tracks only carry a gap penalty before their next reset date.
  if (
    track.track_type === "VARIABLE_5Y" ||
    track.track_type === "VARIABLE_5Y_LINKED"
  ) {
    if (track.months_to_reset !== null && track.months_to_reset <= 0) return 0;
  }

  const boiAvg =
    opts.boiAverageRate ?? getBoiAverageRate(track.start_date || "");

  const raw = fixedTrackGapPenalty({
    netPrincipalBalance: prepaidPrincipal,
    currentRate: track.annual_interest_rate,
    boiAverageRate: boiAvg,
    remainingMonths: remaining,
  });

  const discount = interestDifferentialDiscountFactor(opts.yearsElapsed ?? 0);
  return raw * discount;
}

// ---------------------------------------------------------------------------
// §3 Recalculation Modes
// ---------------------------------------------------------------------------

export interface TrackRecalculation {
  /** Remaining balance after the allocation (₪). */
  newBalance: number;
  /** New monthly payment (reduce_payment mode) — unchanged in reduce_term. */
  newMonthlyPayment: number;
  /** New remaining term in months (reduce_term mode) — unchanged in reduce_payment. */
  newRemainingMonths: number;
  /** Net cash interest avoided over the remaining term (₪). */
  interestSaved: number;
  /** Interest differential penalty due (₪). */
  penalty: number;
  /** Notice fee due (₪). */
  noticeFee: number;
  /** interestSaved − penalty − noticeFee (₪). */
  netBenefit: number;
}

export interface EarlyPayoffOptions {
  mode?: PayoffReductionMode; // default "reduce_term"
  hasAdvanceNotice?: boolean; // default false
  boiAverageRate?: number; // optional override for the gap penalty
  yearsElapsed?: number; // years since origin/last reset (for the legal discount)
}

/**
 * Recalculate a single track after allocating `allocation` toward early payoff.
 *
 * - reduce_payment (Kitzur Tlash): keep the remaining term constant and
 *   recompute the monthly payment on the reduced balance.
 * - reduce_term (Kitzur Tekufa): keep the monthly payment constant and solve
 *   for the new (shorter) remaining term.
 *
 * `allocation` is clamped to the track's live balance. The interest-gap penalty
 * and notice fee are computed per the BOI rules above.
 */
export function recalculateTrack(
  track: Track,
  allocation: number,
  opts: EarlyPayoffOptions = {}
): TrackRecalculation {
  const mode = opts.mode ?? "reduce_term";
  const L = Math.max(0, Math.min(allocation, liveTrackBalance(track)));

  const originalPayment = effectiveMonthlyPayment(track);
  const interestBefore = remainingInterestForTrack(track);
  const newBalance = liveTrackBalance(track) - L;

  let interestAfter: number;
  let newMonthlyPayment = originalPayment;
  let newRemainingMonths = track.remaining_term_months;

  if (mode === "reduce_payment") {
    newMonthlyPayment = spitzerMonthlyPayment(
      newBalance,
      track.annual_interest_rate,
      track.remaining_term_months
    );
    interestAfter = totalRemainingInterest(
      newBalance,
      newMonthlyPayment,
      track.remaining_term_months
    );
  } else {
    // reduce_term: keep the original payment, solve for the new (shorter) term.
    const newTerm = monthsToPayoff(
      newBalance,
      track.annual_interest_rate,
      originalPayment
    );
    newRemainingMonths = Number.isFinite(newTerm)
      ? newTerm
      : track.remaining_term_months;
    interestAfter = totalRemainingInterest(
      newBalance,
      originalPayment,
      newRemainingMonths
    );
  }

  const interestSaved = Math.max(0, interestBefore - interestAfter);
  const penalty = computeInterestDifferentialPenalty(track, L, opts);
  const noticeFee = computeNoticeFee(L, opts.hasAdvanceNotice ?? false);
  const netBenefit = interestSaved - penalty - noticeFee;

  return {
    newBalance,
    newMonthlyPayment,
    newRemainingMonths,
    interestSaved,
    penalty,
    noticeFee,
    netBenefit,
  };
}

// ---------------------------------------------------------------------------
// §4 Optimal Allocation
// ---------------------------------------------------------------------------

export interface AllocationResult {
  track_id: string;
  /** Amount allocated to this track (₪). */
  allocated: number;
  /** Interest differential penalty due (₪). */
  penalty: number;
  /** Notice fee due (₪). */
  noticeFee: number;
  /** Net cash interest avoided (₪). */
  interestSaved: number;
  /** interestSaved − penalty − noticeFee (₪). */
  netBenefit: number;
  /** New monthly payment (reduce_payment mode). */
  newMonthlyPayment: number;
  /** New remaining term in months (reduce_term mode). */
  newRemainingMonths: number;
}

/**
 * Suggest an optimal allocation of `lumpSum` across tracks.
 *
 * Objective: maximize Net Benefit = Σ(interest saved) − Σ(penalties).
 * Constraints: Σ A_i ≤ lumpSum, 0 ≤ A_i ≤ B_i.
 *
 * Strategy: a bounded greedy search that ranks tracks by net-benefit-per-shekel
 * efficiency (computed at a full-payoff trial amount), then fills each track's
 * min(balance, remaining lump sum) in that order until the lump sum is
 * exhausted. This is a heuristic, not a guaranteed-optimal allocation — the UI
 * labels it as such.
 */
export function getOptimalAllocation(
  tracks: Track[],
  lumpSum: number,
  mode: PayoffReductionMode = "reduce_term",
  hasAdvanceNotice = false
): AllocationResult[] {
  const ranked = tracks
    .map((track) => {
      const balance = liveTrackBalance(track);
      const trial = recalculateTrack(track, balance, {
        mode,
        hasAdvanceNotice,
      });
      const efficiency = balance > 0 ? trial.netBenefit / balance : -Infinity;
      return { track, efficiency };
    })
    .sort((a, b) => b.efficiency - a.efficiency);

  let remaining = Math.max(0, lumpSum);
  const results: AllocationResult[] = [];

  for (const { track } of ranked) {
    if (remaining <= 0) break;
    const balance = liveTrackBalance(track);
    const allocated = Math.min(balance, remaining);
    if (allocated > 0) {
      const r = recalculateTrack(track, allocated, { mode, hasAdvanceNotice });
      results.push({
        track_id: track.track_id,
        allocated,
        penalty: r.penalty,
        noticeFee: r.noticeFee,
        interestSaved: r.interestSaved,
        netBenefit: r.netBenefit,
        newMonthlyPayment: r.newMonthlyPayment,
        newRemainingMonths: r.newRemainingMonths,
      });
      remaining -= allocated;
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// §5 Payoff Diagnostics Summary
// ---------------------------------------------------------------------------

export interface PayoffSummary {
  /** Σ A_i + Σ penalties (₪). */
  totalPayoffOutlay: number;
  /** Total baseline remaining interest minus total new remaining interest (₪). */
  guaranteedInterestSaved: number;
  /** Σ P_original − Σ P_new (₪/month) — only meaningful in reduce_payment mode. */
  monthlyCashflowRelief: number;
  /** guaranteedInterestSaved − totalPayoffOutlay (₪). */
  netBenefit: number;
}

/**
 * Aggregate diagnostics across all tracks for a given allocation map.
 * `allocations` maps track_id → amount allocated (₪).
 */
export function computePayoffSummary(
  tracks: Track[],
  allocations: Record<string, number>,
  mode: PayoffReductionMode = "reduce_term",
  hasAdvanceNotice = false
): PayoffSummary {
  let totalPayoffOutlay = 0;
  let guaranteedInterestSaved = 0;
  let monthlyCashflowRelief = 0;
  let netBenefit = 0;

  for (const track of tracks) {
    const L = allocations[track.track_id] || 0;
    const r = recalculateTrack(track, L, { mode, hasAdvanceNotice });
    totalPayoffOutlay += L + r.penalty + r.noticeFee;
    guaranteedInterestSaved += r.interestSaved;
    if (mode === "reduce_payment") {
      monthlyCashflowRelief += effectiveMonthlyPayment(track) - r.newMonthlyPayment;
    }
    netBenefit += r.netBenefit;
  }

  return {
    totalPayoffOutlay,
    guaranteedInterestSaved,
    monthlyCashflowRelief,
    netBenefit,
  };
}
