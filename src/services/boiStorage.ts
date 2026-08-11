// Client-side persistent storage for Bank of Israel (BOI) prime-rate records.
//
// This mirrors the `boi_prime_rates` table schema from the server-side design:
//   id, effective_date (UNIQUE), boi_rate, prime_rate, created_at
//
// In a browser SPA there is no Postgres, so we persist to localStorage (a
// synchronous, widely-supported browser store). The API surface is deliberately
// storage-agnostic so a real backend (IndexedDB, SQLite, Postgres) could swap in
// without changing callers.

import type { BoiRateRecord } from "./boiTypes";

const STORAGE_KEY = "boi_prime_rates";
const SYNC_TIME_KEY = "boi_prime_rates_last_sync";

/**
 * In-memory fallback store used when `localStorage` is unavailable (e.g. in a
 * Node test environment or during SSR). This keeps the storage layer fully
 * testable without a DOM while still persisting to localStorage in the browser.
 */
const memoryStore = new Map<string, string>();

/** Resolve the backing store: localStorage when available, else the in-memory map. */
function getStore(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  if (typeof localStorage !== "undefined") {
    return localStorage;
  }
  return {
    getItem: (key: string) => memoryStore.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memoryStore.set(key, value);
    },
    removeItem: (key: string) => {
      memoryStore.delete(key);
    },
  };
}

/** Read all stored BOI rate records, sorted newest → oldest by effective_date. */
export function getAllBoiRates(): BoiRateRecord[] {
  try {
    const raw = getStore().getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BoiRateRecord[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((r) => r && typeof r.effective_date === "string" && typeof r.boi_rate === "number")
      .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));
  } catch {
    return [];
  }
}


/**
 * The most recent prime rate by effective_date, or null when the store is empty.
 * Equivalent to: SELECT prime_rate FROM boi_prime_rates ORDER BY effective_date DESC LIMIT 1;
 */
export function getLatestPrimeRate(): number | null {
  const rates = getAllBoiRates();
  return rates.length > 0 ? rates[0].prime_rate : null;
}

/** The most recent BOI base rate by effective_date, or null when empty. */
export function getLatestBoiRate(): number | null {
  const rates = getAllBoiRates();
  return rates.length > 0 ? rates[0].boi_rate : null;
}

/** The effective_date of the most recent record, or null when empty. */
export function getLatestRateDate(): string | null {
  const rates = getAllBoiRates();
  return rates.length > 0 ? rates[0].effective_date : null;
}

/**
 * Idempotently upsert a batch of BOI rate records. Records are keyed by
 * `effective_date` (UNIQUE): an existing record with the same date is updated in
 * place, a new date is appended. Returns the number of records written.
 */
export function upsertBoiRates(records: BoiRateRecord[]): number {
  if (!records || records.length === 0) return 0;

  const existing = getAllBoiRates();
  const byDate = new Map<string, BoiRateRecord>();
  for (const r of existing) byDate.set(r.effective_date, r);

  for (const r of records) {
    if (
      !r ||
      typeof r.effective_date !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(r.effective_date) ||
      typeof r.boi_rate !== "number"
    ) {
      continue;
    }
    byDate.set(r.effective_date, {
      id: byDate.get(r.effective_date)?.id ?? r.id ?? cryptoRandomId(),
      effective_date: r.effective_date,
      boi_rate: r.boi_rate,
      prime_rate: r.prime_rate,
      created_at: byDate.get(r.effective_date)?.created_at ?? r.created_at ?? new Date().toISOString(),
    });
  }


  const merged = Array.from(byDate.values()).sort((a, b) =>
    a.effective_date < b.effective_date ? 1 : -1
  );
  getStore().setItem(STORAGE_KEY, JSON.stringify(merged));
  return merged.length;
}

/** Replace the entire store with a given set of records (used to seed the fallback). */
export function replaceAllBoiRates(records: BoiRateRecord[]): number {
  getStore().removeItem(STORAGE_KEY);
  return upsertBoiRates(records);
}

/** Timestamp (ISO string) of the last successful sync, or null if never synced. */
export function getLastSyncTime(): string | null {
  return getStore().getItem(SYNC_TIME_KEY);
}

/** Record the timestamp of a successful sync. */
export function setLastSyncTime(iso: string = new Date().toISOString()): void {
  getStore().setItem(SYNC_TIME_KEY, iso);
}

/** Clear all stored BOI rate data and sync metadata. */
export function clearBoiRates(): void {
  getStore().removeItem(STORAGE_KEY);
  getStore().removeItem(SYNC_TIME_KEY);
}


/** A small random id generator (crypto.randomUUID when available). */
function cryptoRandomId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `boi-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
