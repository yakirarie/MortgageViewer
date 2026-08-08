import { describe, it, expect } from "vitest";
import {
  createDemoProfile,
  createEmptyProfile,
  createDefaultTrack,
  duplicateTrack,
} from "./demo-profile";
import type { Track } from "./types";


describe("createDemoProfile", () => {
  it("creates a profile with schema_version 1", () => {
    const profile = createDemoProfile();
    expect(profile.schema_version).toBe(1);
  });

  it("creates a profile with correct profile_name", () => {
    const profile = createDemoProfile();
    expect(profile.profile_name).toBe("Demo Profile");
  });

  it("creates a profile with a valid created_at timestamp", () => {
    const profile = createDemoProfile();
    expect(profile.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("creates 4 tracks", () => {

    const profile = createDemoProfile();
    expect(profile.tracks).toHaveLength(4);
  });

  it("creates tracks with correct structure", () => {
    const profile = createDemoProfile();
    profile.tracks.forEach((track) => {
      expect(track).toHaveProperty("track_id");
      expect(track).toHaveProperty("custom_name");
      expect(track).toHaveProperty("track_type");
      expect(track).toHaveProperty("principal_balance");
      expect(track).toHaveProperty("annual_interest_rate");
      expect(track).toHaveProperty("remaining_term_months");
      expect(track).toHaveProperty("monthly_repayment");
      expect(track).toHaveProperty("is_payment_manual_override");
      expect(track).toHaveProperty("early_exit_penalty");
      expect(track).toHaveProperty("notice_fee");
      expect(track).toHaveProperty("months_to_reset");
      expect(track).toHaveProperty("is_cpi_linked");
    });
  });

  it("creates Prime track with correct values", () => {
    const profile = createDemoProfile();
    const primeTrack = profile.tracks.find((t) => t.track_type === "PRIME");
    expect(primeTrack).toBeDefined();
    expect(primeTrack?.custom_name).toBe("Prime");
    expect(primeTrack?.principal_balance).toBe(480000);
    expect(primeTrack?.annual_interest_rate).toBe(0.055);
    expect(primeTrack?.remaining_term_months).toBe(220);
    expect(primeTrack?.is_cpi_linked).toBe(false);
    expect(primeTrack?.months_to_reset).toBeNull();
  });

  it("creates Fixed Unlinked track with correct values", () => {
    const profile = createDemoProfile();
    const fixedUnlinked = profile.tracks.find((t) => t.track_type === "FIXED_UNLINKED");
    expect(fixedUnlinked).toBeDefined();
    expect(fixedUnlinked?.custom_name).toBe("Fixed Unlinked");
    expect(fixedUnlinked?.principal_balance).toBe(350000);
    expect(fixedUnlinked?.annual_interest_rate).toBe(0.051);
    expect(fixedUnlinked?.remaining_term_months).toBe(180);
    expect(fixedUnlinked?.is_cpi_linked).toBe(false);
    expect(fixedUnlinked?.months_to_reset).toBeNull();
  });

  it("creates Fixed CPI-Linked track with correct values", () => {
    const profile = createDemoProfile();
    const fixedLinked = profile.tracks.find((t) => t.track_type === "FIXED_LINKED");
    expect(fixedLinked).toBeDefined();
    expect(fixedLinked?.custom_name).toBe("Fixed CPI-Linked");
    expect(fixedLinked?.principal_balance).toBe(220000);
    expect(fixedLinked?.annual_interest_rate).toBe(0.037);
    expect(fixedLinked?.remaining_term_months).toBe(260);
    expect(fixedLinked?.is_cpi_linked).toBe(true);
    expect(fixedLinked?.months_to_reset).toBeNull();
  });

  it("creates Variable 5Y track with correct values", () => {
    const profile = createDemoProfile();
    const variable5y = profile.tracks.find((t) => t.track_type === "VARIABLE_5Y");
    expect(variable5y).toBeDefined();
    expect(variable5y?.custom_name).toBe("Variable 5Y");
    expect(variable5y?.principal_balance).toBe(150000);
    expect(variable5y?.annual_interest_rate).toBe(0.044);
    expect(variable5y?.remaining_term_months).toBe(190);
    expect(variable5y?.is_cpi_linked).toBe(false);
    expect(variable5y?.months_to_reset).toBe(34);
  });

  it("generates unique track IDs for each track", () => {
    const profile = createDemoProfile();
    const trackIds = profile.tracks.map((t) => t.track_id);
    const uniqueIds = new Set(trackIds);
    expect(uniqueIds.size).toBe(4);
  });

  it("sets monthly_repayment to 0 for auto-calculation", () => {
    const profile = createDemoProfile();
    profile.tracks.forEach((track) => {
      expect(track.monthly_repayment).toBe(0);
    });
  });

  it("sets is_payment_manual_override to false", () => {
    const profile = createDemoProfile();
    profile.tracks.forEach((track) => {
      expect(track.is_payment_manual_override).toBe(false);
    });
  });
});

describe("createEmptyProfile", () => {
  it("creates a profile with schema_version 1", () => {
    const profile = createEmptyProfile();
    expect(profile.schema_version).toBe(1);
  });

  it("creates a profile with correct profile_name", () => {
    const profile = createEmptyProfile();
    expect(profile.profile_name).toBe("My Mashkanta");
  });

  it("creates a profile with a valid created_at timestamp", () => {
    const profile = createEmptyProfile();
    expect(profile.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("creates a profile with empty tracks array", () => {

    const profile = createEmptyProfile();
    expect(profile.tracks).toEqual([]);
  });
});

describe("createDefaultTrack", () => {
  it("creates a track with default type PRIME", () => {
    const track = createDefaultTrack();
    expect(track.track_type).toBe("PRIME");
  });

  it("creates a track with specified type", () => {
    const track = createDefaultTrack("FIXED_UNLINKED");
    expect(track.track_type).toBe("FIXED_UNLINKED");
  });

  it("generates a unique track ID", () => {
    const track1 = createDefaultTrack();
    const track2 = createDefaultTrack();
    expect(track1.track_id).not.toBe(track2.track_id);
  });

  it("sets default custom_name", () => {
    const track = createDefaultTrack();
    expect(track.custom_name).toBe("New Track");
  });

  it("sets default principal_balance to 0", () => {
    const track = createDefaultTrack();
    expect(track.principal_balance).toBe(0);
  });

  it("sets default annual_interest_rate to 0.05", () => {
    const track = createDefaultTrack();
    expect(track.annual_interest_rate).toBe(0.05);
  });

  it("sets default remaining_term_months to 240", () => {
    const track = createDefaultTrack();
    expect(track.remaining_term_months).toBe(240);
  });

  it("sets default monthly_repayment to 0", () => {
    const track = createDefaultTrack();
    expect(track.monthly_repayment).toBe(0);
  });

  it("sets is_payment_manual_override to false", () => {
    const track = createDefaultTrack();
    expect(track.is_payment_manual_override).toBe(false);
  });

  it("sets early_exit_penalty to 0", () => {
    const track = createDefaultTrack();
    expect(track.early_exit_penalty).toBe(0);
  });

  it("sets notice_fee to 0", () => {
    const track = createDefaultTrack();
    expect(track.notice_fee).toBe(0);
  });

  it("sets months_to_reset to null", () => {
    const track = createDefaultTrack();
    expect(track.months_to_reset).toBeNull();
  });

  it("sets is_cpi_linked to false", () => {
    const track = createDefaultTrack();
    expect(track.is_cpi_linked).toBe(false);
  });
});

describe("duplicateTrack", () => {
  it("creates a copy with a new track_id", () => {
    const original: Track = {
      track_id: "original-id",
      custom_name: "Original Track",
      track_type: "PRIME",
      principal_balance: 100000,
      annual_interest_rate: 0.05,
      remaining_term_months: 120,
      monthly_repayment: 1000,
      is_payment_manual_override: false,
      early_exit_penalty: 0,
      notice_fee: 0,
      months_to_reset: null,
      is_cpi_linked: false,
    };

    const duplicate = duplicateTrack(original);

    expect(duplicate.track_id).not.toBe(original.track_id);
    expect(duplicate.track_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  it("appends ' (copy)' to custom_name", () => {
    const original: Track = {
      track_id: "original-id",
      custom_name: "Original Track",
      track_type: "PRIME",
      principal_balance: 100000,
      annual_interest_rate: 0.05,
      remaining_term_months: 120,
      monthly_repayment: 1000,
      is_payment_manual_override: false,
      early_exit_penalty: 0,
      notice_fee: 0,
      months_to_reset: null,
      is_cpi_linked: false,
    };

    const duplicate = duplicateTrack(original);
    expect(duplicate.custom_name).toBe("Original Track (copy)");
  });

  it("copies all other fields", () => {
    const original: Track = {
      track_id: "original-id",
      custom_name: "Original Track",
      track_type: "FIXED_LINKED",
      principal_balance: 250000,
      annual_interest_rate: 0.04,
      remaining_term_months: 180,
      monthly_repayment: 2000,
      is_payment_manual_override: true,
      early_exit_penalty: 5000,
      notice_fee: 300,
      months_to_reset: null,
      is_cpi_linked: true,
    };

    const duplicate = duplicateTrack(original);

    expect(duplicate.track_type).toBe(original.track_type);
    expect(duplicate.principal_balance).toBe(original.principal_balance);
    expect(duplicate.annual_interest_rate).toBe(original.annual_interest_rate);
    expect(duplicate.remaining_term_months).toBe(original.remaining_term_months);
    expect(duplicate.monthly_repayment).toBe(original.monthly_repayment);
    expect(duplicate.is_payment_manual_override).toBe(original.is_payment_manual_override);
    expect(duplicate.early_exit_penalty).toBe(original.early_exit_penalty);
    expect(duplicate.notice_fee).toBe(original.notice_fee);
    expect(duplicate.months_to_reset).toBe(original.months_to_reset);
    expect(duplicate.is_cpi_linked).toBe(original.is_cpi_linked);
  });

  it("does not mutate the original track", () => {
    const original: Track = {
      track_id: "original-id",
      custom_name: "Original Track",
      track_type: "PRIME",
      principal_balance: 100000,
      annual_interest_rate: 0.05,
      remaining_term_months: 120,
      monthly_repayment: 1000,
      is_payment_manual_override: false,
      early_exit_penalty: 0,
      notice_fee: 0,
      months_to_reset: null,
      is_cpi_linked: false,
    };

    const originalTrackId = original.track_id;
    const originalName = original.custom_name;

    duplicateTrack(original);

    expect(original.track_id).toBe(originalTrackId);
    expect(original.custom_name).toBe(originalName);
  });
});
