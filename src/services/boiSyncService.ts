// Client-side Bank of Israel (BOI) rate sync service.
//
// Attempts to fetch the latest BOI rate decisions from a CORS-friendly public
// endpoint (Data.gov.il CKAN API / static JSON). If the fetch fails, is blocked
// by CORS, or the device is offline, it falls back gracefully to the bundled
// static dataset (src/data/boiRatesFallback.json) and/or whatever is already in
// local storage.
//
// Every ingested record enforces the derivation rule:
//   prime_rate = Number((boi_rate + 0.015).toFixed(4))

import type { BoiRateRecord, BoiSyncResult } from "./boiTypes";
import { derivePrimeRate } from "./boiTypes";
import {
  getAllBoiRates,
  getLastSyncTime,
  getLatestPrimeRate,
  getLatestRateDate,
  setLastSyncTime,
  upsertBoiRates,
} from "./boiStorage";
import fallbackRates from "../data/boiRatesFallback.json";

/** How old a sync must be (in days) before the cache is considered stale. */
export const STALE_AFTER_DAYS = 7;

/** CORS-friendly public endpoints to try, in order. */
export const BOI_SYNC_ENDPOINTS: string[] = [
  // Data.gov.il CKAN API — returns a JSON package with the BOI interest-rate
  // resource. CORS-friendly. (Endpoint is illustrative; the parser normalizes
  // whatever shape the resource returns.)
  "https://data.gov.il/api/3/action/package_show?id=bank-of-israel-interest-rates",
];

/**
 * Normalize an arbitrary fetched payload into BoiRateRecord[].
 *
 * Accepts several shapes so the sync is resilient to endpoint changes:
 *   - An array of { effective_date, boi_rate } / { date, base_rate } objects
 *   - A CKAN-style { result: { resources: [...] } } wrapper (best-effort)
 *   - A { rates: [...] } wrapper
 *
 * Records missing a valid date or numeric rate are skipped. The prime rate is
 * always recomputed via the derivation rule.
 */
export function normalizeBoiRates(payload: unknown): BoiRateRecord[] {
  let list: unknown[] = [];

  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.rates)) list = obj.rates;
    else if (Array.isArray(obj.result)) list = obj.result;
    else if (obj.result && typeof obj.result === "object") {
      const res = obj.result as Record<string, unknown>;
      if (Array.isArray(res.resources)) {
        // CKAN package_show → resources are file descriptors, not rate rows.
        // Best-effort: if a resource carries a `rates` array, use it.
        for (const r of res.resources) {
          if (r && typeof r === "object" && Array.isArray((r as Record<string, unknown>).rates)) {
            list = (r as Record<string, unknown>).rates as unknown[];
            break;
          }
        }
      } else if (Array.isArray(res.records)) {
        list = res.records;
      }
    }
  }

  const records: BoiRateRecord[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;

    const effectiveDate =
      (row.effective_date as string) ??
      (row.date as string) ??
      (row.effectiveDate as string);
    const boiRate =
      (row.boi_rate as number) ??
      (row.base_rate as number) ??
      (row.rate as number) ??
      (row.boiRate as number);

    if (typeof effectiveDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) continue;
    const rate = Number(boiRate);
    if (!Number.isFinite(rate)) continue;

    records.push({
      effective_date: effectiveDate,
      boi_rate: rate,
      prime_rate: derivePrimeRate(rate),
    });
  }

  return records;
}

/**
 * Attempt to fetch BOI rate decisions from the remote endpoints. Returns the
 * normalized records, or null if every endpoint failed (network/CORS/offline).
 */
export async function fetchRemoteBoiRates(
  fetcher: typeof fetch = fetch
): Promise<BoiRateRecord[] | null> {
  for (const url of BOI_SYNC_ENDPOINTS) {
    try {
      const res = await fetcher(url);
      if (!res.ok) continue;
      const payload = await res.json();
      const records = normalizeBoiRates(payload);
      if (records.length > 0) return records;
    } catch {
      // Try the next endpoint.
    }
  }
  return null;
}

/** Load the bundled static fallback dataset as BoiRateRecord[]. */
export function loadFallbackRates(): BoiRateRecord[] {
  return (fallbackRates as BoiRateRecord[]).map((r) => ({
    effective_date: r.effective_date,
    boi_rate: r.boi_rate,
    prime_rate: derivePrimeRate(r.boi_rate),
  }));
}

/**
 * Whether the stored rate cache is stale. Returns true when there has never been
 * a sync, or the last sync is older than `STALE_AFTER_DAYS` days.
 */
export function isCacheStale(now: Date = new Date()): boolean {
  const lastSync = getLastSyncTime();
  if (!lastSync) return true;
  const last = new Date(lastSync).getTime();
  if (isNaN(last)) return true;
  const ageMs = now.getTime() - last;
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Run a full sync: fetch remote → fall back to bundled data → upsert into the
 * store → record the sync time. Returns a BoiSyncResult describing what happened.
 */
export async function syncBoiRates(
  fetcher: typeof fetch = fetch
): Promise<BoiSyncResult> {
  const syncedAt = new Date().toISOString();

  // 1. Try the remote source.
  const remote = await fetchRemoteBoiRates(fetcher);
  let records: BoiRateRecord[];
  let source: BoiSyncResult["source"];

  if (remote && remote.length > 0) {
    records = remote;
    source = "remote";
  } else {
    // 2. Fall back to the bundled static dataset.
    records = loadFallbackRates();
    source = "fallback";
  }

  // 3. Idempotent upsert (keyed by effective_date).
  const recordsWritten = upsertBoiRates(records);

  // 4. Record the sync time so the stale check has a reference point.
  setLastSyncTime(syncedAt);

  return {
    recordsWritten,
    latestPrimeRate: getLatestPrimeRate(),
    latestRateDate: getLatestRateDate(),
    syncedAt,
    source,
  };
}

/** Convenience: the current active prime rate from the store (or null). */
export function getActivePrimeRate(): number | null {
  return getLatestPrimeRate();
}

/** Convenience: the current active BOI base rate from the store (or null). */
export function getActiveBoiRate(): number | null {
  const rates = getAllBoiRates();
  return rates.length > 0 ? rates[0].boi_rate : null;
}
