// Validation utilities for Profile and Track data per PRD §2.2

import type { Track, Profile, TrackType } from './types';


export interface ValidationError {
  field: string;
  message: string;
  trackId?: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
}

// Track type enum values for validation
export const TRACK_TYPES: TrackType[] = [
  'PRIME',
  'FIXED_UNLINKED',
  'FIXED_LINKED',
  'VARIABLE_5Y',
  'VARIABLE_5Y_LINKED',
  'OTHER',
];

// Default values per track type (PRD §2.2.1)
const TRACK_TYPE_DEFAULTS: Record<TrackType, { rate: number; hasReset: boolean; isCpiLinked: boolean }> = {
  PRIME: { rate: 0.055, hasReset: false, isCpiLinked: false },
  FIXED_UNLINKED: { rate: 0.052, hasReset: false, isCpiLinked: false },
  FIXED_LINKED: { rate: 0.038, hasReset: false, isCpiLinked: true },
  VARIABLE_5Y: { rate: 0.045, hasReset: true, isCpiLinked: false },
  VARIABLE_5Y_LINKED: { rate: 0.04, hasReset: true, isCpiLinked: true },
  OTHER: { rate: 0.05, hasReset: false, isCpiLinked: false },
};

export function validateTrack(track: Track): ValidationResult {
  const errors: ValidationError[] = [];

  // Field 2: custom_name
  if (!track.custom_name || track.custom_name.trim().length === 0) {
    errors.push({ field: 'custom_name', message: 'Track name is required', trackId: track.track_id });
  } else if (track.custom_name.length > 40) {
    errors.push({ field: 'custom_name', message: 'Track name must be 40 characters or less', trackId: track.track_id });
  }

  // Field 3: track_type
  if (!TRACK_TYPES.includes(track.track_type)) {
    errors.push({ field: 'track_type', message: `Invalid track type: ${track.track_type}`, trackId: track.track_id });
  }

  // Field 4: principal_balance
  if (track.principal_balance < 0) {
    errors.push({ field: 'principal_balance', message: 'Principal balance cannot be negative', trackId: track.track_id });
  } else if (track.principal_balance === 0) {
    // Warning (not error) per PRD: "warn if 0"
    // We'll return this as a non-blocking validation issue
  }

  // Field 5: annual_interest_rate
  if (track.annual_interest_rate < 0 || track.annual_interest_rate > 0.15) {
    errors.push({ field: 'annual_interest_rate', message: 'Interest rate must be between 0% and 15%', trackId: track.track_id });
  }

  // Field 6: remaining_term_months
  if (track.remaining_term_months < 1 || track.remaining_term_months > 360) {
    errors.push({ field: 'remaining_term_months', message: 'Remaining term must be between 1 and 360 months', trackId: track.track_id });
  }

  // Field 7: monthly_repayment
  if (track.monthly_repayment < 0) {
    errors.push({ field: 'monthly_repayment', message: 'Monthly repayment cannot be negative', trackId: track.track_id });
  }

  // Field 9: amlat_pearei_ribit (interest gap penalty)
  if (track.amlat_pearei_ribit < 0) {
    errors.push({ field: 'amlat_pearei_ribit', message: 'Interest gap penalty cannot be negative', trackId: track.track_id });
  }

  // Field 10: notice_fee
  if (track.notice_fee < 0) {
    errors.push({ field: 'notice_fee', message: 'Notice fee cannot be negative', trackId: track.track_id });
  }

  // Field 10b: operational_fee (fixed at 60 per track)
  if (track.operational_fee < 0) {
    errors.push({ field: 'operational_fee', message: 'Operational fee cannot be negative', trackId: track.track_id });
  }


  // Field 11: months_to_reset
  if (track.months_to_reset !== null) {
    if (track.months_to_reset < 0 || track.months_to_reset > track.remaining_term_months) {
      errors.push({
        field: 'months_to_reset',
        message: 'Reset window must be between 0 and remaining term months',
        trackId: track.track_id,
      });
    }

    // Hidden entirely for FIXED types per PRD
    if (track.track_type === 'FIXED_UNLINKED' || track.track_type === 'FIXED_LINKED') {
      errors.push({
        field: 'months_to_reset',
        message: 'Fixed track types cannot have a reset window',
        trackId: track.track_id,
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function validateProfile(profile: Profile): ValidationResult {

  const errors: ValidationError[] = [];

  // Schema version
  if (profile.schema_version !== 1) {
    errors.push({ field: 'schema_version', message: `Unsupported schema version: ${profile.schema_version}` });
  }

  // Profile name
  if (!profile.profile_name || profile.profile_name.trim().length === 0) {
    errors.push({ field: 'profile_name', message: 'Profile name is required' });
  }

  // Created at
  if (!profile.created_at) {
    errors.push({ field: 'created_at', message: 'Created at timestamp is required' });
  }

  // Tracks

  if (!Array.isArray(profile.tracks)) {
    errors.push({ field: 'tracks', message: 'Tracks must be an array' });
  } else {
    if (profile.tracks.length === 0) {
      // Empty profile is valid (empty state), but may be a warning in some contexts
    } else if (profile.tracks.length > 8) {
      errors.push({ field: 'tracks', message: 'Maximum 8 tracks allowed' });
    }

    // Validate each track
    profile.tracks.forEach((track) => {
      const trackResult = validateTrack(track);
      errors.push(...trackResult.errors);
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function getTrackTypeDefaults(trackType: TrackType) {
  return TRACK_TYPE_DEFAULTS[trackType];
}

export function shouldShowResetWindow(trackType: TrackType): boolean {
  return TRACK_TYPE_DEFAULTS[trackType].hasReset;
}

export function getDefaultCpiLinked(trackType: TrackType): boolean {
  return TRACK_TYPE_DEFAULTS[trackType].isCpiLinked;
}

export function getDefaultRate(trackType: TrackType, primeRate: number = 0.06): number {
  if (trackType === 'PRIME') {
    return Math.max(0, primeRate - 0.005); // Prime rate - 0.5%
  }
  return TRACK_TYPE_DEFAULTS[trackType].rate;
}
