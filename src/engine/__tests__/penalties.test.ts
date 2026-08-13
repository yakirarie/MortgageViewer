import { describe, it, expect } from 'vitest';

import type { Track } from '../../lib/types';
import { getBoiBenchmarkRate } from '../../lib/rates-api';
import {
  calculateTrackPayoffBreakdown,
  calculateTrackPayoffBreakdownAuto,
  calculateElapsedMonths,
  getPenaltyHorizon,
  isVariableRateTrack,
  roundTwoDecimals,
} from '../penalties';
import { getOptimalAllocation } from '../earlyPayoff';


function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    track_id: 't1',
    custom_name: 'Track 1',
    track_type: 'FIXED_UNLINKED',
    principal_balance: 763240.63,
    annual_interest_rate: 0.051,
    remaining_term_months: 325,
    monthly_repayment: 0,
    is_payment_manual_override: false,
    amlat_pearei_ribit: 0,
    notice_fee: 0,
    operational_fee: 60,
    months_to_reset: null,
    is_cpi_linked: false,
    start_date: '2023-01-05',
    ...overrides,
  };
}

describe('getBoiBenchmarkRate', () => {
  it('returns 0.0473 for a 27-year (325-month) fixed unlinked track', () => {
    expect(getBoiBenchmarkRate('FIXED_UNLINKED', 325)).toBeCloseTo(0.0473, 6);
  });

  it('matches the correct duration tier', () => {
    expect(getBoiBenchmarkRate('FIXED_UNLINKED', 60)).toBeCloseTo(0.043, 6);
    expect(getBoiBenchmarkRate('FIXED_UNLINKED', 120)).toBeCloseTo(0.045, 6);
    expect(getBoiBenchmarkRate('FIXED_UNLINKED', 180)).toBeCloseTo(0.046, 6);
    expect(getBoiBenchmarkRate('FIXED_UNLINKED', 300)).toBeCloseTo(0.047, 6);
    expect(getBoiBenchmarkRate('FIXED_UNLINKED', 301)).toBeCloseTo(0.0473, 6);
  });

  it('falls back to the current base rate for an unknown track type', () => {
    const rate = getBoiBenchmarkRate('UNKNOWN', 325);
    expect(rate).toBeGreaterThan(0);
    expect(rate).toBeLessThan(1);
  });
});

describe('calculateElapsedMonths', () => {
  it('returns 0 for missing or invalid dates', () => {
    expect(calculateElapsedMonths()).toBe(0);
    expect(calculateElapsedMonths('not-a-date')).toBe(0);
  });

  it('computes whole months elapsed since a start date', () => {
    const months = calculateElapsedMonths('2023-01-05');
    expect(months).toBeGreaterThan(36); // > 3 years → 20% discount bracket
  });
});

describe('roundTwoDecimals', () => {
  it('rounds to two decimal places', () => {
    expect(roundTwoDecimals(763.24063)).toBe(763.24);
    expect(roundTwoDecimals(60)).toBe(60);
    expect(roundTwoDecimals(NaN)).toBe(0);
  });
});

describe('isVariableRateTrack', () => {
  it('identifies Variable Rate (Mishtana) tracks', () => {
    expect(isVariableRateTrack(makeTrack({ track_type: 'VARIABLE_5Y' }))).toBe(true);
    expect(isVariableRateTrack(makeTrack({ track_type: 'VARIABLE_5Y_LINKED' }))).toBe(true);
  });

  it('returns false for fixed and prime tracks', () => {
    expect(isVariableRateTrack(makeTrack({ track_type: 'FIXED_UNLINKED' }))).toBe(false);
    expect(isVariableRateTrack(makeTrack({ track_type: 'FIXED_LINKED' }))).toBe(false);
    expect(isVariableRateTrack(makeTrack({ track_type: 'PRIME' }))).toBe(false);
  });
});

describe('getPenaltyHorizon', () => {
  it('uses the full remaining term for non-variable tracks', () => {
    expect(getPenaltyHorizon(makeTrack({ remaining_term_months: 325 }))).toBe(325);
  });

  it('caps the horizon at the months until the next reset for variable tracks', () => {
    // 25 months until reset < 325 remaining → horizon is 25.
    const track = makeTrack({
      track_type: 'VARIABLE_5Y',
      remaining_term_months: 325,
      months_to_reset: 25,
    });
    expect(getPenaltyHorizon(track)).toBe(25);
  });

  it('uses the remaining term when the reset window is missing or larger', () => {
    // No reset window → fall back to the full remaining term.
    expect(
      getPenaltyHorizon(makeTrack({ track_type: 'VARIABLE_5Y', remaining_term_months: 325, months_to_reset: null }))
    ).toBe(325);
    // Reset window larger than the remaining term → capped by the remaining term.
    expect(
      getPenaltyHorizon(makeTrack({ track_type: 'VARIABLE_5Y', remaining_term_months: 10, months_to_reset: 25 }))
    ).toBe(10);
  });

  it('returns 0 when the remaining term is missing or zero', () => {
    expect(getPenaltyHorizon(makeTrack({ remaining_term_months: 0 }))).toBe(0);
  });
});

describe('calculateTrackPayoffBreakdown', () => {

  // Bank Discount payoff-statement benchmark:
  //   Principal: ₪763,240.63 | Contract rate: 5.10% | BOI benchmark: 4.73%
  //   Remaining: 325 months | Elapsed: > 3 years (20% discount) | No notice.
  const track = makeTrack();
  const breakdown = calculateTrackPayoffBreakdown(track, track.principal_balance, 0.0473, false);

  it('reports the remaining principal', () => {
    expect(breakdown.remainingPrincipal).toBeCloseTo(763240.63, 2);
  });

  it('charges the statutory ₪60 operational fee', () => {
    expect(breakdown.operationalFee).toBe(60);
  });

  it('charges the no-notice fee as 0.1% of the payoff amount', () => {
    // 0.1% of ₪763,240.63 ≈ ₪763.24
    expect(breakdown.noNoticeFee).toBeCloseTo(763.24, 2);
  });

  it('computes a positive interest differential fee with the 20% age discount', () => {
    // Contract (5.10%) > benchmark (4.73%) → a gap penalty is due.
    expect(breakdown.interestDifferentialFee).toBeGreaterThan(0);

    // Verify the 20% discount is applied: recompute the raw gap with a fresh
    // track whose start date is recent (< 3 years → 0% discount) and confirm
    // the reported fee is 80% of that undiscounted value.
    const recentTrack = makeTrack({ start_date: new Date().toISOString().slice(0, 10) });

    const rawBreakdown = calculateTrackPayoffBreakdown(
      recentTrack,
      recentTrack.principal_balance,
      0.0473,
      false
    );
    expect(breakdown.interestDifferentialFee).toBeCloseTo(
      rawBreakdown.interestDifferentialFee * 0.8,
      0
    );
  });

  it('waives the no-notice fee when advance notice is given', () => {
    const withNotice = calculateTrackPayoffBreakdown(track, track.principal_balance, 0.0473, true);
    expect(withNotice.noNoticeFee).toBe(0);
  });

  it('sums penalties and settlement amount correctly', () => {
    expect(breakdown.totalPenalties).toBeCloseTo(
      breakdown.operationalFee + breakdown.noNoticeFee + breakdown.interestDifferentialFee,
      2
    );
    // totalSettlementAmount is the rounded sum of the (already rounded)
    // outstanding balance and penalties, so allow a 1-agora rounding tolerance.
    expect(breakdown.totalSettlementAmount).toBeCloseTo(
      breakdown.totalOutstandingBalance + breakdown.totalPenalties,
      1
    );

  });

  it('computes accrued interest from the days since the last payment', () => {
    const b = calculateTrackPayoffBreakdown(track, track.principal_balance, 0.0473, false, 30);
    const monthlyRate = track.annual_interest_rate / 12;
    expect(b.accruedInterest).toBeCloseTo(track.principal_balance * monthlyRate, 2);
  });

  it('derives the benchmark automatically via the Auto wrapper', () => {
    const auto = calculateTrackPayoffBreakdownAuto(track, track.principal_balance, false);
    // 325-month fixed unlinked → benchmark 0.0473.
    const explicit = calculateTrackPayoffBreakdown(track, track.principal_balance, 0.0473, false);
    expect(auto.interestDifferentialFee).toBeCloseTo(explicit.interestDifferentialFee, 2);
  });

  it('feeds the auto-calculated penalty into getOptimalAllocation', () => {
    // The payoff breakdown's interest-differential fee is the same gap penalty
    // the allocation engine uses. Verify the engine consumes a track whose
    // penalty is auto-derived (via the benchmark) and produces a valid result.
    const tracks = [
      makeTrack({ track_id: 'kalatz', principal_balance: 763240.63, annual_interest_rate: 0.051, remaining_term_months: 325 }),
      makeTrack({ track_id: 'mishtana', track_type: 'VARIABLE_5Y', principal_balance: 381483, annual_interest_rate: 0.048, remaining_term_months: 325, months_to_reset: 25 }),
    ];
    const results = getOptimalAllocation(tracks, 100000, 'reduce_term', false);
    const total = results.reduce((s, r) => s + r.allocated, 0);
    expect(total).toBeGreaterThan(0);
    expect(total).toBeLessThanOrEqual(100000);
  });

  it('includes the indexation penalty in the total penalties sum', () => {
    // indexationPenalty is a distinct line item (defaults to 0) and must be
    // part of the total so the sum always equals its parts.
    expect(breakdown.indexationPenalty).toBe(0);
    expect(breakdown.totalPenalties).toBeCloseTo(
      breakdown.operationalFee +
        breakdown.noNoticeFee +
        breakdown.interestDifferentialFee +
        breakdown.indexationPenalty,
      2
    );
  });

  it('does NOT zero the total when only the interest-gap fee is 0', () => {
    // A track whose contract rate is at/below the benchmark has a 0 gap fee,
    // but the operational + no-notice fees must still be summed into the total.
    const noGap = makeTrack({ annual_interest_rate: 0.04 }); // 4.00% ≤ 4.73% benchmark
    const b = calculateTrackPayoffBreakdown(noGap, noGap.principal_balance, 0.0473, false);

    expect(b.interestDifferentialFee).toBe(0);
    expect(b.operationalFee).toBe(60);
    expect(b.noNoticeFee).toBeCloseTo(noGap.principal_balance * 0.001, 2);
    // Total = 60 + no-notice + 0 + 0 — must NOT collapse to 0.
    expect(b.totalPenalties).toBeCloseTo(
      b.operationalFee + b.noNoticeFee + b.interestDifferentialFee + b.indexationPenalty,
      2
    );
    expect(b.totalPenalties).toBeGreaterThan(0);
  });
});


describe('Variable Rate (Mishtana) penalty horizon', () => {
  // A Mishtana track with 25 months until its next rate reset (10/09/2028) and
  // 325 months remaining. The gap penalty and benchmark lookup must use the
  // 25-month horizon, NOT the full remaining term.
  const mishtana = makeTrack({
    track_id: 'mishtana',
    track_type: 'VARIABLE_5Y',
    principal_balance: 381483,
    annual_interest_rate: 0.048,
    remaining_term_months: 325,
    months_to_reset: 25,
  });

  it('looks up the benchmark using the reset horizon, not the full remaining term', () => {
    // 25 months → ≤60-month tier → 0.041 (not the 0.0453 tier for 325 months).
    expect(getBoiBenchmarkRate('VARIABLE_5Y', 25)).toBeCloseTo(0.041, 6);
    expect(getBoiBenchmarkRate('VARIABLE_5Y', 325)).toBeCloseTo(0.0453, 6);

    const auto = calculateTrackPayoffBreakdownAuto(mishtana, mishtana.principal_balance, false);
    // The auto wrapper must match the explicit 25-month benchmark (0.041).
    const explicit = calculateTrackPayoffBreakdown(mishtana, mishtana.principal_balance, 0.041, false);
    expect(auto.interestDifferentialFee).toBeCloseTo(explicit.interestDifferentialFee, 2);
  });

  it('charges a gap penalty when the contract rate exceeds the short-horizon benchmark', () => {
    // Contract 4.80% > benchmark 4.10% (25-month tier) → a gap penalty is due,
    // discounted over the 25-month horizon.
    const auto = calculateTrackPayoffBreakdownAuto(mishtana, mishtana.principal_balance, false);
    expect(auto.interestDifferentialFee).toBeGreaterThan(0);
  });

  it('returns 0 gap penalty when the contract rate is at or below the short-horizon benchmark', () => {
    // Contract 4.00% ≤ benchmark 4.10% (25-month tier) → no gap to compensate.
    const lowRate = makeTrack({
      track_id: 'mishtana-low',
      track_type: 'VARIABLE_5Y',
      principal_balance: 381483,
      annual_interest_rate: 0.04,
      remaining_term_months: 325,
      months_to_reset: 25,
    });
    const auto = calculateTrackPayoffBreakdownAuto(lowRate, lowRate.principal_balance, false);
    expect(auto.interestDifferentialFee).toBe(0);
  });

  it('uses the full remaining term when no reset window is set', () => {
    // Without a reset window the horizon falls back to the full remaining term
    // (325 months → 0.0453 tier), so a 4.80% contract still incurs a gap.
    const noReset = makeTrack({
      track_id: 'mishtana-noreset',
      track_type: 'VARIABLE_5Y',
      principal_balance: 381483,
      annual_interest_rate: 0.048,
      remaining_term_months: 325,
      months_to_reset: null,
    });
    const auto = calculateTrackPayoffBreakdownAuto(noReset, noReset.principal_balance, false);
    expect(auto.interestDifferentialFee).toBeGreaterThan(0);
  });
});

