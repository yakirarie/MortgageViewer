import { describe, it, expect } from 'vitest';
import type { Track } from '../../lib/types';
import {
  computeNoticeFee,
  computeOperationalFee,
  interestDifferentialDiscountFactor,
  computeInterestDifferentialPenalty,
  yearsElapsedSince,
  recalculateTrack,
  getOptimalAllocation,
  computePayoffSummary,
} from '../earlyPayoff';


function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    track_id: 't1',
    custom_name: 'Track 1',
    track_type: 'FIXED_UNLINKED',
    principal_balance: 500000,
    annual_interest_rate: 0.045,
    remaining_term_months: 240,
    monthly_repayment: 0,
    is_payment_manual_override: false,
    amlat_pearei_ribit: 0,
    notice_fee: 0,
    operational_fee: 60,
    months_to_reset: null,
    is_cpi_linked: false,
    rate_history: [],
    ...overrides,
  };
}



describe('computeNoticeFee', () => {
  it('returns 0 when nothing is paid off', () => {
    expect(computeNoticeFee(0, false)).toBe(0);
    expect(computeNoticeFee(-100, false)).toBe(0);
  });

  it('charges 0.1% of principal without advance notice', () => {
    expect(computeNoticeFee(100000, false)).toBe(100);
    expect(computeNoticeFee(250000, false)).toBe(250);
  });

  it('waives the fee when advance notice is given', () => {
    expect(computeNoticeFee(100000, true)).toBe(0);
  });

  it('falls back to the stored bank-statement notice fee when present', () => {
    const track = makeTrack({ principal_balance: 200000, notice_fee: 300 });
    // Full payoff → the stored fee is used verbatim.
    expect(computeNoticeFee(200000, false, track)).toBe(300);
  });

  it('scales the stored notice fee proportionally for a partial payoff', () => {
    const track = makeTrack({ principal_balance: 200000, notice_fee: 300 });
    // Half payoff → half the stored full-discharge fee.
    expect(computeNoticeFee(100000, false, track)).toBeCloseTo(150, 6);
  });

  it('still waives the stored notice fee when advance notice is given', () => {
    const track = makeTrack({ principal_balance: 200000, notice_fee: 300 });
    expect(computeNoticeFee(200000, true, track)).toBe(0);
  });
});

describe('computeOperationalFee', () => {
  it('defaults to the statutory ₪60 fee', () => {
    expect(computeOperationalFee(makeTrack())).toBe(60);
  });

  it('uses the stored operational fee from the profile when present', () => {
    expect(computeOperationalFee(makeTrack({ operational_fee: 120 }))).toBe(120);
  });

  it('falls back to ₪60 when the stored value is missing or invalid', () => {
    expect(computeOperationalFee(makeTrack({ operational_fee: 0 }))).toBe(60);
    expect(computeOperationalFee(makeTrack({ operational_fee: NaN }))).toBe(60);
  });
});

describe('yearsElapsedSince', () => {
  it('returns 0 for missing or invalid dates', () => {
    expect(yearsElapsedSince()).toBe(0);
    expect(yearsElapsedSince('not-a-date')).toBe(0);
  });

  it('computes the years elapsed since an ISO date', () => {
    const years = yearsElapsedSince('2020-01-01');
    expect(years).toBeGreaterThan(5);
    expect(years).toBeLessThan(7);
  });
});

describe('interestDifferentialDiscountFactor', () => {

  it('applies the legal time-elapsed discount tiers', () => {
    expect(interestDifferentialDiscountFactor(0)).toBe(1);
    expect(interestDifferentialDiscountFactor(2.9)).toBe(1);
    expect(interestDifferentialDiscountFactor(3)).toBe(0.8);
    expect(interestDifferentialDiscountFactor(4.9)).toBe(0.8);
    expect(interestDifferentialDiscountFactor(5)).toBe(0.7);
    expect(interestDifferentialDiscountFactor(10)).toBe(0.7);
  });
});

describe('computeInterestDifferentialPenalty', () => {
  it('returns 0 for Prime tracks (no interest gap)', () => {
    const prime = makeTrack({ track_type: 'PRIME' });
    expect(computeInterestDifferentialPenalty(prime, 100000)).toBe(0);
  });

  it('returns 0 when nothing is prepaid', () => {
    const track = makeTrack();
    expect(computeInterestDifferentialPenalty(track, 0)).toBe(0);
  });

  it('returns 0 when the loan rate is at or below the BoI average', () => {
    const track = makeTrack({ annual_interest_rate: 0.03 });
    // BoI average is higher than the loan rate → no gap penalty.
    expect(computeInterestDifferentialPenalty(track, 100000, { boiAverageRate: 0.04 })).toBe(0);
  });

  it('computes a positive penalty when the loan rate exceeds the BoI average', () => {
    const track = makeTrack({ annual_interest_rate: 0.06, remaining_term_months: 120 });
    const penalty = computeInterestDifferentialPenalty(track, 100000, {
      boiAverageRate: 0.04,
      yearsElapsed: 0,
    });
    expect(penalty).toBeGreaterThan(0);
  });

  it('applies the time-elapsed discount to the raw penalty', () => {
    const track = makeTrack({ annual_interest_rate: 0.06, remaining_term_months: 120 });
    const full = computeInterestDifferentialPenalty(track, 100000, {
      boiAverageRate: 0.04,
      yearsElapsed: 0,
    });
    const discounted = computeInterestDifferentialPenalty(track, 100000, {
      boiAverageRate: 0.04,
      yearsElapsed: 5,
    });
    expect(discounted).toBeCloseTo(full * 0.7, 6);
  });

  it('returns 0 for variable tracks past their reset window', () => {
    const track = makeTrack({
      track_type: 'VARIABLE_5Y',
      annual_interest_rate: 0.06,
      months_to_reset: 0,
    });
    expect(computeInterestDifferentialPenalty(track, 100000, { boiAverageRate: 0.04 })).toBe(0);
  });

  it('falls back to the stored bank-statement interest-gap penalty when present', () => {
    const track = makeTrack({ principal_balance: 200000, amlat_pearei_ribit: 5000 });
    // Full payoff → the stored penalty is used verbatim.
    expect(computeInterestDifferentialPenalty(track, 200000)).toBe(5000);
  });

  it('scales the stored interest-gap penalty proportionally for a partial payoff', () => {
    const track = makeTrack({ principal_balance: 200000, amlat_pearei_ribit: 5000 });
    // Quarter payoff → quarter of the stored full-discharge penalty.
    expect(computeInterestDifferentialPenalty(track, 50000)).toBeCloseTo(1250, 6);
  });

  it('applies the time-elapsed discount from the profile start date', () => {
    // start_date 6+ years ago → 30% discount bracket (0.7 factor).
    const track = makeTrack({
      annual_interest_rate: 0.06,
      remaining_term_months: 120,
      start_date: '2018-01-01',
    });
    const discounted = computeInterestDifferentialPenalty(track, 100000, {
      boiAverageRate: 0.04,
    });
    const full = computeInterestDifferentialPenalty(track, 100000, {
      boiAverageRate: 0.04,
      yearsElapsed: 0,
    });
    expect(discounted).toBeCloseTo(full * 0.7, 6);
  });

});


describe('recalculateTrack', () => {
  it('clamps allocation to the live balance', () => {
    const track = makeTrack({ principal_balance: 100000 });
    const result = recalculateTrack(track, 999999, { mode: 'reduce_term' });
    expect(result.newBalance).toBeCloseTo(0, 6);
  });

  it('reduce_payment keeps the term and lowers the monthly payment', () => {
    const track = makeTrack({
      principal_balance: 200000,
      annual_interest_rate: 0.04,
      remaining_term_months: 120,
    });
    const originalPayment = recalculateTrack(track, 0, { mode: 'reduce_payment' }).newMonthlyPayment;
    const result = recalculateTrack(track, 100000, { mode: 'reduce_payment' });
    expect(result.newRemainingMonths).toBe(120);
    expect(result.newMonthlyPayment).toBeGreaterThan(0);
    expect(result.newMonthlyPayment).toBeLessThan(originalPayment);
  });

  it('reduce_term keeps the payment and shortens the term', () => {
    const track = makeTrack({
      principal_balance: 200000,
      annual_interest_rate: 0.04,
      remaining_term_months: 120,
    });
    const result = recalculateTrack(track, 100000, { mode: 'reduce_term' });
    expect(result.newRemainingMonths).toBeLessThan(120);
    expect(result.newRemainingMonths).toBeGreaterThan(0);
  });

  it('netBenefit = interestSaved − penalty − noticeFee − operationalFee', () => {
    const track = makeTrack({
      principal_balance: 200000,
      annual_interest_rate: 0.04,
      remaining_term_months: 120,
    });
    const result = recalculateTrack(track, 50000, {
      mode: 'reduce_term',
      hasAdvanceNotice: false,
      boiAverageRate: 0.03,
    });
    expect(result.netBenefit).toBeCloseTo(
      result.interestSaved - result.penalty - result.noticeFee - result.operationalFee,
      6
    );
  });

  it('charges the statutory ₪60 operational fee per active allocation', () => {
    const track = makeTrack({ principal_balance: 200000, remaining_term_months: 120 });
    const result = recalculateTrack(track, 50000, { mode: 'reduce_term' });
    expect(result.operationalFee).toBe(60);
  });

  it('uses the stored operational fee from the profile when present', () => {
    const track = makeTrack({
      principal_balance: 200000,
      remaining_term_months: 120,
      operational_fee: 120,
    });
    const result = recalculateTrack(track, 50000, { mode: 'reduce_term' });
    expect(result.operationalFee).toBe(120);
  });

  it('waives the operational fee when nothing is allocated', () => {
    const track = makeTrack({ principal_balance: 200000, remaining_term_months: 120 });
    const result = recalculateTrack(track, 0, { mode: 'reduce_term' });
    expect(result.operationalFee).toBe(0);
  });



});

describe('getOptimalAllocation', () => {
  it('allocates up to the lump sum across tracks', () => {
    const tracks = [
      makeTrack({ track_id: 'a', principal_balance: 100000 }),
      makeTrack({ track_id: 'b', principal_balance: 200000 }),
    ];
    const results = getOptimalAllocation(tracks, 150000, 'reduce_term', false);
    const total = results.reduce((s, r) => s + r.allocated, 0);
    expect(total).toBeLessThanOrEqual(150000);
    expect(results.length).toBeGreaterThan(0);
  });

  it('never allocates more than a track balance', () => {
    const tracks = [makeTrack({ track_id: 'a', principal_balance: 50000 })];
    const results = getOptimalAllocation(tracks, 1000000, 'reduce_term', false);
    expect(results[0].allocated).toBe(50000);
  });
});

describe('computePayoffSummary', () => {
  it('aggregates outlay, interest saved, and net benefit', () => {
    const tracks = [
      makeTrack({ track_id: 'a', principal_balance: 100000 }),
      makeTrack({ track_id: 'b', principal_balance: 100000 }),
    ];
    const allocations = { a: 50000, b: 50000 };
    const summary = computePayoffSummary(tracks, allocations, 'reduce_term', false);
    const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0);
    expect(summary.totalPayoffOutlay).toBeGreaterThan(0);
    expect(summary.guaranteedInterestSaved).toBeGreaterThan(0);
    // netBenefit = interestSaved − (penalty + noticeFee); totalPayoffOutlay
    // additionally includes the principal repaid, so add it back.
    expect(summary.netBenefit).toBeCloseTo(
      summary.guaranteedInterestSaved - summary.totalPayoffOutlay + totalAllocated,
      6
    );
  });
});

