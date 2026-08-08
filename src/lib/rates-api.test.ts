import { describe, it, expect } from "vitest";

import {
  getMarketRates,
  refreshMarketRates,
  formatLastUpdated,
  getCurrentBaseRate,
  getPrimeBaseRateAt,
  primeEffectiveRate,
  populatePrimeRateHistory,
  BOI_BASE_RATE_HISTORY,
} from "./rates-api";


describe("getMarketRates", () => {
  it("returns market rates with correct structure", () => {
    const rates = getMarketRates();

    expect(rates).toHaveProperty("reference_market_rate");
    expect(rates).toHaveProperty("alternative_investment_annual_return");
    expect(rates).toHaveProperty("prime_rate_current");
    expect(rates).toHaveProperty("last_updated");
    expect(rates).toHaveProperty("source");
  });

  it("returns reference_market_rate as a number between 0 and 1", () => {
    const rates = getMarketRates();
    expect(rates.reference_market_rate).toBeGreaterThanOrEqual(0);
    expect(rates.reference_market_rate).toBeLessThanOrEqual(1);
  });

  it("returns alternative_investment_annual_return as a number between 0 and 1", () => {
    const rates = getMarketRates();
    expect(rates.alternative_investment_annual_return).toBeGreaterThanOrEqual(0);
    expect(rates.alternative_investment_annual_return).toBeLessThanOrEqual(1);
  });

  it("returns prime_rate_current as a number between 0 and 1", () => {
    const rates = getMarketRates();
    expect(rates.prime_rate_current).toBeGreaterThanOrEqual(0);
    expect(rates.prime_rate_current).toBeLessThanOrEqual(1);
  });

  it("returns last_updated as a date string", () => {
    const rates = getMarketRates();
    expect(rates.last_updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns source as a string", () => {
    const rates = getMarketRates();
    expect(typeof rates.source).toBe("string");
    expect(rates.source.length).toBeGreaterThan(0);
  });

  it("returns consistent values across calls", () => {
    const rates1 = getMarketRates();
    const rates2 = getMarketRates();

    expect(rates1.reference_market_rate).toBe(rates2.reference_market_rate);
    expect(rates1.alternative_investment_annual_return).toBe(rates2.alternative_investment_annual_return);
    expect(rates1.prime_rate_current).toBe(rates2.prime_rate_current);
    expect(rates1.last_updated).toBe(rates2.last_updated);
    expect(rates1.source).toBe(rates2.source);
  });

  it("returns expected values for July 2026", () => {
    const rates = getMarketRates();

    expect(rates.reference_market_rate).toBe(0.042);
    expect(rates.alternative_investment_annual_return).toBe(0.06);
    // Prime = BoI base (3.5%) + 1.5% spread = 5.0%
    expect(rates.prime_rate_current).toBe(0.05);
    expect(rates.last_updated).toBe("2026-07-09");
    expect(rates.source).toBe("Bank of Israel (manually updated)");
  });

});

describe("BOI_BASE_RATE_HISTORY", () => {
  it("is sorted newest → oldest", () => {
    for (let i = 0; i < BOI_BASE_RATE_HISTORY.length - 1; i++) {
      const cur = new Date(BOI_BASE_RATE_HISTORY[i].date).getTime();
      const next = new Date(BOI_BASE_RATE_HISTORY[i + 1].date).getTime();
      expect(cur).toBeGreaterThanOrEqual(next);
    }
  });

  it("contains the current base rate as the first entry", () => {
    expect(BOI_BASE_RATE_HISTORY[0].base_rate).toBe(0.035);
    expect(BOI_BASE_RATE_HISTORY[0].date).toBe("2026-07-09");
  });

  it("contains the oldest known rate as the last entry", () => {
    expect(BOI_BASE_RATE_HISTORY[BOI_BASE_RATE_HISTORY.length - 1].date).toBe("2017-01-26");
    expect(BOI_BASE_RATE_HISTORY[BOI_BASE_RATE_HISTORY.length - 1].base_rate).toBe(0.001);
  });
});

describe("getCurrentBaseRate", () => {
  it("returns the latest BoI base rate", () => {
    expect(getCurrentBaseRate()).toBe(0.035);
  });
});

describe("getPrimeBaseRateAt", () => {
  it("returns the current rate for a date after the latest entry", () => {
    expect(getPrimeBaseRateAt("2030-01-01")).toBe(0.035);
  });

  it("returns the rate in effect on a given date", () => {
    // 2023-01-05 → 3.75%
    expect(getPrimeBaseRateAt("2023-01-05")).toBe(0.0375);
    // 2023-02-23 → 4.25%
    expect(getPrimeBaseRateAt("2023-02-23")).toBe(0.0425);
    // 2022-11-24 → 3.25%
    expect(getPrimeBaseRateAt("2022-12-01")).toBe(0.0325);
  });

  it("returns the oldest known rate for dates before the table", () => {
    expect(getPrimeBaseRateAt("2010-01-01")).toBe(0.001);
  });

  it("returns the current rate for an empty or invalid date", () => {
    expect(getPrimeBaseRateAt("")).toBe(0.035);
    expect(getPrimeBaseRateAt("not-a-date")).toBe(0.035);
  });
});

describe("primeEffectiveRate", () => {
  it("computes Effective Rate = (Base Rate + 1.5%) + Margin", () => {
    // 4.5% base + 1.5% spread - 0.6% margin = 5.4%
    expect(primeEffectiveRate(0.045, -0.006)).toBeCloseTo(0.054);
    // 3.5% base + 1.5% spread + 0 margin = 5.0%
    expect(primeEffectiveRate(0.035, 0)).toBeCloseTo(0.05);
    // 3.5% base + 1.5% spread + 0.5% margin = 5.5%
    expect(primeEffectiveRate(0.035, 0.005)).toBeCloseTo(0.055);
  });
});


describe("populatePrimeRateHistory", () => {
  it("returns an empty array for a missing start date", () => {
    expect(populatePrimeRateHistory("", -0.006)).toEqual([]);
    expect(populatePrimeRateHistory("not-a-date", -0.006)).toEqual([]);
  });

  it("populates entries from the start date onward, oldest → newest", () => {
    const history = populatePrimeRateHistory("2023-01-05", -0.006);
    expect(history.length).toBeGreaterThan(0);
    // oldest first
    expect(history[0].effective_date).toBe("2023-01-05");
    expect(history[history.length - 1].effective_date).toBe("2026-07-09");
    // sorted ascending
    for (let i = 0; i < history.length - 1; i++) {
      expect(history[i].effective_date < history[i + 1].effective_date).toBe(true);
    }
  });

  it("applies the margin to each entry and tags as auto-populated", () => {
    const history = populatePrimeRateHistory("2023-01-05", -0.006);
    for (const entry of history) {
      const baseRate = getPrimeBaseRateAt(entry.effective_date);
      // Effective = (base + 1.5% spread) + margin
      expect(entry.annual_interest_rate).toBeCloseTo(baseRate + 0.015 - 0.006);
      expect(entry.is_manual_override).toBe(false);
    }
  });


  it("excludes entries before the start date", () => {
    const history = populatePrimeRateHistory("2024-01-01", 0);
    expect(history[0].effective_date).toBe("2024-01-04");
    expect(history.every((e) => e.effective_date >= "2024-01-01")).toBe(true);
  });

  it("matches the known BoI timeline for a specific window", () => {
    const history = populatePrimeRateHistory("2022-01-01", 0);
    // Effective = base + 1.5% spread (margin 0)
    // 2022-02-24 → 0.1% + 1.5% = 1.6%
    // 2022-04-14 → 0.35% + 1.5% = 1.85%
    // 2022-05-26 → 0.75% + 1.5% = 2.25%
    const feb = history.find((e) => e.effective_date === "2022-02-24");
    const apr = history.find((e) => e.effective_date === "2022-04-14");
    const may = history.find((e) => e.effective_date === "2022-05-26");
    expect(feb?.annual_interest_rate).toBeCloseTo(0.016);
    expect(apr?.annual_interest_rate).toBeCloseTo(0.0185);
    expect(may?.annual_interest_rate).toBeCloseTo(0.0225);
  });

});


describe("refreshMarketRates", () => {
  it("returns a promise that resolves to market rates", async () => {
    const rates = await refreshMarketRates();

    expect(rates).toHaveProperty("reference_market_rate");
    expect(rates).toHaveProperty("alternative_investment_annual_return");
    expect(rates).toHaveProperty("prime_rate_current");
    expect(rates).toHaveProperty("last_updated");
    expect(rates).toHaveProperty("source");
  });

  it("returns the same values as getMarketRates", async () => {
    const staticRates = getMarketRates();
    const refreshedRates = await refreshMarketRates();

    expect(refreshedRates.reference_market_rate).toBe(staticRates.reference_market_rate);
    expect(refreshedRates.alternative_investment_annual_return).toBe(staticRates.alternative_investment_annual_return);
    expect(refreshedRates.prime_rate_current).toBe(staticRates.prime_rate_current);
  });

  it("simulates network delay", async () => {
    const startTime = Date.now();
    await refreshMarketRates();
    const endTime = Date.now();

    // Should take approximately 500ms
    expect(endTime - startTime).toBeGreaterThanOrEqual(400);
    expect(endTime - startTime).toBeLessThan(1000);
  });

  it("can be called multiple times", async () => {
    const rates1 = await refreshMarketRates();
    const rates2 = await refreshMarketRates();

    expect(rates1).toEqual(rates2);
  });
});

describe("formatLastUpdated", () => {
  it("returns 'Today' for today's date", () => {
    const today = new Date().toISOString();
    expect(formatLastUpdated(today)).toBe("Today");
  });

  it("returns 'Yesterday' for yesterday's date", () => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    expect(formatLastUpdated(yesterday.toISOString())).toBe("Yesterday");
  });

  it("returns 'X days ago' for dates within the last week", () => {
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    expect(formatLastUpdated(threeDaysAgo.toISOString())).toBe("3 days ago");

    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    expect(formatLastUpdated(fiveDaysAgo.toISOString())).toBe("5 days ago");
  });

  it("returns 'X weeks ago' for dates within the last month", () => {
    const twoWeeksAgo = new Date();
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
    expect(formatLastUpdated(twoWeeksAgo.toISOString())).toBe("2 weeks ago");

    const threeWeeksAgo = new Date();
    threeWeeksAgo.setDate(threeWeeksAgo.getDate() - 21);
    expect(formatLastUpdated(threeWeeksAgo.toISOString())).toBe("3 weeks ago");
  });

  it("returns formatted date for older dates", () => {
    const oldDate = new Date();
    oldDate.setMonth(oldDate.getMonth() - 2);
    const formatted = formatLastUpdated(oldDate.toISOString());

    // Should be a localized date string
    expect(formatted).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("handles dates far in the past", () => {
    const oldDate = new Date("2020-01-01").toISOString();
    const formatted = formatLastUpdated(oldDate);

    expect(formatted).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("handles ISO date strings correctly", () => {
    const dateStr = "2025-01-15T10:30:00.000Z";
    const formatted = formatLastUpdated(dateStr);

    expect(typeof formatted).toBe("string");
    expect(formatted.length).toBeGreaterThan(0);
  });

  it("handles date at exactly 7 days ago", () => {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const formatted = formatLastUpdated(sevenDaysAgo.toISOString());

    // 7 days should be "1 weeks ago" (7/7 = 1)
    expect(formatted).toBe("1 weeks ago");
  });

  it("handles date at exactly 30 days ago", () => {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const formatted = formatLastUpdated(thirtyDaysAgo.toISOString());

    // 30 days should be formatted as a date
    expect(formatted).toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });
});
