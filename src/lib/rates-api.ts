// Israeli market rates - Current as of July 2026
// These are manually maintained and should be updated periodically

import type { RateHistoryEntry } from "./types";

interface MarketRates {
  reference_market_rate: number;
  alternative_investment_annual_return: number;
  prime_rate_current: number;
  last_updated: string;
  source: string;
}

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

/** The most recent BoI base rate in the table. */
export function getCurrentBaseRate(): number {
  return BOI_BASE_RATE_HISTORY[0].base_rate;
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

/**
 * Get current market rates (manually maintained)
 * Updated: July 2026
 * Source: Bank of Israel public data
 */
export function getMarketRates(): MarketRates {

  return {
    reference_market_rate: 0.042,      // 4.2% - Current market rate for new mortgages
    alternative_investment_annual_return: 0.06,  // 6% - Conservative investment return (gov bonds)
    prime_rate_current: getCurrentBaseRate() + PRIME_SPREAD, // Prime = BoI base + 1.5% (as of Jul 2026)
    last_updated: '2026-07-09',
    source: 'Bank of Israel (manually updated)',

  };
}

/**
 * Refresh rates (placeholder - just returns current values)
 * In the future, this could be updated by an admin
 */
export async function refreshMarketRates(): Promise<MarketRates> {
  // Simulate network delay for UX
  await new Promise(resolve => setTimeout(resolve, 500));
  return getMarketRates();
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
