import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  normalizeBoiRates,
  loadFallbackRates,
  isCacheStale,
  syncBoiRates,
  fetchRemoteBoiRates,
  getActivePrimeRate,
  getActiveBoiRate,
  STALE_AFTER_DAYS,
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

describe("fetchRemoteBoiRates", () => {
  it("returns normalized records when the fetch succeeds", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ effective_date: "2026-08-01", boi_rate: 0.03 }],
    });
    const records = await fetchRemoteBoiRates(fetcher as unknown as typeof fetch);
    expect(records).not.toBeNull();
    expect(records![0].prime_rate).toBeCloseTo(0.045);
  });

  it("returns null when the fetch fails or is blocked", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("network"));
    const records = await fetchRemoteBoiRates(fetcher as unknown as typeof fetch);
    expect(records).toBeNull();
  });

  it("returns null when the response is not ok", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => [] });
    const records = await fetchRemoteBoiRates(fetcher as unknown as typeof fetch);
    expect(records).toBeNull();
  });
});

describe("syncBoiRates", () => {
  beforeEach(() => {
    clearBoiRates();
  });

  it("falls back to the bundled dataset when the remote fetch fails", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    const result = await syncBoiRates(fetcher as unknown as typeof fetch);

    expect(result.source).toBe("fallback");
    expect(result.recordsWritten).toBeGreaterThan(0);
    expect(result.latestPrimeRate).toBeCloseTo(0.05);
    expect(result.latestRateDate).toBe("2026-07-09");
    expect(getLastSyncTime()).not.toBeNull();
  });

  it("uses remote data when the fetch succeeds", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [{ effective_date: "2026-08-01", boi_rate: 0.03 }],
    });
    const result = await syncBoiRates(fetcher as unknown as typeof fetch);

    expect(result.source).toBe("remote");
    expect(result.latestPrimeRate).toBeCloseTo(0.045);
    expect(result.latestRateDate).toBe("2026-08-01");
  });

  it("is idempotent — running twice does not duplicate records", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await syncBoiRates(fetcher as unknown as typeof fetch);
    const firstCount = getAllBoiRates().length;
    await syncBoiRates(fetcher as unknown as typeof fetch);
    const secondCount = getAllBoiRates().length;
    expect(secondCount).toBe(firstCount);
  });

  it("exposes the active prime and boi rates after syncing", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("offline"));
    await syncBoiRates(fetcher as unknown as typeof fetch);
    expect(getActivePrimeRate()).toBeCloseTo(0.05);
    expect(getActiveBoiRate()).toBeCloseTo(0.035);
  });
});
