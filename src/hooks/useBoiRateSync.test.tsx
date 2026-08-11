// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from "vitest";

import { renderHook, waitFor } from "@testing-library/react";
import { useBoiRateSync } from "./useBoiRateSync";
import {
  clearBoiRates,
  getAllBoiRates,
  getLastSyncTime,
  setLastSyncTime,
  upsertBoiRates,
} from "../services/boiStorage";


// Module-scoped values the mocked sync writes into the store, so tests can
// control what the hook observes after a sync. The default date (2026-06-01) is
// older than the fallback's newest entry (2026-07-09), so the fallback remains
// the "latest" record unless a test opts into a newer date.
let mockSyncRate = 0.05;
let mockSyncDate = "2026-06-01";

// Mock the sync service so tests don't hit the network. The mock simulates the
// real sync's side effects: it upserts a record into the store and records the
// last sync time.
vi.mock("../services/boiSyncService", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/boiSyncService")>();
  return {
    ...actual,
    syncBoiRates: vi.fn(async () => {
      upsertBoiRates([
        {
          effective_date: mockSyncDate,
          boi_rate: mockSyncRate,
          prime_rate: mockSyncRate + 0.015,
        },
      ]);
      setLastSyncTime();
      return {
        recordsWritten: 1,
        latestPrimeRate: mockSyncRate + 0.015,
        latestRateDate: mockSyncDate,
        syncedAt: new Date().toISOString(),
        source: "remote",
      };
    }),
  };
});


import { syncBoiRates as mockSyncBoiRates } from "../services/boiSyncService";

describe("useBoiRateSync", () => {
  beforeEach(() => {
    clearBoiRates();
    vi.clearAllMocks();
    mockSyncRate = 0.05;
  });

  it("seeds the store with the fallback dataset when empty", async () => {
    const { result } = renderHook(() => useBoiRateSync());

    await waitFor(() => {
      expect(getAllBoiRates().length).toBeGreaterThan(0);
    });

    // The fallback dataset's newest entry is 2026-07-09 @ 3.5% base → 5.0% prime.
    expect(result.current.primeRate).toBeCloseTo(0.05);
    expect(result.current.boiRate).toBeCloseTo(0.035);
    expect(result.current.latestRateDate).toBe("2026-07-09");
  });

  it("exposes a refresh function that triggers a sync and updates the active rate", async () => {
    const { result } = renderHook(() => useBoiRateSync());

    await waitFor(() => {
      expect(result.current.primeRate).not.toBeNull();
    });

    // Change the rate and date the mocked sync writes, then refresh. The new
    // date (2026-08-01) is newer than the fallback's latest, so it becomes the
    // active record.
    mockSyncRate = 0.03;
    mockSyncDate = "2026-08-01";
    await result.current.refresh();


    expect(mockSyncBoiRates).toHaveBeenCalled();
    // The store now holds the synced record (0.03 base → 0.045 prime). Wait for
    // React to flush the state update from the refresh.
    await waitFor(() => {
      expect(result.current.primeRate).toBeCloseTo(0.045);
    });
    expect(result.current.latestRateDate).toBe("2026-08-01");
    expect(result.current.lastSource).toBe("remote");

  });

  it("records the last sync time and clears the stale flag after a sync", async () => {
    const { result } = renderHook(() => useBoiRateSync());

    await waitFor(() => {
      expect(result.current.lastSyncTime).not.toBeNull();
    });

    // After a successful sync, the cache is no longer stale.
    expect(result.current.isStale).toBe(false);
    expect(getLastSyncTime()).not.toBeNull();
  });
});
