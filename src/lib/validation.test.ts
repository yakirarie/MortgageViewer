import { describe, it, expect } from "vitest";
import type { Track, Profile, TrackType } from "./types";
import {
  validateTrack,
  validateGlobalAssumptions,
  validateProfile,
  getTrackTypeDefaults,
  shouldShowResetWindow,
  getDefaultCpiLinked,
  getDefaultRate,
  TRACK_TYPES,
} from "./validation";

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    track_id: "test-id",
    custom_name: "Test Track",
    track_type: "OTHER",
    principal_balance: 100000,
    annual_interest_rate: 0.05,
    remaining_term_months: 120,
    monthly_repayment: 1000,
    is_payment_manual_override: false,
    early_exit_penalty: 0,
    notice_fee: 0,
    months_to_reset: null,
    is_cpi_linked: false,
    ...overrides,
  };
}

function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    schema_version: 1,
    profile_name: "Test Profile",
    created_at: "2024-01-01T00:00:00.000Z",
    global_assumptions: {
      reference_market_rate: 0.043,
      alternative_investment_annual_return: 0.08,
      prime_rate_current: 0.06,
    },
    tracks: [],
    ...overrides,
  };
}

describe("validateTrack", () => {
  it("validates a correct track", () => {
    const track = makeTrack();
    const result = validateTrack(track);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("requires a non-empty custom_name", () => {
    const track = makeTrack({ custom_name: "" });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "custom_name",
      message: "Track name is required",
      trackId: "test-id",
    });
  });

  it("requires a non-whitespace custom_name", () => {
    const track = makeTrack({ custom_name: "   " });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "custom_name",
      message: "Track name is required",
      trackId: "test-id",
    });
  });

  it("enforces maximum length for custom_name", () => {
    const track = makeTrack({ custom_name: "a".repeat(41) });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "custom_name",
      message: "Track name must be 40 characters or less",
      trackId: "test-id",
    });
  });

  it("validates track_type is in allowed list", () => {
    const track = makeTrack({ track_type: "INVALID" as TrackType });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "track_type",
      message: "Invalid track type: INVALID",
      trackId: "test-id",
    });
  });

  it("rejects negative principal_balance", () => {
    const track = makeTrack({ principal_balance: -1000 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "principal_balance",
      message: "Principal balance cannot be negative",
      trackId: "test-id",
    });
  });

  it("accepts zero principal_balance", () => {
    const track = makeTrack({ principal_balance: 0 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(true);
  });

  it("rejects interest rate below 0%", () => {
    const track = makeTrack({ annual_interest_rate: -0.01 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "annual_interest_rate",
      message: "Interest rate must be between 0% and 15%",
      trackId: "test-id",
    });
  });

  it("rejects interest rate above 15%", () => {
    const track = makeTrack({ annual_interest_rate: 0.16 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "annual_interest_rate",
      message: "Interest rate must be between 0% and 15%",
      trackId: "test-id",
    });
  });

  it("rejects remaining_term_months below 1", () => {
    const track = makeTrack({ remaining_term_months: 0 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "remaining_term_months",
      message: "Remaining term must be between 1 and 360 months",
      trackId: "test-id",
    });
  });

  it("rejects remaining_term_months above 360", () => {
    const track = makeTrack({ remaining_term_months: 361 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "remaining_term_months",
      message: "Remaining term must be between 1 and 360 months",
      trackId: "test-id",
    });
  });

  it("rejects negative monthly_repayment", () => {
    const track = makeTrack({ monthly_repayment: -100 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "monthly_repayment",
      message: "Monthly repayment cannot be negative",
      trackId: "test-id",
    });
  });

  it("rejects negative early_exit_penalty", () => {
    const track = makeTrack({ early_exit_penalty: -500 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "early_exit_penalty",
      message: "Early exit penalty cannot be negative",
      trackId: "test-id",
    });
  });

  it("rejects negative notice_fee", () => {
    const track = makeTrack({ notice_fee: -100 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "notice_fee",
      message: "Notice fee cannot be negative",
      trackId: "test-id",
    });
  });

  it("rejects negative months_to_reset", () => {
    const track = makeTrack({ months_to_reset: -1 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "months_to_reset",
      message: "Reset window must be between 0 and remaining term months",
      trackId: "test-id",
    });
  });

  it("rejects months_to_reset greater than remaining term", () => {
    const track = makeTrack({ months_to_reset: 150, remaining_term_months: 120 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "months_to_reset",
      message: "Reset window must be between 0 and remaining term months",
      trackId: "test-id",
    });
  });

  it("rejects months_to_reset for FIXED_UNLINKED track type", () => {
    const track = makeTrack({ track_type: "FIXED_UNLINKED", months_to_reset: 6 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "months_to_reset",
      message: "Fixed track types cannot have a reset window",
      trackId: "test-id",
    });
  });

  it("rejects months_to_reset for FIXED_LINKED track type", () => {
    const track = makeTrack({ track_type: "FIXED_LINKED", months_to_reset: 6 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "months_to_reset",
      message: "Fixed track types cannot have a reset window",
      trackId: "test-id",
    });
  });

  it("accepts valid months_to_reset for VARIABLE track types", () => {
    const track = makeTrack({ track_type: "VARIABLE_5Y", months_to_reset: 6 });
    const result = validateTrack(track);
    expect(result.isValid).toBe(true);
  });

  it("accepts null months_to_reset", () => {
    const track = makeTrack({ months_to_reset: null });
    const result = validateTrack(track);
    expect(result.isValid).toBe(true);
  });

  it("accumulates multiple errors", () => {
    const track = makeTrack({
      custom_name: "",
      principal_balance: -1000,
      annual_interest_rate: 0.16,
    });
    const result = validateTrack(track);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("validateGlobalAssumptions", () => {
  it("validates correct global assumptions", () => {
    const assumptions = {
      reference_market_rate: 0.043,
      alternative_investment_annual_return: 0.08,
      prime_rate_current: 0.06,
    };
    const result = validateGlobalAssumptions(assumptions);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects reference_market_rate below 0%", () => {
    const assumptions = {
      reference_market_rate: -0.01,
      alternative_investment_annual_return: 0.08,
      prime_rate_current: 0.06,
    };
    const result = validateGlobalAssumptions(assumptions);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "reference_market_rate",
      message: "Reference market rate must be between 0% and 15%",
    });
  });

  it("rejects reference_market_rate above 15%", () => {
    const assumptions = {
      reference_market_rate: 0.16,
      alternative_investment_annual_return: 0.08,
      prime_rate_current: 0.06,
    };
    const result = validateGlobalAssumptions(assumptions);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "reference_market_rate",
      message: "Reference market rate must be between 0% and 15%",
    });
  });

  it("rejects alternative_investment_annual_return below 0%", () => {
    const assumptions = {
      reference_market_rate: 0.043,
      alternative_investment_annual_return: -0.01,
      prime_rate_current: 0.06,
    };
    const result = validateGlobalAssumptions(assumptions);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "alternative_investment_annual_return",
      message: "Alternative investment return must be between 0% and 30%",
    });
  });

  it("rejects alternative_investment_annual_return above 30%", () => {
    const assumptions = {
      reference_market_rate: 0.043,
      alternative_investment_annual_return: 0.31,
      prime_rate_current: 0.06,
    };
    const result = validateGlobalAssumptions(assumptions);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "alternative_investment_annual_return",
      message: "Alternative investment return must be between 0% and 30%",
    });
  });

  it("rejects prime_rate_current below 0%", () => {
    const assumptions = {
      reference_market_rate: 0.043,
      alternative_investment_annual_return: 0.08,
      prime_rate_current: -0.01,
    };
    const result = validateGlobalAssumptions(assumptions);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "prime_rate_current",
      message: "Prime rate must be between 0% and 15%",
    });
  });

  it("rejects prime_rate_current above 15%", () => {
    const assumptions = {
      reference_market_rate: 0.043,
      alternative_investment_annual_return: 0.08,
      prime_rate_current: 0.16,
    };
    const result = validateGlobalAssumptions(assumptions);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "prime_rate_current",
      message: "Prime rate must be between 0% and 15%",
    });
  });
});

describe("validateProfile", () => {
  it("validates a correct profile", () => {
    const profile = makeProfile({
      tracks: [makeTrack()],
    });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("validates an empty profile (no tracks)", () => {
    const profile = makeProfile({ tracks: [] });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(true);
  });

  it("rejects unsupported schema_version", () => {
    const profile = makeProfile({ schema_version: 2 });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "schema_version",
      message: "Unsupported schema version: 2",
    });
  });

  it("requires profile_name", () => {
    const profile = makeProfile({ profile_name: "" });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "profile_name",
      message: "Profile name is required",
    });
  });

  it("requires created_at", () => {
    const profile = makeProfile({ created_at: "" as any });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "created_at",
      message: "Created at timestamp is required",
    });
  });

  it("validates global_assumptions", () => {
    const profile = makeProfile({
      global_assumptions: {
        reference_market_rate: 0.16,
        alternative_investment_annual_return: 0.08,
        prime_rate_current: 0.06,
      },
    });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "reference_market_rate",
      message: "Reference market rate must be between 0% and 15%",
    });
  });

  it("rejects tracks that is not an array", () => {
    const profile = makeProfile({ tracks: null as any });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "tracks",
      message: "Tracks must be an array",
    });
  });

  it("rejects more than 8 tracks", () => {
    const profile = makeProfile({
      tracks: Array(9).fill(null).map((_, i) => makeTrack({ track_id: `track-${i}` })),
    });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "tracks",
      message: "Maximum 8 tracks allowed",
    });
  });

  it("validates each track", () => {
    const profile = makeProfile({
      tracks: [
        makeTrack({ track_id: "track-1", custom_name: "" }),
        makeTrack({ track_id: "track-2" }),
      ],
    });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors).toContainEqual({
      field: "custom_name",
      message: "Track name is required",
      trackId: "track-1",
    });
  });

  it("accumulates errors from profile and tracks", () => {
    const profile = makeProfile({
      profile_name: "",
      tracks: [makeTrack({ custom_name: "" })],
    });
    const result = validateProfile(profile);
    expect(result.isValid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(1);
  });
});

describe("TRACK_TYPES", () => {
  it("contains all expected track types", () => {
    expect(TRACK_TYPES).toEqual([
      "PRIME",
      "FIXED_UNLINKED",
      "FIXED_LINKED",
      "VARIABLE_5Y",
      "VARIABLE_5Y_LINKED",
      "OTHER",
    ]);
  });
});

describe("getTrackTypeDefaults", () => {
  it("returns correct defaults for PRIME", () => {
    const defaults = getTrackTypeDefaults("PRIME");
    expect(defaults.rate).toBe(0.055);
    expect(defaults.hasReset).toBe(false);
    expect(defaults.isCpiLinked).toBe(false);
  });

  it("returns correct defaults for FIXED_UNLINKED", () => {
    const defaults = getTrackTypeDefaults("FIXED_UNLINKED");
    expect(defaults.rate).toBe(0.052);
    expect(defaults.hasReset).toBe(false);
    expect(defaults.isCpiLinked).toBe(false);
  });

  it("returns correct defaults for FIXED_LINKED", () => {
    const defaults = getTrackTypeDefaults("FIXED_LINKED");
    expect(defaults.rate).toBe(0.038);
    expect(defaults.hasReset).toBe(false);
    expect(defaults.isCpiLinked).toBe(true);
  });

  it("returns correct defaults for VARIABLE_5Y", () => {
    const defaults = getTrackTypeDefaults("VARIABLE_5Y");
    expect(defaults.rate).toBe(0.045);
    expect(defaults.hasReset).toBe(true);
    expect(defaults.isCpiLinked).toBe(false);
  });

  it("returns correct defaults for VARIABLE_5Y_LINKED", () => {
    const defaults = getTrackTypeDefaults("VARIABLE_5Y_LINKED");
    expect(defaults.rate).toBe(0.04);
    expect(defaults.hasReset).toBe(true);
    expect(defaults.isCpiLinked).toBe(true);
  });

  it("returns correct defaults for OTHER", () => {
    const defaults = getTrackTypeDefaults("OTHER");
    expect(defaults.rate).toBe(0.05);
    expect(defaults.hasReset).toBe(false);
    expect(defaults.isCpiLinked).toBe(false);
  });
});

describe("shouldShowResetWindow", () => {
  it("returns false for FIXED types", () => {
    expect(shouldShowResetWindow("FIXED_UNLINKED")).toBe(false);
    expect(shouldShowResetWindow("FIXED_LINKED")).toBe(false);
  });

  it("returns true for VARIABLE types", () => {
    expect(shouldShowResetWindow("VARIABLE_5Y")).toBe(true);
    expect(shouldShowResetWindow("VARIABLE_5Y_LINKED")).toBe(true);
  });

  it("returns false for non-reset types", () => {
    expect(shouldShowResetWindow("PRIME")).toBe(false);
    expect(shouldShowResetWindow("OTHER")).toBe(false);
  });
});

describe("getDefaultCpiLinked", () => {
  it("returns true for CPI-linked types", () => {
    expect(getDefaultCpiLinked("FIXED_LINKED")).toBe(true);
    expect(getDefaultCpiLinked("VARIABLE_5Y_LINKED")).toBe(true);
  });

  it("returns false for non-CPI-linked types", () => {
    expect(getDefaultCpiLinked("PRIME")).toBe(false);
    expect(getDefaultCpiLinked("FIXED_UNLINKED")).toBe(false);
    expect(getDefaultCpiLinked("VARIABLE_5Y")).toBe(false);
    expect(getDefaultCpiLinked("OTHER")).toBe(false);
  });
});

describe("getDefaultRate", () => {
  it("returns prime rate minus 0.5% for PRIME type", () => {
    expect(getDefaultRate("PRIME", 0.06)).toBeCloseTo(0.055, 5);
    expect(getDefaultRate("PRIME", 0.07)).toBeCloseTo(0.065, 5);
  });

  it("ensures PRIME rate is never negative", () => {
    expect(getDefaultRate("PRIME", 0.003)).toBeGreaterThanOrEqual(0);
  });

  it("returns default rate for non-PRIME types", () => {
    expect(getDefaultRate("FIXED_UNLINKED")).toBe(0.052);
    expect(getDefaultRate("FIXED_LINKED")).toBe(0.038);
    expect(getDefaultRate("VARIABLE_5Y")).toBe(0.045);
    expect(getDefaultRate("VARIABLE_5Y_LINKED")).toBe(0.04);
    expect(getDefaultRate("OTHER")).toBe(0.05);
  });

  it("ignores primeRate parameter for non-PRIME types", () => {
    expect(getDefaultRate("FIXED_UNLINKED", 0.1)).toBe(0.052);
    expect(getDefaultRate("OTHER", 0.15)).toBe(0.05);
  });
});
