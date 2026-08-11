import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  normalizeBoiRates,
  loadFallbackRates,
  isCacheStale,
  syncBoiRates,
  getActivePrimeRate,
  getActiveBoiRate,
  STALE_AFTER_DAYS,
  BOI_DATA_URL,
} from "./boiSyncService";
import { derivePrimeRate } from "./boiTypes";
import {
  clearBoiRates,
  getAllBoiRates,
  getLastSyncTime,
  setLastSyncTime,
} from "./boiStorage";

describe("derivePrimeRate", () => {
  it("computes prime_rate = boi_rate + 0.015, rounded to 4 decimals", () => {
    expect(derivePrimeRate(0.045)).toBeCloseTo(0.06);
    expect(derivePrimeRate(0.035)).toBeCloseTo(0.05);
    expect(derivePrimeRate(0.0375)).toBeCloseTo(0.0525);
    expect(derivePrimeRate(0.0475)).toBeCloseTo(0.0625);
  });
});

describe("normalizeBoiRates", () => {
  it("normalizes an array of { effective_date, boi_rate } and derives prime_rate", () => {
    const records = normalizeBoiRates([
      { effective_date: "2023-01-05", boi_rate: 0.0375 },
      { effective_date: "2023-02-23", boi_rate: 0.0425 },
    ]);
    expect(records).toHaveLength(2);
    expect(records[0].prime_rate).toBeCloseTo(0.0525);
    expect(records[1].prime_rate).toBeCloseTo(0.0575);
  });

  it("accepts { date, base_rate } shape", () => {
    const records = normalizeBoiRates([{ date: "2023-01-05", base_rate: 0.045 }]);
    expect(records).toHaveLength(1);
    expect(records[0].effective_date).toBe("2023-01-05");
    expect(records[0].boi_rate).toBeCloseTo(0.045);
    expect(records[0].prime_rate).toBeCloseTo(0.06);
  });

  it("accepts a { rates: [...] } wrapper", () => {
    const records = normalizeBoiRates({ rates: [{ effective_date: "2023-01-05", boi_rate: 0.04 }] });
    expect(records).toHaveLength(1);
    expect(records[0].prime_rate).toBeCloseTo(0.055);
  });

  it("skips records with invalid dates or non-numeric rates", () => {
    const records = normalizeBoiRates([
      { effective_date: "2023-01-05", boi_rate: 0.04 },
      { effective_date: "not-a-date", boi_rate: 0.05 },
      { effective_date: "2023-02-23", boi_rate: "nope" },
      { effective_date: "2023-03-01", boi_rate: null },
    ]);
    expect(records).toHaveLength(1);
    expect(records[0].effective_date).toBe("2023-01-05");
  });

  it("returns an empty array for non-object / empty payloads", () => {
    expect(normalizeBoiRates(null)).toEqual([]);
    expect(normalizeBoiRates(undefined)).toEqual([]);
    expect(normalizeBoiRates("string")).toEqual([]);
    expect(normalizeBoiRates({})).toEqual([]);
  });
});

describe("loadFallbackRates", () => {
  it("loads the bundled dataset and derives prime_rate for every record", () => {
    const rates = loadFallbackRates();
    expect(rates.length).toBeGreaterThan(0);
    for (const r of rates) {
      expect(r.prime_rate).toBeCloseTo(derivePrimeRate(r.boi_rate));
    }
  });

  it("contains the current known base rate as the newest entry", () => {
    const rates = loadFallbackRates();
    expect(rates[0].effective_date).toBe("2026-07-09");
    expect(rates[0].boi_rate).toBeCloseTo(0.035);
    expect(rates[0].prime_rate).toBeCloseTo(0.05);
  });
});

describe("isCacheStale", () => {
  beforeEach(() => {
    clearBoiRates();
  });

  it("returns true when there has never been a sync", () => {
    expect(isCacheStale()).toBe(true);
  });

  it("returns false when the last sync is recent", () => {
    setLastSyncTime(new Date().toISOString());
    expect(isCacheStale()).toBe(false);
  });

  it("returns true when the last sync is older than STALE_AFTER_DAYS", () => {
    const now = new Date();
    const old = new Date(now.getTime() - (STALE_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000);
    setLastSyncTime(old.toISOString());
    expect(isCacheStale(now)).toBe(true);
  });

  it("returns false exactly at the stale threshold", () => {
    const now = new Date();
    const atThreshold = new Date(now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);
    setLastSyncTime(atThreshold.toISOString());
    expect(isCacheStale(now)).toBe(false);
  });
});

describe("syncBoiRates", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    clearBoiRates();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches the same-origin static file and upserts records on success", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { effective_date: "2026-08-01", boi_rate: 0.03 },
        { effective_date: "2026-07-09", boi_rate: 0.035 },
      ],
    }) as unknown as typeof fetch;

    const result = await syncBoiRates();

    expect(globalThis.fetch).toHaveBeenCalledWith(BOI_DATA_URL);
    expect(result.success).toBe(true);
    expect(result.isFallback).toBe(false);
    expect(result.count).toBeGreaterThan(0);
    expect(getAllBoiRates().length).toBeGreaterThan(0);
    expect(getLastSyncTime()).not.toBeNull();
  });

  it("returns a fallback result when the fetch fails", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("offline")) as unknown as typeof fetch;

    const result = await syncBoiRates();

    expect(result.success).toBe(false);
    expect(result.isFallback).toBe(true);
    expect(result.count).toBe(0);
  });

  it("returns a fallback result when the response is not ok", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => [],
    }) as unknown as typeof fetch;

    const result = await syncBoiRates();

    expect(result.success).toBe(false);
    expect(result.isFallback).toBe(true);
  });

  it("returns a fallback result when the payload has no valid records", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ effective_date: "bad", boi_rate: "nope" }],
    }) as unknown as typeof fetch;

    const result = await syncBoiRates();

    expect(result.success).toBe(false);
    expect(result.isFallback).toBe(true);
  });

  it("exposes the active prime and boi rates after a successful sync", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ effective_date: "2026-08-01", boi_rate: 0.03 }],
    }) as unknown as typeof fetch;

    await syncBoiRates();
    expect(getActivePrimeRate()).toBeCloseTo(0.045);
    expect(getActiveBoiRate()).toBeCloseTo(0.03);
  });
});
