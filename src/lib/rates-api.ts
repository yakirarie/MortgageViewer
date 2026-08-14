// Israeli market rates - Current as of July 2026
// These are manually maintained and should be updated periodically

import type { RateHistoryEntry } from "./types";

/**
 * Bank of Israel declared nominal interest rate (base rate) history.

 * Source: https://www.boi.org.il/boi_files/Statistics/bointcre_m.xls
 * Each entry is the base rate in effect from `date` (ISO) onward, until the
 * next entry. Rates are decimals (e.g. 0.045 = 4.5%).
 */
export const BOI_BASE_RATE_HISTORY: { date: string; base_rate: number }[] = [
  { date: "2026-07-09", base_rate: 0.035 },
  { date: "2026-05-28", base_rate: 0.0375 },
  { date: "2026-04-03", base_rate: 0.04 },
  { date: "2026-02-26", base_rate: 0.04 },
  { date: "2026-01-08", base_rate: 0.04 },
  { date: "2025-11-27", base_rate: 0.0425 },
  { date: "2025-10-05", base_rate: 0.045 },
  { date: "2025-08-24", base_rate: 0.045 },
  { date: "2025-07-10", base_rate: 0.045 },
  { date: "2025-05-29", base_rate: 0.045 },
  { date: "2025-04-10", base_rate: 0.045 },
  { date: "2025-02-27", base_rate: 0.045 },
  { date: "2025-01-09", base_rate: 0.045 },
  { date: "2024-11-28", base_rate: 0.045 },
  { date: "2024-10-14", base_rate: 0.045 },
  { date: "2024-09-01", base_rate: 0.045 },
  { date: "2024-07-11", base_rate: 0.045 },
  { date: "2024-05-30", base_rate: 0.045 },
  { date: "2024-04-11", base_rate: 0.045 },
  { date: "2024-02-29", base_rate: 0.045 },
  { date: "2024-01-04", base_rate: 0.045 },
  { date: "2023-11-30", base_rate: 0.0475 },
  { date: "2023-10-26", base_rate: 0.0475 },
  { date: "2023-09-07", base_rate: 0.0475 },
  { date: "2023-07-13", base_rate: 0.0475 },
  { date: "2023-05-25", base_rate: 0.0475 },
  { date: "2023-04-07", base_rate: 0.045 },
  { date: "2023-02-23", base_rate: 0.0425 },
  { date: "2023-01-05", base_rate: 0.0375 },
  { date: "2022-11-24", base_rate: 0.0325 },
  { date: "2022-10-09", base_rate: 0.0275 },
  { date: "2022-08-25", base_rate: 0.02 },
  { date: "2022-07-07", base_rate: 0.0125 },
  { date: "2022-05-26", base_rate: 0.0075 },
  { date: "2022-04-14", base_rate: 0.0035 },
  { date: "2022-02-24", base_rate: 0.001 },
  { date: "2022-01-06", base_rate: 0.001 },
  { date: "2021-11-25", base_rate: 0.001 },
  { date: "2021-10-11", base_rate: 0.001 },
  { date: "2021-08-26", base_rate: 0.001 },
  { date: "2021-07-08", base_rate: 0.001 },
  { date: "2021-06-03", base_rate: 0.001 },
  { date: "2021-04-22", base_rate: 0.001 },
  { date: "2021-02-25", base_rate: 0.001 },
  { date: "2021-01-07", base_rate: 0.001 },
  { date: "2020-12-03", base_rate: 0.001 },
  { date: "2020-10-26", base_rate: 0.001 },
  { date: "2020-08-27", base_rate: 0.001 },
  { date: "2020-07-09", base_rate: 0.001 },
  { date: "2020-05-28", base_rate: 0.001 },
  { date: "2020-04-10", base_rate: 0.001 },
  { date: "2020-02-27", base_rate: 0.0025 },
  { date: "2020-01-13", base_rate: 0.0025 },
  { date: "2019-11-28", base_rate: 0.0025 },
  { date: "2019-10-11", base_rate: 0.0025 },
  { date: "2019-09-01", base_rate: 0.0025 },
  { date: "2019-07-11", base_rate: 0.0025 },
  { date: "2019-05-23", base_rate: 0.0025 },
  { date: "2019-04-11", base_rate: 0.0025 },
  { date: "2019-02-28", base_rate: 0.0025 },
  { date: "2019-01-10", base_rate: 0.0025 },
  { date: "2018-11-29", base_rate: 0.0025 },
  { date: "2018-10-11", base_rate: 0.001 },
  { date: "2018-09-02", base_rate: 0.001 },
  { date: "2018-07-12", base_rate: 0.001 },
  { date: "2018-05-31", base_rate: 0.001 },
  { date: "2018-04-20", base_rate: 0.001 },
  { date: "2018-03-02", base_rate: 0.001 },
  { date: "2018-01-14", base_rate: 0.001 },
  { date: "2017-11-30", base_rate: 0.001 },
  { date: "2017-10-23", base_rate: 0.001 },
  { date: "2017-09-01", base_rate: 0.001 },
  { date: "2017-07-13", base_rate: 0.001 },
  { date: "2017-06-02", base_rate: 0.001 },
  { date: "2017-04-13", base_rate: 0.001 },
  { date: "2017-03-02", base_rate: 0.001 },
  { date: "2017-01-26", base_rate: 0.001 },
];

/**
 * A dynamically-synced override for the "current" BoI base rate, sourced from
 * the client-side BOI rate store (see src/services/boiSyncService.ts). When set,
 * `getCurrentBaseRate()` prefers this value over the static table. This lets the
 * Prime calculation engine consume the latest synced rate automatically while
 * still falling back to the bundled static history when no sync has happened.
 */
let dynamicBaseRate: number | null = null;

/** Set (or clear, with null) the dynamically-synced current BoI base rate. */
export function setDynamicBaseRate(rate: number | null): void {
  dynamicBaseRate = rate;
}

/** The most recent BoI base rate — dynamic override first, else the static table. */
export function getCurrentBaseRate(): number {
  if (dynamicBaseRate !== null && Number.isFinite(dynamicBaseRate)) {
    return dynamicBaseRate;
  }
  return BOI_BASE_RATE_HISTORY[0].base_rate;
}


/**
 * The date of the most recent BoI base-rate decision in the table. This is the
 * "as of" date for all rate data — the app's rates are a static, manually
 * maintained snapshot, so this reflects exactly when the data was last updated.
 */
export function getRatesAsOfDate(): string {
  return BOI_BASE_RATE_HISTORY[0].date;
}

/**
 * Whether the rate data reflects today's BoI base rate (i.e. the latest entry
 * in the table is dated today). Returns false when the data is stale.
 */
export function isRatesCurrent(): boolean {
  const asOf = new Date(getRatesAsOfDate());
  const today = new Date();
  return (
    asOf.getFullYear() === today.getFullYear() &&
    asOf.getMonth() === today.getMonth() &&
    asOf.getDate() === today.getDate()
  );
}

/**
 * Format a date as a full, human-readable date with time, e.g.
 * "July 9, 2026, 3:48 PM". Accepts a Date or an ISO/date string.
 */
export function formatFullDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}


/**
 * Get the Bank of Israel base rate in effect at a given ISO date.
 * Returns the rate of the latest entry whose date is <= `date`. If `date`
 * predates the table, returns the oldest known rate. If `date` is invalid,
 * returns the current (latest) rate.
 */
export function getPrimeBaseRateAt(date: string): number {
  if (!date) return getCurrentBaseRate();
  const target = new Date(date).getTime();
  if (isNaN(target)) return getCurrentBaseRate();

  for (const entry of BOI_BASE_RATE_HISTORY) {
    if (new Date(entry.date).getTime() <= target) {
      return entry.base_rate;
    }
  }
  // date predates the whole table — use the oldest known rate
  return BOI_BASE_RATE_HISTORY[BOI_BASE_RATE_HISTORY.length - 1].base_rate;
}

/**
 * The Prime rate in Israel is defined as the Bank of Israel base rate plus a
 * constant spread of 1.5 percentage points:
 *   Prime Rate = BoI Base Rate + 1.5%
 */
export const PRIME_SPREAD = 0.015;

/**
 * Effective Prime rate for a given BoI base rate and margin/spread.
 * Effective Rate = (BoI Base Rate + 1.5%) + Margin. Margin is a decimal, e.g.
 * -0.006 for "Prime − 0.6%".
 */
export function primeEffectiveRate(baseRate: number, margin: number): number {
  return baseRate + PRIME_SPREAD + margin;
}


/**
 * Build the historical effective-rate timeline for a Prime track.
 * For each BoI base-rate change on or after `startDate`, produces a
 * RateHistoryEntry with effective rate = (baseRate + 1.5%) + margin. Entries
 * are sorted oldest → newest and tagged `is_manual_override: false`.
 */

export function populatePrimeRateHistory(
  startDate: string,
  margin: number
): RateHistoryEntry[] {
  if (!startDate) return [];
  const start = new Date(startDate).getTime();
  if (isNaN(start)) return [];

  const history: RateHistoryEntry[] = [];
  for (const entry of BOI_BASE_RATE_HISTORY) {
    if (new Date(entry.date).getTime() >= start) {
      history.push({
        effective_date: entry.date,
        annual_interest_rate: primeEffectiveRate(entry.base_rate, margin),
        is_manual_override: false,
      });
    }
  }
  // oldest → newest
  return history.reverse();
}

/**
 * The average BoI base rate over a date range. Used by the Fixed Unlinked
 * (Klatz) track's early-payoff gap penalty: the bank compensates itself for the
 * difference between the loan's fixed rate and the average BoI base rate over
 * the remaining term.
 *
 * The average is computed by weighting each base-rate period by its duration
 * (in days) within `[fromDate, toDate]`. If `toDate` is omitted, it defaults to
 * today. If `fromDate` predates the table, the oldest known rate is used for the
 * pre-table portion. Returns the current base rate when the range is invalid.
 */
export function getBoiAverageRate(fromDate: string, toDate?: string): number {
  if (!fromDate) return getCurrentBaseRate();
  const from = new Date(fromDate).getTime();
  if (isNaN(from)) return getCurrentBaseRate();
  const to = toDate ? new Date(toDate).getTime() : Date.now();
  if (isNaN(to) || to <= from) return getCurrentBaseRate();

  // Build the timeline of base-rate periods within [from, to].
  // Each period runs from its entry date to the next entry's date (or `to`).
  let totalDays = 0;
  let weightedSum = 0;

  for (let i = 0; i < BOI_BASE_RATE_HISTORY.length; i++) {
    const entry = BOI_BASE_RATE_HISTORY[i];
    const entryTime = new Date(entry.date).getTime();
    if (entryTime > to) break; // beyond the range

    const periodStart = Math.max(entryTime, from);
    const nextEntry = BOI_BASE_RATE_HISTORY[i - 1]; // next entry is the *newer* one (list is newest→oldest)
    const periodEnd = nextEntry ? Math.min(new Date(nextEntry.date).getTime(), to) : to;

    if (periodEnd > periodStart) {
      const days = (periodEnd - periodStart) / 86400000;
      totalDays += days;
      weightedSum += days * entry.base_rate;
    }
  }

  if (totalDays <= 0) return getCurrentBaseRate();
  return weightedSum / totalDays;
}

// ---------------------------------------------------------------------------
// BOI Benchmark Market Rates (Ribit Mmemotzet) by track type & duration tier
// ---------------------------------------------------------------------------

/**
 * Bank of Israel average market interest rates (Ribit Mmemotzet) for new
 * mortgages, categorized by track type and remaining-duration tier. These are
 * the benchmark rates used to compute the interest-gap penalty (Amlat Pa'arei
 * Ribit) when a loan's contract rate exceeds the prevailing market rate.
 *
 * Tiers (remaining months): 1–5y (≤60), 5–10y (≤120), 10–15y (≤180),
 * 15–25y (≤300), 25y+ (>300). Rates are decimals (e.g. 0.0473 = 4.73%).
 *
 * Source: Bank of Israel average mortgage interest rates (manually maintained
 * snapshot, current as of the app's rates-as-of date).
 */
export const BOI_BENCHMARK_RATES: Record<
  string,
  { maxMonths: number; rate: number }[]
> = {
  FIXED_UNLINKED: [
    { maxMonths: 60, rate: 0.043 },
    { maxMonths: 120, rate: 0.045 },
    { maxMonths: 180, rate: 0.046 },
    { maxMonths: 300, rate: 0.047 },
    { maxMonths: Infinity, rate: 0.0473 },
  ],
  FIXED_LINKED: [
    { maxMonths: 60, rate: 0.033 },
    { maxMonths: 120, rate: 0.035 },
    { maxMonths: 180, rate: 0.036 },
    { maxMonths: 300, rate: 0.037 },
    { maxMonths: Infinity, rate: 0.0373 },
  ],
  VARIABLE_5Y: [
    { maxMonths: 60, rate: 0.041 },
    { maxMonths: 120, rate: 0.043 },
    { maxMonths: 180, rate: 0.044 },
    { maxMonths: 300, rate: 0.045 },
    { maxMonths: Infinity, rate: 0.0453 },
  ],
  VARIABLE_5Y_LINKED: [
    { maxMonths: 60, rate: 0.031 },
    { maxMonths: 120, rate: 0.033 },
    { maxMonths: 180, rate: 0.034 },
    { maxMonths: 300, rate: 0.035 },
    { maxMonths: Infinity, rate: 0.0353 },
  ],
  // Bond-anchored variable (משתנה עוגן אג"ח), unlinked. The rate tracks a
  // government bond index rather than the bank's 5-year reset cycle, so the
  // benchmark tiers mirror the variable-rate curve (VARIABLE_5Y) but the
  // penalty horizon is the FULL remaining term (see getPenaltyHorizon).
  VARIABLE_BOND_UNLINKED: [
    { maxMonths: 60, rate: 0.041 },
    { maxMonths: 120, rate: 0.043 },
    { maxMonths: 180, rate: 0.044 },
    { maxMonths: 300, rate: 0.045 },
    { maxMonths: Infinity, rate: 0.0453 },
  ],
  PRIME: [

    { maxMonths: 60, rate: 0.05 },
    { maxMonths: 120, rate: 0.05 },
    { maxMonths: 180, rate: 0.05 },
    { maxMonths: 300, rate: 0.05 },
    { maxMonths: Infinity, rate: 0.05 },
  ],
  OTHER: [
    { maxMonths: 60, rate: 0.043 },
    { maxMonths: 120, rate: 0.045 },
    { maxMonths: 180, rate: 0.046 },
    { maxMonths: 300, rate: 0.047 },
    { maxMonths: Infinity, rate: 0.0473 },
  ],
};

/**
 * The BOI average market benchmark rate for a track, matched by track type and
 * remaining duration. Returns the rate for the tier that contains
 * `remainingMonths` (e.g. 0.0473 for a 27-year / 325-month fixed unlinked
 * track). Falls back to the current BoI base rate when the track type is
 * unknown or the remaining term is missing.
 */
export function getBoiBenchmarkRate(
  trackType: string,
  remainingMonths: number
): number {
  const tiers = BOI_BENCHMARK_RATES[trackType];
  if (!tiers) return getCurrentBaseRate();
  const months = Number.isFinite(remainingMonths) && remainingMonths > 0 ? remainingMonths : 0;
  for (const tier of tiers) {
    if (months <= tier.maxMonths) return tier.rate;
  }
  return tiers[tiers.length - 1].rate;
}

/**
 * Format the last updated timestamp for display
 */
export function formatLastUpdated(isoString: string): string {


  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return `${diffDays} days ago`;
  } else if (diffDays < 30) {
    return `${Math.floor(diffDays / 7)} weeks ago`;
  } else {
    return date.toLocaleDateString();
  }
}
