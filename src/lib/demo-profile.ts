// Demo profile data per PRD §2.3.2

import type { Profile, Track } from './types';
import { generateId } from './utils';
import { populatePrimeRateHistory } from './rates-api';


export function createDemoProfile(): Profile {
  const now = new Date().toISOString();

  const tracks: Track[] = [
    {
      track_id: generateId(),
      custom_name: 'Prime',
      track_type: 'PRIME',
      principal_balance: 480000,
      annual_interest_rate: 0.055,
      remaining_term_months: 220,
      monthly_repayment: 0, // Will be auto-calculated
      is_payment_manual_override: false,
      amlat_pearei_ribit: 0,
      notice_fee: 720,
      operational_fee: 60,
      months_to_reset: null,
      is_cpi_linked: false,
      start_date: '2023-01-05',

      first_payout_date: '2023-02-05',
      prime_margin: -0.006,
      original_principal: 500000,
      original_term_months: 360,
      rate_history: populatePrimeRateHistory('2023-01-05', -0.006),

    },

    {
      track_id: generateId(),
      custom_name: 'Fixed Unlinked',
      track_type: 'FIXED_UNLINKED',
      principal_balance: 350000,
      annual_interest_rate: 0.051,
      remaining_term_months: 180,
      monthly_repayment: 0, // Will be auto-calculated
      is_payment_manual_override: false,
      amlat_pearei_ribit: 0,
      notice_fee: 525,
      operational_fee: 60,
      months_to_reset: null,
      is_cpi_linked: false,
    },

    {
      track_id: generateId(),
      custom_name: 'Fixed CPI-Linked',
      track_type: 'FIXED_LINKED',
      principal_balance: 220000,
      annual_interest_rate: 0.037,
      remaining_term_months: 260,
      monthly_repayment: 0, // Will be auto-calculated
      is_payment_manual_override: false,
      amlat_pearei_ribit: 0,
      notice_fee: 330,
      operational_fee: 60,
      months_to_reset: null,
      is_cpi_linked: true,
    },

    {
      track_id: generateId(),
      custom_name: 'Variable 5Y',
      track_type: 'VARIABLE_5Y',
      principal_balance: 150000,
      annual_interest_rate: 0.044,
      remaining_term_months: 190,
      monthly_repayment: 0, // Will be auto-calculated
      is_payment_manual_override: false,
      amlat_pearei_ribit: 0,
      notice_fee: 225,
      operational_fee: 60,
      months_to_reset: 25, // Derived: 5 years after start (13.09.2023) on the 10th → 10.09.2028

      is_cpi_linked: false,
      start_date: '2023-09-13',
      first_payout_date: '2023-10-10',
      // Original term = 190 remaining + 34 elapsed (started 13.09.2023). With
      // this set, the amortization engine derives the true remaining term as
      // 224 − 34 = 190 months.
      original_principal: 150000,
      original_term_months: 224,
    },


  ];

  return {
    schema_version: 1,
    profile_name: 'Demo Profile',
    created_at: now,
    tracks,
  };
}

export function createEmptyProfile(): Profile {
  const now = new Date().toISOString();

  return {
    schema_version: 1,
    profile_name: 'My Mashkanta',
    created_at: now,
    tracks: [],
  };
}


export function createDefaultTrack(trackType: string = 'PRIME'): Track {
  return {
    track_id: generateId(),
    custom_name: 'New Track',
    track_type: trackType as any,
    principal_balance: 0,
    annual_interest_rate: 0.05,
    remaining_term_months: 240,
    monthly_repayment: 0,
    is_payment_manual_override: false,
    amlat_pearei_ribit: 0,
    notice_fee: 0,
    operational_fee: 60,
    months_to_reset: null,
    is_cpi_linked: false,
  };
}


export function duplicateTrack(track: Track): Track {
  return {
    ...track,
    track_id: generateId(),
    custom_name: `${track.custom_name} (copy)`,
  };
}
