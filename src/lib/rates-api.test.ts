import { describe, it, expect } from "vitest";

import {
  formatLastUpdated,
  getCurrentBaseRate,
  getRatesAsOfDate,
  isRatesCurrent,
  formatFullDateTime,
  getPrimeBaseRateAt,
  primeEffectiveRate,
  populatePrimeRateHistory,
  getBoiAverageRate,
  BOI_BASE_RATE_HISTORY,
} from "./rates-api";





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

describe("getRatesAsOfDate", () => {
  it("returns the date of the latest BoI base-rate entry", () => {
    expect(getRatesAsOfDate()).toBe("2026-07-09");
  });

  it("matches the first entry in the base-rate history table", () => {
    expect(getRatesAsOfDate()).toBe(BOI_BASE_RATE_HISTORY[0].date);
  });
});

describe("isRatesCurrent", () => {
  it("returns a boolean", () => {
    expect(typeof isRatesCurrent()).toBe("boolean");
  });

  it("returns true when the latest base-rate entry is dated today", () => {
    // The table's latest entry is 2026-07-09. If today is that date, it's current.
    const today = new Date();
    const asOf = new Date(getRatesAsOfDate());
    const sameDay =
      today.getFullYear() === asOf.getFullYear() &&
      today.getMonth() === asOf.getMonth() &&
      today.getDate() === asOf.getDate();
    expect(isRatesCurrent()).toBe(sameDay);
  });
});

describe("formatFullDateTime", () => {
  it("formats a Date with full date and time", () => {
    const d = new Date(2026, 6, 9, 15, 48); // July 9, 2026, 3:48 PM
    const result = formatFullDateTime(d);
    expect(result).toContain("July 9, 2026");
    expect(result).toContain("3:48");
  });

  it("accepts an ISO/date string", () => {
    const result = formatFullDateTime("2026-07-09");
    expect(result).toContain("July 9, 2026");
  });

  it("returns an empty string for an invalid date", () => {
    expect(formatFullDateTime("not-a-date")).toBe("");
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

describe("getBoiAverageRate", () => {
  it("returns the current base rate for a missing or invalid fromDate", () => {
    expect(getBoiAverageRate("")).toBe(getCurrentBaseRate());
    expect(getBoiAverageRate("not-a-date")).toBe(getCurrentBaseRate());
  });

  it("returns the current base rate when toDate is before fromDate", () => {
    expect(getBoiAverageRate("2026-07-09", "2026-01-01")).toBe(getCurrentBaseRate());
  });

  it("returns the exact rate when the range spans a single constant-rate period", () => {
    // 2026-07-09 onward is a single 3.5% period (the latest entry).
    const avg = getBoiAverageRate("2026-07-09", "2026-07-20");
    expect(avg).toBeCloseTo(0.035, 5);
  });

  it("weights by duration across multiple rate periods", () => {
    // From 2026-05-28 (3.75%) to 2026-07-09 (3.5%).
    // 2026-05-28 → 2026-07-09 is 42 days at 3.75%.
    // 2026-07-09 → 2026-07-20 is 11 days at 3.5%.
    const avg = getBoiAverageRate("2026-05-28", "2026-07-20");
    // Weighted: (42 * 0.0375 + 11 * 0.035) / 53
    const expected = (42 * 0.0375 + 11 * 0.035) / 53;
    expect(avg).toBeCloseTo(expected, 5);
  });

  it("returns a value between the min and max base rates in the range", () => {
    const avg = getBoiAverageRate("2022-01-01", "2026-07-09");
    expect(avg).toBeGreaterThanOrEqual(0.001);
    expect(avg).toBeLessThanOrEqual(0.0475);
  });

  it("defaults toDate to today", () => {
    const avg = getBoiAverageRate("2026-07-09");
    expect(avg).toBeCloseTo(0.035, 5);
  });
});

