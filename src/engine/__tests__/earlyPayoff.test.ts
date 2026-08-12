import { describe, it, expect } from 'vitest';
import type { Track } from '../../lib/types';
import { liveTrackBalance, effectiveMonthlyPayment } from '../../lib/mortgage-math';
import { populatePrimeRateHistory } from '../../lib/rates-api';
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

  it('uses the effective rate (BoI base + margin) for a Prime track with rate history', () => {
    // A Prime track whose stored `annual_interest_rate` snapshot (5.5%) lags
    // its live effective rate (BoI base + margin, ~4.4%). The recomputed
    // payment must use the effective rate so that reduce_payment produces a
    // *positive* cashflow relief rather than a spurious negative one.
    const prime = makeTrack({
      track_id: 'prime',
      track_type: 'PRIME',
      principal_balance: 472771,
      annual_interest_rate: 0.055, // stale snapshot
      remaining_term_months: 220,
      start_date: '2023-01-05',
      first_payout_date: '2023-02-05',
      prime_margin: -0.006,
      original_principal: 500000,
      original_term_months: 360,
      rate_history: populatePrimeRateHistory('2023-01-05', -0.006),
    });

    const originalPayment = effectiveMonthlyPayment(prime);
    const result = recalculateTrack(prime, 100000, { mode: 'reduce_payment' });

    // The recomputed payment must be lower than the original → positive relief.
    expect(result.newMonthlyPayment).toBeLessThan(originalPayment);
    expect(originalPayment - result.newMonthlyPayment).toBeGreaterThan(0);
  });

  it('returns the baseline unchanged when nothing is allocated', () => {
    // A track with no allocation must contribute zero relief / interest saved,
    // even when its effective payment differs from a fresh Spitzer recompute on
    // the live balance (the case that previously fabricated spurious relief).
    const prime = makeTrack({
      track_id: 'prime',
      track_type: 'PRIME',
      principal_balance: 472771,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      start_date: '2023-01-05',
      first_payout_date: '2023-02-05',
      prime_margin: -0.006,
      original_principal: 500000,
      original_term_months: 360,
      rate_history: populatePrimeRateHistory('2023-01-05', -0.006),
    });

    const result = recalculateTrack(prime, 0, { mode: 'reduce_payment' });
    expect(result.interestSaved).toBe(0);
    expect(result.netBenefit).toBe(0);
    expect(result.newMonthlyPayment).toBeCloseTo(effectiveMonthlyPayment(prime), 6);
    expect(result.newRemainingMonths).toBe(prime.remaining_term_months);
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
    // The optimizer stops at the marginal optimum: it never exceeds the
    // balance, and it stops allocating once an extra increment would reduce
    // net benefit (interest-gap penalty + notice fee outweigh interest saved).
    expect(results[0].allocated).toBeGreaterThan(0);
    expect(results[0].allocated).toBeLessThanOrEqual(50000);
  });


  it('beats an equal split on total net benefit', () => {
    // A heterogeneous portfolio where the optimizer should concentrate the
    // lump sum on the highest-marginal-benefit tracks rather than spreading it
    // evenly. Two high-rate tracks dominate the low-rate track, so the optimal
    // allocation pours the full lump sum into the high-rate pair.
    const tracks = [
      makeTrack({
        track_id: 'a',
        custom_name: 'High-rate fixed 1',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.06,
        remaining_term_months: 360,
      }),
      makeTrack({
        track_id: 'b',
        custom_name: 'High-rate fixed 2',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.06,
        remaining_term_months: 360,
      }),
      makeTrack({
        track_id: 'c',
        custom_name: 'Low-rate fixed',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.03,
        remaining_term_months: 360,
      }),
    ];


    const lumpSum = 100000;
    const mode = 'reduce_term' as const;

    // Equal split: distribute the lump sum evenly across all three tracks.
    const equalShare = lumpSum / tracks.length;
    const equalAllocations: Record<string, number> = {};
    tracks.forEach((t) => {
      equalAllocations[t.track_id] = Math.min(equalShare, liveTrackBalance(t));
    });
    const equalNetBenefit = computePayoffSummary(
      tracks,
      equalAllocations,
      mode,
      false
    ).netBenefit;

    // Optimal allocation from the step-wise marginal optimizer.
    const optimal = getOptimalAllocation(tracks, lumpSum, mode, false);
    const optimalAllocations: Record<string, number> = {};
    optimal.forEach((r) => {
      optimalAllocations[r.track_id] = r.allocated;
    });
    const optimalNetBenefit = computePayoffSummary(
      tracks,
      optimalAllocations,
      mode,
      false
    ).netBenefit;

    // The optimizer must strictly beat the equal split.
    expect(optimalNetBenefit).toBeGreaterThan(equalNetBenefit);
    // Sanity: the optimal net benefit exceeds the reference figure of ₪219,766.
    expect(optimalNetBenefit).toBeGreaterThan(219766);
  });

  it('is mode-aware: reduce_term maximizes net benefit', () => {
    // A heterogeneous portfolio where the optimizer concentrates the lump sum
    // on the high-rate tracks. In reduce_term mode the objective is purely
    // net benefit (interest saved − penalties).
    const tracks = [
      makeTrack({
        track_id: 'a',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.06,
        remaining_term_months: 360,
      }),
      makeTrack({
        track_id: 'b',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.06,
        remaining_term_months: 360,
      }),
      makeTrack({
        track_id: 'c',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.03,
        remaining_term_months: 360,
      }),
    ];

    const optimal = getOptimalAllocation(tracks, 100000, 'reduce_term', false);
    const allocations: Record<string, number> = {};
    optimal.forEach((r) => {
      allocations[r.track_id] = r.allocated;
    });
    const summary = computePayoffSummary(tracks, allocations, 'reduce_term', false);

    // reduce_term keeps the payment constant, so there is no cashflow relief.
    expect(summary.monthlyCashflowRelief).toBe(0);
    // Net benefit must clear the ₪237,000 threshold.
    expect(summary.netBenefit).toBeGreaterThanOrEqual(237000);
  });

  it('is mode-aware: reduce_payment maximizes net benefit and cashflow relief', () => {
    const tracks = [
      makeTrack({
        track_id: 'a',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.06,
        remaining_term_months: 360,
      }),
      makeTrack({
        track_id: 'b',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.06,
        remaining_term_months: 360,
      }),
      makeTrack({
        track_id: 'c',
        track_type: 'FIXED_UNLINKED',
        principal_balance: 500000,
        annual_interest_rate: 0.03,
        remaining_term_months: 360,
      }),
    ];

    const optimal = getOptimalAllocation(tracks, 100000, 'reduce_payment', false);
    const allocations: Record<string, number> = {};
    optimal.forEach((r) => {
      allocations[r.track_id] = r.allocated;
    });
    const summary = computePayoffSummary(tracks, allocations, 'reduce_payment', false);

    // reduce_payment keeps the term constant and lowers the monthly payment,
    // so both net benefit and monthly cashflow relief are produced.
    expect(summary.netBenefit).toBeGreaterThanOrEqual(80000);
    expect(summary.monthlyCashflowRelief).toBeGreaterThanOrEqual(550);
  });

  it('reduce_payment shifts away from a no-penalty Prime track toward high-relief tracks', () => {
    // A Prime track has no interest-gap penalty, so a pure net-benefit
    // maximizer would dump the whole lump sum into it — but Prime yields
    // negligible monthly cashflow relief. In reduce_payment mode the optimizer
    // must instead favor the tracks that actually lower the monthly payment.
    const prime = makeTrack({
      track_id: 'prime',
      custom_name: 'Prime',
      track_type: 'PRIME',
      principal_balance: 472771,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      start_date: '2023-01-05',
      first_payout_date: '2023-02-05',
      prime_margin: -0.006,
      original_principal: 500000,
      original_term_months: 360,
      rate_history: populatePrimeRateHistory('2023-01-05', -0.006),
    });
    const fixed = makeTrack({
      track_id: 'fixed',
      custom_name: 'Fixed Unlinked',
      track_type: 'FIXED_UNLINKED',
      principal_balance: 500000,
      annual_interest_rate: 0.045,
      remaining_term_months: 240,
    });
    const variable = makeTrack({
      track_id: 'variable',
      custom_name: 'Variable 5Y',
      track_type: 'VARIABLE_5Y',
      principal_balance: 500000,
      annual_interest_rate: 0.05,
      remaining_term_months: 240,
      months_to_reset: 12,
    });

    const tracks = [prime, fixed, variable];
    const optimal = getOptimalAllocation(tracks, 100000, 'reduce_payment', false);
    const allocations: Record<string, number> = {};
    optimal.forEach((r) => {
      allocations[r.track_id] = r.allocated;
    });
    const summary = computePayoffSummary(tracks, allocations, 'reduce_payment', false);

    // The allocation must not be dumped entirely into Prime (which gives
    // negligible relief) — it should produce meaningful monthly cashflow relief.
    expect(summary.monthlyCashflowRelief).toBeGreaterThanOrEqual(550);
    // And the Prime track must not receive the entire lump sum.
    expect(allocations['prime'] ?? 0).toBeLessThan(100000);
  });

  it('reduce_payment prefers the highest-relief track over a small-balance Prime track', () => {
    // Mirrors a real portfolio: a Prime track with a small balance and a rate
    // history (so its first-step marginal relief is high) alongside larger
    // Kalatz/Mishtana tracks with manual-override payments and gap penalties.
    // The relief-per-₪ ranking must steer the lump sum to the track that
    // actually lowers the monthly payment the most, not to Prime.
    const prime = makeTrack({
      track_id: 'prime',
      custom_name: 'Prime',
      track_type: 'PRIME',
      principal_balance: 191162,
      annual_interest_rate: 0.042,
      remaining_term_months: 325,
      monthly_repayment: 985.55,
      is_payment_manual_override: false,
      amlat_pearei_ribit: 0,
      notice_fee: 192,
      start_date: '2023-09-13',
      first_payout_date: '2023-10-10',
      prime_margin: -0.008,
      original_principal: 200000,
      original_term_months: 360,
      rate_history: populatePrimeRateHistory('2023-09-13', -0.008),
    });
    const kalatz = makeTrack({
      track_id: 'kalatz',
      custom_name: 'Kalatz',
      track_type: 'FIXED_UNLINKED',
      principal_balance: 763517,
      annual_interest_rate: 0.049,
      remaining_term_months: 325,
      monthly_repayment: 4245.81,
      is_payment_manual_override: true,
      amlat_pearei_ribit: 3283,
      notice_fee: 767,
      start_date: '2023-09-13',
      first_payout_date: '2023-10-10',
      original_principal: 800000,
      original_term_months: 360,
    });
    const mishtana = makeTrack({
      track_id: 'mishtana',
      custom_name: 'Mishtana',
      track_type: 'VARIABLE_5Y',
      principal_balance: 382009,
      annual_interest_rate: 0.0498,
      remaining_term_months: 325,
      monthly_repayment: 2141.91,
      is_payment_manual_override: true,
      amlat_pearei_ribit: 3275,
      notice_fee: 384,
      months_to_reset: 25,
      start_date: '2023-09-13',
      first_payout_date: '2023-10-10',
      original_principal: 400000,
      original_term_months: 360,
    });

    const tracks = [prime, kalatz, mishtana];
    const optimal = getOptimalAllocation(tracks, 100000, 'reduce_payment', false);
    const allocations: Record<string, number> = {};
    optimal.forEach((r) => {
      allocations[r.track_id] = r.allocated;
    });
    const summary = computePayoffSummary(tracks, allocations, 'reduce_payment', false);

    // The lump sum must not be dumped into Prime — Mishtana yields the highest
    // relief-per-₪ and should receive the allocation.
    expect(allocations['prime'] ?? 0).toBe(0);
    expect(allocations['mishtana'] ?? 0).toBeGreaterThan(0);
    expect(summary.monthlyCashflowRelief).toBeGreaterThanOrEqual(550);
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

