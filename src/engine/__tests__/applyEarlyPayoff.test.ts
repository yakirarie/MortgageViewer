import { describe, it, expect } from 'vitest';
import type { Profile, Track } from '../../lib/types';
import { applyEarlyPayoffToProfile } from '../applyEarlyPayoff';
import { liveTrackBalance } from '../../lib/mortgage-math';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    track_id: 't1',
    custom_name: 'Track 1',
    track_type: 'FIXED_UNLINKED',
    original_principal: 500000,
    principal_balance: 500000,
    annual_interest_rate: 0.045,
    original_term_months: 240,
    remaining_term_months: 240,
    monthly_repayment: 3163.45,
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

function makeProfile(tracks: Track[] = [makeTrack()]): Profile {
  return {
    schema_version: 1,
    profile_name: 'My Mashkanta',
    created_at: '2026-01-01T00:00:00.000Z',
    tracks,
  };
}

describe('applyEarlyPayoffToProfile', () => {
  it('returns a new profile object without mutating the input', () => {
    const profile = makeProfile();
    const updated = applyEarlyPayoffToProfile(
      profile,
      { t1: 100000 },
      'reduce_term',
      [{ trackId: 't1', allocatedAmount: 100000, newBalance: 400000, newMonthlyPayment: 3163.45, newTermMonths: 180 }]
    );

    expect(updated).not.toBe(profile);

    expect(updated.tracks).not.toBe(profile.tracks);
    // The original profile is untouched.
    expect(profile.tracks[0].principal_balance).toBe(500000);
  });

  it('reduce_payment lowers the live balance and updates the payment, keeping the term', () => {
    const profile = makeProfile();
    const updated = applyEarlyPayoffToProfile(
      profile,
      { t1: 100000 },
      'reduce_payment',
      [{ trackId: 't1', allocatedAmount: 100000, newBalance: 400000, newMonthlyPayment: 2530.76, newTermMonths: 240 }]

    );

    const track = updated.tracks[0];
    // The live balance (what the UI/KPI/payoff engine use) reflects the payoff.
    expect(liveTrackBalance(track)).toBeCloseTo(400000, 6);
    expect(track.principal_balance).toBeCloseTo(400000, 6);
    expect(track.original_principal).toBeCloseTo(400000, 6);
    expect(track.monthly_repayment).toBeCloseTo(2530.76, 6);
    expect(track.remaining_term_months).toBe(240); // unchanged
    // The committed payment is preserved against later auto-recalc.
    expect(track.is_payment_manual_override).toBe(true);
  });

  it('reduce_term lowers the live balance and shortens the term, keeping the payment', () => {
    const profile = makeProfile();
    const updated = applyEarlyPayoffToProfile(
      profile,
      { t1: 100000 },
      'reduce_term',
      [{ trackId: 't1', allocatedAmount: 100000, newBalance: 400000, newMonthlyPayment: 3163.45, newTermMonths: 180 }]
    );

    const track = updated.tracks[0];
    expect(liveTrackBalance(track)).toBeCloseTo(400000, 6);
    expect(track.principal_balance).toBeCloseTo(400000, 6);
    expect(track.original_principal).toBeCloseTo(400000, 6);
    expect(track.remaining_term_months).toBe(180);

    expect(track.original_term_months).toBe(180);
    expect(track.monthly_repayment).toBeCloseTo(3163.45, 6); // unchanged
    expect(track.is_payment_manual_override).toBe(false); // unchanged
  });

  it('preserves the amortization timeline and lowers the live balance via linearity', () => {
    const profile = makeProfile([makeTrack({ start_date: '2023-09-13', first_payout_date: '2023-09-13' })]);
    const updated = applyEarlyPayoffToProfile(
      profile,
      { t1: 100000 },
      'reduce_term',
      [{ trackId: 't1', allocatedAmount: 100000, newBalance: 400000, newMonthlyPayment: 3163.45, newTermMonths: 180 }]
    );

    const track = updated.tracks[0];
    // The original schedule is preserved (no re-origination to today).
    expect(track.start_date).toBe('2023-09-13');
    expect(track.first_payout_date).toBe('2023-09-13');
    // The amortization seed is scaled down (not simply reduced by the
    // allocation) so the derived live balance lands exactly on the target.
    expect(track.original_principal).toBeLessThan(500000);
    expect(track.original_principal).toBeGreaterThan(400000);
    // The live balance reflects the payoff exactly (Agorot-level precision).
    expect(liveTrackBalance(track)).toBeCloseTo(400000, 2);

  });



  it('clamps the balance at zero when the allocation exceeds the balance', () => {
    const profile = makeProfile([makeTrack({ principal_balance: 50000, original_principal: 50000 })]);
    const updated = applyEarlyPayoffToProfile(
      profile,
      { t1: 100000 },
      'reduce_term',
      [{ trackId: 't1', allocatedAmount: 100000, newBalance: 0, newMonthlyPayment: 0, newTermMonths: 0 }]
    );

    expect(updated.tracks[0].principal_balance).toBe(0);

    expect(liveTrackBalance(updated.tracks[0])).toBe(0);
  });

  it('leaves tracks with no allocation untouched', () => {
    const trackA = makeTrack({ track_id: 'a', principal_balance: 300000, original_principal: 300000 });
    const trackB = makeTrack({ track_id: 'b', principal_balance: 200000, original_principal: 200000 });
    const profile = makeProfile([trackA, trackB]);

    const updated = applyEarlyPayoffToProfile(
      profile,
      { a: 100000 },
      'reduce_payment',
      [{ trackId: 'a', allocatedAmount: 100000, newBalance: 200000, newMonthlyPayment: 2000, newTermMonths: 240 }]
    );

    expect(updated.tracks[0].principal_balance).toBeCloseTo(200000, 6);

    expect(updated.tracks[1]).toBe(trackB); // untouched reference preserved
    expect(updated.tracks[1].principal_balance).toBe(200000);
  });

  it('falls back to the current payment/term when a track result is missing', () => {
    const profile = makeProfile();
    const updated = applyEarlyPayoffToProfile(
      profile,
      { t1: 100000 },
      'reduce_payment',
      [] // no results supplied
    );

    const track = updated.tracks[0];
    expect(track.principal_balance).toBeCloseTo(400000, 6);
    expect(track.monthly_repayment).toBeCloseTo(3163.45, 6); // falls back
  });

  it('bumps created_at to reflect the mutation', () => {
    const profile = makeProfile();
    const updated = applyEarlyPayoffToProfile(
      profile,
      { t1: 100000 },
      'reduce_term',
      [{ trackId: 't1', allocatedAmount: 100000, newBalance: 400000, newMonthlyPayment: 3163.45, newTermMonths: 180 }]
    );

    expect(updated.created_at).not.toBe(profile.created_at);

    expect(new Date(updated.created_at).getTime()).toBeGreaterThanOrEqual(
      new Date(profile.created_at).getTime()
    );
  });
});
