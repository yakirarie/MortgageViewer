// React hook that wires the BOI rate sync into the app lifecycle.
//
// On mount it:
//   1. Seeds the store with the bundled fallback dataset if it's empty.
//   2. Checks whether the cached rates are stale (older than 7 days).
//   3. If stale, kicks off a background sync (remote → fallback).
//
// It exposes the active prime rate, the last sync time, the sync status, and a
// manual `refresh` function so the UI can offer a "Refresh BOI Rates" button.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  getAllBoiRates,
  getLastSyncTime,
  getLatestPrimeRate,
  getLatestRateDate,
  replaceAllBoiRates,
} from "../services/boiStorage";
import {
  isCacheStale,
  loadFallbackRates,
  syncBoiRates,
} from "../services/boiSyncService";
import type { BoiSyncResult } from "../services/boiTypes";

export type BoiSyncStatus = "idle" | "syncing" | "synced" | "error";

export interface UseBoiRateSyncResult {
  /** The active Prime rate (boi_rate + 1.5%) from the store, or null. */
  primeRate: number | null;
  /** The active BOI base rate from the store, or null. */
  boiRate: number | null;
  /** The effective_date of the latest rate record, or null. */
  latestRateDate: string | null;
  /** ISO timestamp of the last successful sync, or null. */
  lastSyncTime: string | null;
  /** Whether the cached rates are considered stale. */
  isStale: boolean;
  /** Current sync status. */
  status: BoiSyncStatus;
  /** Source of the last sync ("remote" | "fallback"), or null. */
  lastSource: BoiSyncResult["source"] | null;
  /** Manually trigger a sync (used by the "Refresh BOI Rates" button). */
  refresh: () => Promise<BoiSyncResult>;
}

export function useBoiRateSync(): UseBoiRateSyncResult {
  const [primeRate, setPrimeRate] = useState<number | null>(() => getLatestPrimeRate());
  const [boiRate, setBoiRate] = useState<number | null>(() => {
    const rates = getAllBoiRates();
    return rates.length > 0 ? rates[0].boi_rate : null;
  });
  const [latestRateDate, setLatestRateDate] = useState<string | null>(() => getLatestRateDate());
  const [lastSyncTime, setLastSyncTimeState] = useState<string | null>(() => getLastSyncTime());
  const [status, setStatus] = useState<BoiSyncStatus>("idle");
  const [lastSource, setLastSource] = useState<BoiSyncResult["source"] | null>(null);

  const isStale = useMemo(() => isCacheStale(), [lastSyncTime]);

  const refresh = useCallback(async (): Promise<BoiSyncResult> => {
    setStatus("syncing");
    try {
      const result = await syncBoiRates();
      setPrimeRate(getLatestPrimeRate());
      setBoiRate(() => {
        const rates = getAllBoiRates();
        return rates.length > 0 ? rates[0].boi_rate : null;
      });
      setLatestRateDate(getLatestRateDate());
      setLastSyncTimeState(getLastSyncTime());
      setLastSource(result.source);
      setStatus("synced");
      return result;
    } catch {
      setStatus("error");
      throw new Error("Failed to sync BOI rates");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Seed the store with the bundled fallback if it's empty, so the app always
    // has a usable rate timeline even before the first network sync.
    if (getAllBoiRates().length === 0) {
      replaceAllBoiRates(loadFallbackRates());
      if (!cancelled) {
        setPrimeRate(getLatestPrimeRate());
        setBoiRate(() => {
          const rates = getAllBoiRates();
          return rates.length > 0 ? rates[0].boi_rate : null;
        });
        setLatestRateDate(getLatestRateDate());
      }
    }

    // Background refresh when the cache is stale.
    if (isCacheStale()) {
      refresh().catch(() => {
        if (!cancelled) setStatus("error");
      });
    }

    return () => {
      cancelled = true;
    };
  }, [refresh]);

  return {
    primeRate,
    boiRate,
    latestRateDate,
    lastSyncTime,
    isStale,
    status,
    lastSource,
    refresh,
  };
}
