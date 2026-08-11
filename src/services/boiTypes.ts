// Shared types for the Bank of Israel (BOI) prime-rate sync feature.
//
// These mirror the `boi_prime_rates` table schema:
//   id, effective_date (UNIQUE), boi_rate, prime_rate, created_at

/** A single BOI rate decision record (mirrors the `boi_prime_rates` table row). */
export interface BoiRateRecord {
  /** Unique id (UUID in the server schema; generated client-side here). */
  id?: string;
  /** ISO date (YYYY-MM-DD) the rate decision took effect. Unique key. */
  effective_date: string;
  /** Bank of Israel base rate as a decimal, e.g. 0.045 = 4.5%. */
  boi_rate: number;
  /** Prime rate = boi_rate + 0.015, e.g. 0.06 = 6.0%. */
  prime_rate: number;
  /** ISO timestamp the record was created. */
  created_at?: string;
}

/** The constant spread added to the BOI base rate to derive the Prime rate. */
export const PRIME_SPREAD = 0.015;

/**
 * Derive the Prime rate from a BOI base rate:
 *   prime_rate = Number((boi_rate + 0.015).toFixed(4))
 */
export function derivePrimeRate(boiRate: number): number {
  return Number((boiRate + PRIME_SPREAD).toFixed(4));
}

/** Result of a sync attempt. */
export interface BoiSyncResult {
  /** Number of records written to the store. */
  recordsWritten: number;
  /** The latest prime rate after the sync, or null if none. */
  latestPrimeRate: number | null;
  /** The effective_date of the latest record after the sync, or null. */
  latestRateDate: string | null;
  /** ISO timestamp of the sync. */
  syncedAt: string;
  /** Source that produced the data ("remote" | "fallback"). */
  source: "remote" | "fallback";
}
