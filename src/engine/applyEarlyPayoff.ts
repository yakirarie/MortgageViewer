// Apply Early Payoff to Profile
// Pure, side-effect-free transformer that commits a payoff allocation to the
// active mortgage profile. Returns a brand-new Profile object; the input is
// never mutated.
//
// The app derives a track's live balance from an amortization simulation seeded
// by `original_principal` / `start_date` / `original_term_months` (see
// `deriveTrackPayoff` in mortgage-math.ts) — NOT from the stored
// `principal_balance` snapshot. The amortization is *linear* in the starting
// principal (each month's payment and interest scale with the current balance),
// so reducing `original_principal` by the allocated amount reduces the live
// balance by exactly that amount while preserving the original amortization
// timeline. This is how a bank models a partial early payoff: the loan keeps its
// schedule, just at a lower principal.

import type { Profile, Track, PayoffReductionMode } from "../lib/types";
import { deriveTrackPayoff, liveTrackBalance } from "../lib/mortgage-math";


/**
 * The per-track outcome of a payoff execution, as produced by the Early Payoff
 * engine (`recalculateTrack` / `AllocationResult`). `newTermMonths` is only
 * meaningful in reduce_term mode; `newMonthlyPayment` only in reduce_payment.
 */
export interface PayoffExecutionResult {
  trackId: string;
  allocatedAmount: number;
  /** The target live balance after the payoff (₪), as computed by the engine. */
  newBalance: number;
  newMonthlyPayment: number;
  newTermMonths: number;
}

/**
 * Commit a payoff allocation to the active profile.
 *
 * For each track with a positive allocation:
 *   - `original_principal` is reduced by the allocated amount, which lowers the
 *     amortization-derived live balance by exactly that amount (linearity).
 *   - `principal_balance` is set to the engine-computed target live balance so
 *     the stored snapshot stays consistent with the derived value.
 *   - reduce_payment: the monthly payment is set to the recomputed value and
 *     flagged as a manual override so the committed payment is preserved; the
 *     remaining term is unchanged.
 *   - reduce_term: the remaining term is set to the recomputed (shorter) value;
 *     `original_term_months` is extended by the already-elapsed months so the
 *     derived remaining term matches the target; the monthly payment is
 *     unchanged.
 *
 * Tracks with no allocation are returned untouched. The returned profile is a
 * new object with `created_at` bumped to the current timestamp to reflect the
 * mutation.
 */
export function applyEarlyPayoffToProfile(
  currentProfile: Profile,
  allocations: Record<string, number>,
  mode: PayoffReductionMode,
  trackResults: PayoffExecutionResult[]
): Profile {
  const resultMap = new Map(trackResults.map((r) => [r.trackId, r]));

  const updatedTracks: Track[] = currentProfile.tracks.map((track) => {
    const allocation = allocations[track.track_id] || 0;
    if (allocation <= 0) return track;

    const result = resultMap.get(track.track_id);
    // Use the engine-computed target live balance (which accounts for accrued
    // interest), falling back to the stored snapshot minus the allocation.
    const newBalance = result
      ? Math.max(0, result.newBalance)
      : Math.max(0, track.principal_balance - allocation);

    // The amortization (net principal + accrued daily interest) is linear in the
    // starting principal for a *fixed* original term, so the live balance scales
    // proportionally with `original_principal`. To land the live balance exactly
    // on the engine's target `newBalance`, scale the amortization seed by the
    // ratio `newBalance / liveBalance` evaluated at the term the track will
    // actually carry after the payoff. This preserves the schedule while
    // committing the payoff precisely (including the accrued-interest correction
    // that a naive `seed - allocation` would miss).
    const seed = track.original_principal ?? track.principal_balance;

    if (mode === "reduce_payment") {
      // Term is unchanged → scale against the current live balance.
      const liveBalance = liveTrackBalance(track);
      const newOriginalPrincipal =
        liveBalance > 0
          ? Math.max(0, seed * (newBalance / liveBalance))
          : Math.max(0, seed - allocation);
      const newPayment = result
        ? result.newMonthlyPayment
        : track.monthly_repayment;
      return {
        ...track,
        original_principal: newOriginalPrincipal,
        principal_balance: newBalance,
        // Keep the remaining term; commit the recomputed payment.
        monthly_repayment: newPayment,
        is_payment_manual_override: true,
      };
    }

    // reduce_term: keep the payment, shorten the term.
    const newTerm = result
      ? result.newTermMonths
      : track.remaining_term_months;
    // The derived remaining term is `original_term_months - elapsed`. To make
    // it equal the target `newTerm`, extend the original term by the months
    // already elapsed on the loan.
    const derived = deriveTrackPayoff(track);
    const elapsed = derived ? derived.monthsElapsed : 0;
    const newOriginalTerm = Math.max(0, newTerm + elapsed);
    // The term changes, so scale against the live balance at the *new* original
    // term (with the original principal) to keep the payoff exact.
    const liveAtNewTerm = liveTrackBalance({
      ...track,
      original_term_months: newOriginalTerm,
    });
    const newOriginalPrincipal =
      liveAtNewTerm > 0
        ? Math.max(0, seed * (newBalance / liveAtNewTerm))
        : Math.max(0, seed - allocation);
    return {
      ...track,
      original_principal: newOriginalPrincipal,
      principal_balance: newBalance,
      original_term_months: newOriginalTerm,
      remaining_term_months: newTerm,
      // monthly_repayment stays unchanged.
    };

  });

  return {
    ...currentProfile,
    tracks: updatedTracks,
    created_at: new Date().toISOString(),
  };
}
