import { describe, it, expect, beforeEach } from "vitest";
import {
  getAllBoiRates,
  getLatestPrimeRate,
  getLatestBoiRate,
  getLatestRateDate,
  upsertBoiRates,
  replaceAllBoiRates,
  getLastSyncTime,
  setLastSyncTime,
  clearBoiRates,
} from "./boiStorage";
import type { BoiRateRecord } from "./boiTypes";

describe("boiStorage", () => {
  beforeEach(() => {
    clearBoiRates();
  });

  it("returns an empty list when the store is empty", () => {
    expect(getAllBoiRates()).toEqual([]);
    expect(getLatestPrimeRate()).toBeNull();
    expect(getLatestBoiRate()).toBeNull();
    expect(getLatestRateDate()).toBeNull();
    expect(getLastSyncTime()).toBeNull();
  });

  it("upserts records and sorts newest → oldest by effective_date", () => {
    upsertBoiRates([
      { effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 },
      { effective_date: "2023-02-23", boi_rate: 0.0425, prime_rate: 0.0575 },
      { effective_date: "2023-05-25", boi_rate: 0.0475, prime_rate: 0.0625 },
    ]);

    const all = getAllBoiRates();
    expect(all).toHaveLength(3);
    expect(all[0].effective_date).toBe("2023-05-25");
    expect(all[2].effective_date).toBe("2023-01-05");
  });

  it("getLatestPrimeRate returns the most recent prime_rate", () => {
    upsertBoiRates([
      { effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 },
      { effective_date: "2023-05-25", boi_rate: 0.0475, prime_rate: 0.0625 },
    ]);
    expect(getLatestPrimeRate()).toBeCloseTo(0.0625);
    expect(getLatestBoiRate()).toBeCloseTo(0.0475);
    expect(getLatestRateDate()).toBe("2023-05-25");
  });

  it("upsert is idempotent — re-upserting the same effective_date updates in place", () => {
    upsertBoiRates([{ effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 }]);
    upsertBoiRates([{ effective_date: "2023-01-05", boi_rate: 0.04, prime_rate: 0.055 }]);

    const all = getAllBoiRates();
    expect(all).toHaveLength(1);
    expect(all[0].boi_rate).toBeCloseTo(0.04);
    expect(all[0].prime_rate).toBeCloseTo(0.055);
  });

  it("upsert merges new dates with existing ones without duplicating", () => {
    upsertBoiRates([{ effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 }]);
    upsertBoiRates([
      { effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 },
      { effective_date: "2023-02-23", boi_rate: 0.0425, prime_rate: 0.0575 },
    ]);

    const all = getAllBoiRates();
    expect(all).toHaveLength(2);
  });

  it("upsert ignores invalid records", () => {
    const written = upsertBoiRates([
      { effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 },
      { effective_date: "bad-date", boi_rate: 0.05, prime_rate: 0.065 },
      { effective_date: "2023-02-23", boi_rate: "nope" as unknown as number, prime_rate: 0.0575 },
    ]);
    expect(written).toBe(1);
    expect(getAllBoiRates()).toHaveLength(1);
  });

  it("upsert returns 0 for an empty batch", () => {
    expect(upsertBoiRates([])).toBe(0);
    expect(upsertBoiRates(null as unknown as BoiRateRecord[])).toBe(0);
  });

  it("replaceAllBoiRates replaces the entire store", () => {
    upsertBoiRates([{ effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 }]);
    replaceAllBoiRates([{ effective_date: "2024-01-01", boi_rate: 0.045, prime_rate: 0.06 }]);

    const all = getAllBoiRates();
    expect(all).toHaveLength(1);
    expect(all[0].effective_date).toBe("2024-01-01");
  });

  it("tracks the last sync time", () => {
    expect(getLastSyncTime()).toBeNull();
    setLastSyncTime("2026-08-01T10:00:00.000Z");
    expect(getLastSyncTime()).toBe("2026-08-01T10:00:00.000Z");
  });

  it("clearBoiRates wipes data and sync metadata", () => {
    upsertBoiRates([{ effective_date: "2023-01-05", boi_rate: 0.0375, prime_rate: 0.0525 }]);
    setLastSyncTime("2026-08-01T10:00:00.000Z");
    clearBoiRates();
    expect(getAllBoiRates()).toEqual([]);
    expect(getLastSyncTime()).toBeNull();
  });
});
