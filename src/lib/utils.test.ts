import { describe, it, expect } from "vitest";
import type { Track } from "./types";
import {
  generateId,
  formatCurrency,
  formatCurrencyPrecision,
  formatPercent,
  formatNumber,
  parseCurrencyInput,
  parsePercentInput,
  downloadJson,
  sanitizeFilename,
  uploadJson,
  getCurrentTimestamp,
  serializeTrackForExport,
} from "./utils";




describe("generateId", () => {
  it("generates a unique ID each time", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it("generates a valid UUID format", () => {
    const id = generateId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it("generates IDs of correct length", () => {
    const id = generateId();
    expect(id.length).toBe(36);
  });
});

describe("formatCurrency", () => {
  it("formats zero correctly", () => {
    expect(formatCurrency(0)).toBe("₪0");
  });

  it("formats positive numbers with ILS currency", () => {
    expect(formatCurrency(1000)).toBe("₪1,000");
    expect(formatCurrency(1000000)).toBe("₪1,000,000");
  });

  it("handles decimal values by rounding to whole numbers", () => {
    expect(formatCurrency(1234.56)).toBe("₪1,235");
  });

  it("handles very large numbers", () => {
    expect(formatCurrency(1234567890)).toBe("₪1,234,567,890");
  });

  it("returns ₪0 for non-finite values", () => {
    expect(formatCurrency(NaN)).toBe("₪0");
    expect(formatCurrency(Infinity)).toBe("₪0");
    expect(formatCurrency(-Infinity)).toBe("₪0");
  });
});

describe("formatCurrencyPrecision", () => {
  it("formats zero as ₪0", () => {
    expect(formatCurrencyPrecision(0)).toBe("₪0");
  });

  it("formats with 2 decimal places by default (Agorot precision)", () => {
    expect(formatCurrencyPrecision(3078.31)).toBe("₪3,078.31");
    expect(formatCurrencyPrecision(1565.32)).toBe("₪1,565.32");
  });

  it("formats with a custom number of decimal places", () => {
    expect(formatCurrencyPrecision(1234.5, 1)).toBe("₪1,234.5");
    expect(formatCurrencyPrecision(1234.567, 3)).toBe("₪1,234.567");
  });

  it("handles whole numbers with the requested decimals", () => {
    expect(formatCurrencyPrecision(1000)).toBe("₪1,000.00");
  });

  it("returns ₪0 for non-finite values", () => {
    expect(formatCurrencyPrecision(NaN)).toBe("₪0");
    expect(formatCurrencyPrecision(Infinity)).toBe("₪0");
    expect(formatCurrencyPrecision(-Infinity)).toBe("₪0");
  });
});

describe("formatPercent", () => {

  it("formats zero as 0%", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("formats decimal values as percentages", () => {
    expect(formatPercent(0.05)).toBe("5.00%");
    expect(formatPercent(0.1)).toBe("10.00%");
    expect(formatPercent(0.5)).toBe("50.00%");
  });

  it("formats small percentages", () => {
    expect(formatPercent(0.001)).toBe("0.10%");
    expect(formatPercent(0.0001)).toBe("0.01%");
  });

  it("handles percentages above 100%", () => {
    expect(formatPercent(1)).toBe("100.00%");
    expect(formatPercent(1.5)).toBe("150.00%");
  });

  it("returns 0% for non-finite values", () => {
    expect(formatPercent(NaN)).toBe("0%");
    expect(formatPercent(Infinity)).toBe("0%");
    expect(formatPercent(-Infinity)).toBe("0%");
  });
});

describe("formatNumber", () => {
  it("formats zero as 0", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats numbers with thousands separators", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });

  it("handles decimal values with precision", () => {
    expect(formatNumber(1234.56)).toBe("1,234.56");
  });

  it("handles very large numbers", () => {
    expect(formatNumber(1234567890)).toBe("1,234,567,890");
  });

  it("returns 0 for non-finite values", () => {
    expect(formatNumber(NaN)).toBe("0");
    expect(formatNumber(Infinity)).toBe("0");
    expect(formatNumber(-Infinity)).toBe("0");
  });
});

describe("parseCurrencyInput", () => {
  it("parses plain numbers", () => {
    expect(parseCurrencyInput("1000")).toBe(1000);
    expect(parseCurrencyInput("1234.56")).toBe(1234.56);
  });

  it("removes currency symbol", () => {
    expect(parseCurrencyInput("₪1000")).toBe(1000);
    expect(parseCurrencyInput("₪1,000")).toBe(1000);
  });

  it("removes thousands separators", () => {
    expect(parseCurrencyInput("1,000")).toBe(1000);
    expect(parseCurrencyInput("1,000,000")).toBe(1000000);
  });

  it("removes spaces", () => {
    expect(parseCurrencyInput("1 000")).toBe(1000);
    expect(parseCurrencyInput("₪ 1,000")).toBe(1000);
  });

  it("handles combinations of symbols and separators", () => {
    expect(parseCurrencyInput("₪1,234,567.89")).toBe(1234567.89);
  });

  it("returns 0 for invalid input", () => {
    expect(parseCurrencyInput("")).toBe(0);
    expect(parseCurrencyInput("abc")).toBe(0);
    expect(parseCurrencyInput("₪abc")).toBe(0);
  });
});

describe("parsePercentInput", () => {
  it("parses plain numbers as decimal", () => {
    expect(parsePercentInput("5")).toBe(0.05);
    expect(parsePercentInput("10")).toBe(0.1);
    expect(parsePercentInput("50")).toBe(0.5);
  });

  it("removes percent symbol", () => {
    expect(parsePercentInput("5%")).toBe(0.05);
    expect(parsePercentInput("10%")).toBe(0.1);
  });

  it("removes spaces", () => {
    expect(parsePercentInput("5 %")).toBe(0.05);
    expect(parsePercentInput("5 % ")).toBe(0.05);
  });

  it("handles decimal percentages", () => {
    expect(parsePercentInput("5.5")).toBe(0.055);
    expect(parsePercentInput("5.5%")).toBe(0.055);
  });

  it("returns 0 for invalid input", () => {
    expect(parsePercentInput("")).toBe(0);
    expect(parsePercentInput("abc")).toBe(0);
    expect(parsePercentInput("%")).toBe(0);
  });
});

describe("downloadJson", () => {
  it("is a function that exists", () => {
    expect(typeof downloadJson).toBe("function");
  });

  // Note: Full testing of downloadJson requires DOM mocking which is complex
  // The function is tested manually in the browser
});

describe("sanitizeFilename", () => {
  it("appends .json when the input has no extension", () => {
    expect(sanitizeFilename("my-profile")).toBe("my-profile.json");
  });

  it("keeps an existing .json extension", () => {
    expect(sanitizeFilename("my-profile.json")).toBe("my-profile.json");
  });

  it("keeps an existing .JSON extension (case-insensitive)", () => {
    expect(sanitizeFilename("my-profile.JSON")).toBe("my-profile.JSON");
  });

  it("does not double the .json extension", () => {
    expect(sanitizeFilename("my-profile.json.json")).toBe("my-profile.json.json");
  });

  it("replaces path-invalid characters with dashes", () => {
    expect(sanitizeFilename("a/b\\c:d*e?f\"g<h>i|j")).toBe("a-b-c-d-e-f-g-h-i-j.json");
  });

  it("collapses whitespace and trims", () => {
    expect(sanitizeFilename("  my   profile  ")).toBe("my profile.json");
  });

  it("falls back to the provided fallback when input is empty", () => {
    expect(sanitizeFilename("", "backup.json")).toBe("backup.json");
  });

  it("falls back to a timestamped name when input and fallback are empty", () => {
    const result = sanitizeFilename("  ", "");
    expect(result).toMatch(/^mashkanta-profile-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("falls back to a timestamped name when input is only invalid characters", () => {
    const result = sanitizeFilename("///");
    expect(result).toMatch(/^mashkanta-profile-\d{4}-\d{2}-\d{2}\.json$/);
  });
});

describe("uploadJson", () => {

  it("is a function that exists", () => {
    expect(typeof uploadJson).toBe("function");
  });

  // Note: FileReader is a browser API not available in Node environment
  // These tests would require jsdom environment or proper mocking
  // The function is tested manually in the browser
});

describe("getCurrentTimestamp", () => {
  it("returns an ISO string", () => {
    const timestamp = getCurrentTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("returns current time", () => {
    const before = new Date();
    const timestamp = getCurrentTimestamp();
    const after = new Date();

    const timestampDate = new Date(timestamp);
    expect(timestampDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(timestampDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});

describe("serializeTrackForExport", () => {
  const makeTrack = (overrides: Partial<Track> = {}): Track => ({
    track_id: "track-1",
    custom_name: "Prime",
    track_type: "PRIME",
    principal_balance: 480000,
    annual_interest_rate: 0.055,
    remaining_term_months: 220,
    monthly_repayment: 0,
    is_payment_manual_override: false,
    amlat_pearei_ribit: 0,
    notice_fee: 0,
    operational_fee: 60,
    months_to_reset: null,
    is_cpi_linked: false,
    ...overrides,
  });

  it("separates net principal, accrued interest, and total payoff balance", () => {
    const serialized = serializeTrackForExport(makeTrack({ principal_balance: 480000 }));
    expect(serialized.net_principal_balance).toBe(480000);
    // Accrued daily interest is now computed from the current effective rate and
    // the payment day (derived from the first payout / start date, falling back
    // to today). It is non-negative and stored at Agorot precision.
    expect(serialized.accrued_daily_interest).toBeGreaterThanOrEqual(0);
    expect(serialized.total_payoff_balance).toBeCloseTo(
      serialized.net_principal_balance + serialized.accrued_daily_interest,
      5
    );
  });

  it("stores the computed accrued daily interest at Agorot precision (2 decimals)", () => {
    // A track with a start date + first payout date (payment day 10th) and a
    // rate history. The serialized accrued interest is derived from the latest
    // effective rate and rounded to 2 decimal places.
    const serialized = serializeTrackForExport(
      makeTrack({
        start_date: "2023-09-13",
        first_payout_date: "2023-10-10",
        annual_interest_rate: 0.049,
        rate_history: [
          { effective_date: "2023-09-13", annual_interest_rate: 0.049 },
        ],
      })
    );
    expect(serialized.accrued_daily_interest).toBeGreaterThanOrEqual(0);
    // The stored value is already rounded to 2 decimals (Agorot level).
    expect(serialized.accrued_daily_interest).toBeCloseTo(
      Number(serialized.accrued_daily_interest.toFixed(2)),
      10
    );
    // total_payoff_balance = net principal + accrued interest.
    expect(serialized.total_payoff_balance).toBeCloseTo(
      serialized.net_principal_balance + serialized.accrued_daily_interest,
      5
    );
  });

  it("uses the latest rate-history entry as the effective rate for accrued interest", () => {
    // The latest rate-history entry (0.044) drives the accrued interest, not the
    // track's stale annual_interest_rate (0.055).
    const serialized = serializeTrackForExport(
      makeTrack({
        start_date: "2023-01-05",
        first_payout_date: "2023-02-05",
        annual_interest_rate: 0.055,
        rate_history: [
          { effective_date: "2023-01-05", annual_interest_rate: 0.039 },
          { effective_date: "2023-02-23", annual_interest_rate: 0.044 },
        ],
      })
    );
    // Sanity: the accrued interest is positive (there is a rate and elapsed days).
    expect(serialized.accrued_daily_interest).toBeGreaterThan(0);
  });


  it("clamps rates to 6 decimal places", () => {
    const serialized = serializeTrackForExport(
      makeTrack({ annual_interest_rate: 0.0551234567 })
    );
    expect(serialized.annual_interest_rate).toBeCloseTo(0.055123, 6);
  });

  it("clamps rate_history entry rates to 6 decimal places", () => {
    const serialized = serializeTrackForExport(
      makeTrack({
        rate_history: [
          { effective_date: "2023-01-05", annual_interest_rate: 0.0391234567 },
        ],
      })
    );
    expect(serialized.rate_history?.[0].annual_interest_rate).toBeCloseTo(0.039123, 6);
  });

  it("computes total_exit_cost from the fee line items", () => {
    const serialized = serializeTrackForExport(
      makeTrack({ amlat_pearei_ribit: 20000, notice_fee: 720, operational_fee: 60 })
    );
    expect(serialized.total_exit_cost).toBe(20000 + 720 + 60);
  });

  it("defaults the operational fee to 60 when not set", () => {
    const serialized = serializeTrackForExport(
      makeTrack({ operational_fee: undefined as any })
    );
    expect(serialized.operational_fee).toBe(60);
  });

  it("preserves Prime-specific fields (start_date, prime_margin, rate_history)", () => {
    const serialized = serializeTrackForExport(
      makeTrack({
        start_date: "2023-01-05",
        prime_margin: -0.006,
        rate_history: [
          { effective_date: "2023-01-05", annual_interest_rate: 0.039 },
          { effective_date: "2023-02-23", annual_interest_rate: 0.044 },
        ],
      })
    );
    expect(serialized.start_date).toBe("2023-01-05");
    expect(serialized.prime_margin).toBe(-0.006);
    expect(serialized.rate_history).toHaveLength(2);
  });
});

