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
  currentEffectiveRate,
  totalRemainingInterest,
  liveTrackBalance,
  remainingInterestForTrack,
  fixedTrackGapPenalty,
} from "../lib/mortgage-math";

import { getBoiBenchmarkRate } from "../lib/rates-api";


export type { PayoffReductionMode };

// ---------------------------------------------------------------------------
// §1 Notice Fee (Amlat Hoda'a Muvdashat)
// ---------------------------------------------------------------------------

/**
 * The statutory operational fee (Amlat Hotza'ot Tipuliyot) charged per active
 * track on early payoff. Fixed at ₪60 per the Bank of Israel schedule, but
 * falls back to the value stored in the profile when the user has entered a
 * custom figure.
 */
export function computeOperationalFee(track: Track): number {
  const fee = track.operational_fee ?? 60;
  return Number.isFinite(fee) && fee > 0 ? fee : 60;
}

/**
 * The notice fee due on an early payoff.
 *
 *   hasAdvanceNotice === true  → 0.0% (10+ days advance notice given)
 *   hasAdvanceNotice === false → 0.1% of the principal paid off
 *
 * When a `track` is supplied and the profile carries an explicit bank-statement
 * notice fee (`track.notice_fee > 0`), that stored value is used as the
 * authoritative figure — scaled proportionally for a partial payoff. Otherwise
 * the statutory 0.1% is computed against the principal paid off.
 *
 * Returns 0 when nothing is being paid off.
 */
export function computeNoticeFee(
  principalPaid: number,
  hasAdvanceNotice: boolean,
  track?: Track
): number {
  if (principalPaid <= 0) return 0;
  if (hasAdvanceNotice) return 0;

  // Fallback to the stored bank-statement notice fee when present.
  if (track && track.notice_fee > 0) {
    const balance = liveTrackBalance(track);
    if (balance > 0 && principalPaid < balance) {
      // Partial payoff: scale the stored full-discharge fee proportionally.
      return track.notice_fee * (principalPaid / balance);
    }
    return track.notice_fee;
  }

  return principalPaid * 0.001;
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
 * The number of years elapsed since an ISO date (used to place a track in the
 * correct statutory discount bracket). Returns 0 when the date is missing or
 * invalid, so the full (undiscounted) penalty applies.
 */
export function yearsElapsedSince(date?: string): number {
  if (!date) return 0;
  const start = new Date(date).getTime();
  if (Number.isNaN(start)) return 0;
  return (Date.now() - start) / (365.25 * 24 * 3600 * 1000);
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
 * When the profile carries an explicit bank-statement interest-gap penalty
 * (`track.amlat_pearei_ribit > 0`), that stored value is used as the
 * authoritative figure — scaled proportionally for a partial payoff.
 *
 * `yearsElapsed` defaults to the years elapsed since `track.start_date`.
 * `boiAverageRate` defaults to the BOI benchmark market rate matched to the
 * track's type and remaining term (`getBoiBenchmarkRate`).
 */
export function computeInterestDifferentialPenalty(
  track: Track,
  prepaidPrincipal: number,
  opts: { boiAverageRate?: number; yearsElapsed?: number } = {}
): number {
  if (prepaidPrincipal <= 0) return 0;
  if (track.track_type === "PRIME") return 0;

  // Fallback to the stored bank-statement interest-gap penalty when present.
  if (track.amlat_pearei_ribit > 0) {
    const balance = liveTrackBalance(track);
    if (balance > 0 && prepaidPrincipal < balance) {
      // Partial payoff: scale the stored full-discharge penalty proportionally.
      return track.amlat_pearei_ribit * (prepaidPrincipal / balance);
    }
    return track.amlat_pearei_ribit;
  }

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
    opts.boiAverageRate ??
    getBoiBenchmarkRate(track.track_type, track.remaining_term_months);


  const raw = fixedTrackGapPenalty({
    netPrincipalBalance: prepaidPrincipal,
    currentRate: track.annual_interest_rate,
    boiAverageRate: boiAvg,
    remainingMonths: remaining,
  });

  const discount = interestDifferentialDiscountFactor(
    opts.yearsElapsed ?? yearsElapsedSince(track.start_date)
  );
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
  /** Statutory operational fee due (₪). */
  operationalFee: number;
  /** interestSaved − penalty − noticeFee − operationalFee (₪). */
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

  // Use the effective rate (BoI base + margin for Prime tracks, or the latest
  // rate-history entry) rather than the stored `annual_interest_rate` snapshot.
  // This keeps the recomputed payment/term consistent with
  // `effectiveMonthlyPayment`, which derives the current payment from the live
  // amortization timeline. Without this, a Prime track whose stored rate lags
  // its effective rate would report a *negative* cashflow relief in
  // reduce_payment mode (the recomputed payment would exceed the original).
  const effectiveRate = currentEffectiveRate(track);

  const originalPayment = effectiveMonthlyPayment(track);
  const interestBefore = remainingInterestForTrack(track);
  const newBalance = liveTrackBalance(track) - L;

  // No allocation → nothing changes. Returning the baseline early avoids
  // recomputing the payment/term via Spitzer on the live balance, which would
  // otherwise diverge from `effectiveMonthlyPayment` (history-derived for Prime
  // tracks) and fabricate spurious cashflow relief / interest saved for tracks
  // that received no lump sum.
  if (L <= 0) {
    return {
      newBalance: liveTrackBalance(track),
      newMonthlyPayment: originalPayment,
      newRemainingMonths: track.remaining_term_months,
      interestSaved: 0,
      penalty: 0,
      noticeFee: 0,
      operationalFee: 0,
      netBenefit: 0,
    };
  }

  let interestAfter: number;
  let newMonthlyPayment = originalPayment;
  let newRemainingMonths = track.remaining_term_months;

  if (mode === "reduce_payment") {
    newMonthlyPayment = spitzerMonthlyPayment(
      newBalance,
      effectiveRate,
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
      effectiveRate,
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
  const noticeFee = computeNoticeFee(L, opts.hasAdvanceNotice ?? false, track);
  const operationalFee = L > 0 ? computeOperationalFee(track) : 0;
  const netBenefit = interestSaved - penalty - noticeFee - operationalFee;

  return {
    newBalance,
    newMonthlyPayment,
    newRemainingMonths,
    interestSaved,
    penalty,
    noticeFee,
    operationalFee,
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
 * The discrete increment used by the step-wise marginal optimizer. A smaller
 * step yields a closer approximation to the continuous optimum at the cost of
 * more iterations. ₪1,000 balances accuracy against runtime.
 */
const OPTIMIZER_STEP = 1000;

/**
 * Suggest an optimal allocation of `lumpSum` across tracks.
 *
 * Objective (mode-aware):
 *   - reduce_term (Kitzur Tekufa): maximize Net Benefit =
 *     Σ(interest saved) − Σ(penalties).
 *   - reduce_payment (Kitzur Tlash): maximize monthly cashflow relief, with
 *     Net Benefit as a secondary tie-breaker. This keeps the allocation on the
 *     tracks that actually lower the monthly payment rather than dumping the
 *     whole lump sum into a single no-penalty track that yields negligible
 *     relief.
 *
 * Constraints: Σ A_i ≤ lumpSum, 0 ≤ A_i ≤ B_i.
 *
 * Strategy: a discrete step-wise marginal optimization. Starting from all-zero
 * allocations, the lump sum is divided into ₪1,000 increments. At each step the
 * track whose next increment yields the largest positive marginal gain on the
 * primary objective receives the increment (ties broken by the secondary
 * objective). The loop stops when no track can improve the primary objective
 * or the lump sum is exhausted. Any remainder smaller than one step is granted
 * to the track with the highest marginal primary gain at its current allocation.
 *
 * Because the operational fee (₪60) triggers on the first non-zero increment of
 * a track, the marginal gain of that first increment already accounts for it,
 * so the optimizer naturally avoids paying the fee unless it is worthwhile.
 */

export function getOptimalAllocation(
  tracks: Track[],
  lumpSum: number,
  mode: PayoffReductionMode = "reduce_term",
  hasAdvanceNotice = false
): AllocationResult[] {
  const step = OPTIMIZER_STEP;
  const balances = tracks.map((track) => liveTrackBalance(track));
  const allocations = tracks.map(() => 0);
  let remaining = Math.max(0, lumpSum);

  // -------------------------------------------------------------------------
  // Unified step-wise marginal optimizer.
  //
  // Both modes share the same greedy loop: the lump sum is divided into
  // ₪1,000 increments and, at each step, the track whose next increment yields
  // the largest positive marginal gain on the mode's objective receives it.
  // The loop stops when no track can improve the objective or the lump sum is
  // exhausted. Any remainder smaller than one step is granted to the track
  // with the highest marginal gain at its current allocation.
  //
  // Objective (mode-aware):
  //   - reduce_term (Kitzur Tekufa): maximize Net Benefit =
  //     Σ(interest saved) − Σ(penalties). The payment is unchanged, so there
  //     is no cashflow relief; the marginal gain is the net lifetime shekel
  //     interest saved for adding one step.
  //   - reduce_payment (Kitzur Tlash): maximize monthly cashflow relief. The
  //     marginal gain is the monthly relief (₪/mo) gained per shekel spent for
  //     adding one step.
  //
  // Because the operational fee (₪60) triggers on the first non-zero increment
  // of a track, the marginal gain of that first increment already accounts for
  // it, so the optimizer naturally avoids paying the fee unless worthwhile.
  // -------------------------------------------------------------------------

  // Marginal gain of adding one step to track `index` at its current allocation.
  const marginalGainAt = (index: number): number => {
    const current = allocations[index];
    if (current + step > balances[index] + 1e-9) return 0;
    const before = recalculateTrack(tracks[index], current, { mode, hasAdvanceNotice });
    const after = recalculateTrack(tracks[index], current + step, { mode, hasAdvanceNotice });

    if (mode === "reduce_payment") {
      // Monthly cashflow relief (₪/mo) gained per shekel spent for this step.
      const reliefBefore = effectiveMonthlyPayment(tracks[index]) - before.newMonthlyPayment;
      const reliefAfter = effectiveMonthlyPayment(tracks[index]) - after.newMonthlyPayment;
      return (reliefAfter - reliefBefore) / step;
    }

    // reduce_term: strictly maximize the marginal NET INTEREST SAVED (in ₪)
    // per allocation step — NOT months reduced. The efficiency of placing this
    // ₪1,000 increment into track `index` is
    //
    //   Efficiency = (Δ Total Interest Saved − Δ Penalties) / Δ Allocated
    //
    // `netBenefit` already equals interestSaved − penalty − noticeFee −
    // operationalFee, so the marginal net benefit of the step is exactly the
    // numerator above (the notice/operational fees are included for a complete
    // cost accounting). Dividing by the constant step size does not change the
    // ranking across tracks, so we return the raw Δ net benefit.
    return after.netBenefit - before.netBenefit;
  };


  while (remaining >= step) {
    let bestIndex = -1;
    let bestGain = -Infinity;
    for (let i = 0; i < tracks.length; i++) {
      const gain = marginalGainAt(i);
      if (gain > bestGain + 1e-9) {
        bestGain = gain;
        bestIndex = i;
      }
    }
    // If no valid track can accept more funds, or the best marginal gain is
    // non-positive (an extra increment would reduce the objective), stop.
    if (bestIndex < 0 || bestGain <= 0) break;
    allocations[bestIndex] += step;
    remaining -= step;
  }

  // Grant any remainder (< one step) to the track with the highest marginal
  // gain at its current allocation, if it improves the objective.
  if (remaining > 0) {
    let bestIndex = -1;
    let bestGain = -Infinity;
    for (let i = 0; i < tracks.length; i++) {
      const current = allocations[i];
      const amount = Math.min(current + remaining, balances[i]);
      if (amount <= current) continue;
      const before = recalculateTrack(tracks[i], current, { mode, hasAdvanceNotice });
      const after = recalculateTrack(tracks[i], amount, { mode, hasAdvanceNotice });
      let gain: number;
      if (mode === "reduce_payment") {
        const reliefBefore = effectiveMonthlyPayment(tracks[i]) - before.newMonthlyPayment;
        const reliefAfter = effectiveMonthlyPayment(tracks[i]) - after.newMonthlyPayment;
        gain = reliefAfter - reliefBefore;
      } else {
        gain = after.netBenefit - before.netBenefit;
      }
      if (gain > bestGain + 1e-9) {
        bestGain = gain;
        bestIndex = i;
      }
    }
    if (bestIndex >= 0) {
      allocations[bestIndex] = Math.min(
        allocations[bestIndex] + remaining,
        balances[bestIndex]
      );
    }
  }

  // Build the result list, preserving the input track order.
  const results: AllocationResult[] = [];
  for (let i = 0; i < tracks.length; i++) {
    const allocated = allocations[i];
    if (allocated <= 0) continue;
    const r = recalculateTrack(tracks[i], allocated, { mode, hasAdvanceNotice });
    results.push({
      track_id: tracks[i].track_id,
      allocated,
      penalty: r.penalty,
      noticeFee: r.noticeFee,
      interestSaved: r.interestSaved,
      netBenefit: r.netBenefit,
      newMonthlyPayment: r.newMonthlyPayment,
      newRemainingMonths: r.newRemainingMonths,
    });
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
    totalPayoffOutlay += L + r.penalty + r.noticeFee + r.operationalFee;
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
