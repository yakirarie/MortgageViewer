import { describe, it, expect, vi } from "vitest";
import { getMarketRates, refreshMarketRates, formatLastUpdated } from "./rates-api";

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

  it("returns expected values for January 2025", () => {
    const rates = getMarketRates();

    expect(rates.reference_market_rate).toBe(0.042);
    expect(rates.alternative_investment_annual_return).toBe(0.06);
    expect(rates.prime_rate_current).toBe(0.045);
    expect(rates.last_updated).toBe("2025-01-01");
    expect(rates.source).toBe("Bank of Israel (manually updated)");
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
