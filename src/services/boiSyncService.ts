// Client-side Bank of Israel (BOI) rate sync service.
//
// The browser never talks to external BOI/data.gov.il endpoints directly (those
// are blocked by CORS and often 404). Instead, a scheduled GitHub Action fetches
// and parses the BOI Excel sheet server-side and commits the result to
// `public/data/boiRates.json`. This service simply fetches that same-origin
// static file and upserts it into local storage.
//
// Every ingested record enforces the derivation rule:
//   prime_rate = Number((boi_rate + 0.015).toFixed(4))

import type { BoiRateRecord, BoiSyncResult } from "./boiTypes";
import { derivePrimeRate } from "./boiTypes";
import {
  getAllBoiRates,
  getLastSyncTime,
  getLatestPrimeRate,
  setLastSyncTime,
  upsertBoiRates,
} from "./boiStorage";
import fallbackRates from "../data/boiRatesFallback.json";

/** How old a sync must be (in days) before the cache is considered stale. */
export const STALE_AFTER_DAYS = 7;

/**
 * Same-origin static data file produced by the BOI sync GitHub Action.
 *
 * Resolved via Vite's BASE_URL so it works whether the app is served from a
 * custom domain, root domain, or a GitHub Pages repository subdirectory
 * (https://<username>.github.io/<repo-name>/).
 */
export const BOI_DATA_URL = `${import.meta.env.BASE_URL}data/boiRates.json`.replace(
  /\/+/g,
  "/"
);


/**
 * Normalize an arbitrary fetched payload into BoiRateRecord[].
 *
 * Accepts an array of { effective_date, boi_rate } / { date, base_rate } objects
 * or a { rates: [...] } wrapper. Records missing a valid date or numeric rate are
 * skipped. The prime rate is always recomputed via the derivation rule.
 */
export function normalizeBoiRates(payload: unknown): BoiRateRecord[] {
  let list: unknown[] = [];

  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (Array.isArray(obj.rates)) list = obj.rates;
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
 * Run a full sync: fetch the same-origin static data file, upsert it into the
 * store, and record the sync time. On any failure (missing file, HTTP error,
 * malformed payload) it logs a clean warning and reports a fallback result.
 */
export async function syncBoiRates(): Promise<BoiSyncResult> {
  try {
    const response = await fetch(BOI_DATA_URL);
    if (!response.ok) throw new Error(`HTTP error ${response.status}`);

    const payload: unknown = await response.json();
    const records = normalizeBoiRates(payload);
    if (records.length === 0) throw new Error("No valid records in /data/boiRates.json");

    const count = upsertBoiRates(records);
    setLastSyncTime(new Date().toISOString());

    return { success: true, count, isFallback: false };
  } catch (error) {
    console.warn("[BOI Sync] Local static data fetch failed:", error);
    return { success: false, count: 0, isFallback: true };
  }
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
