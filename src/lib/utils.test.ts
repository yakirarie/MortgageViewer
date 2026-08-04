import { describe, it, expect } from "vitest";
import {
  generateId,
  formatCurrency,
  formatPercent,
  formatNumber,
  parseCurrencyInput,
  parsePercentInput,
  downloadJson,
  uploadJson,
  getCurrentTimestamp,
} from "./utils";

describe("generateId", () => {
  it("generates a unique ID each time", () => {
    const id1 = generateId();
    const id2 = generateId();
    expect(id1).not.toBe(id2);
  });

  it("generates a valid UUID format", () => {
    const id = generateId();
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    expect(id).toMatch(uuidRegex);
  });

  it("generates IDs of correct length", () => {
    const id = generateId();
    expect(id.length).toBe(36);
  });
});

describe("formatCurrency", () => {
  it("formats zero correctly", () => {
    expect(formatCurrency(0)).toBe("₪0");
  });

  it("formats positive numbers with ILS currency", () => {
    expect(formatCurrency(1000)).toBe("₪1,000");
    expect(formatCurrency(1000000)).toBe("₪1,000,000");
  });

  it("handles decimal values by rounding to whole numbers", () => {
    expect(formatCurrency(1234.56)).toBe("₪1,235");
  });

  it("handles very large numbers", () => {
    expect(formatCurrency(1234567890)).toBe("₪1,234,567,890");
  });

  it("returns ₪0 for non-finite values", () => {
    expect(formatCurrency(NaN)).toBe("₪0");
    expect(formatCurrency(Infinity)).toBe("₪0");
    expect(formatCurrency(-Infinity)).toBe("₪0");
  });
});

describe("formatPercent", () => {
  it("formats zero as 0%", () => {
    expect(formatPercent(0)).toBe("0.00%");
  });

  it("formats decimal values as percentages", () => {
    expect(formatPercent(0.05)).toBe("5.00%");
    expect(formatPercent(0.1)).toBe("10.00%");
    expect(formatPercent(0.5)).toBe("50.00%");
  });

  it("formats small percentages", () => {
    expect(formatPercent(0.001)).toBe("0.10%");
    expect(formatPercent(0.0001)).toBe("0.01%");
  });

  it("handles percentages above 100%", () => {
    expect(formatPercent(1)).toBe("100.00%");
    expect(formatPercent(1.5)).toBe("150.00%");
  });

  it("returns 0% for non-finite values", () => {
    expect(formatPercent(NaN)).toBe("0%");
    expect(formatPercent(Infinity)).toBe("0%");
    expect(formatPercent(-Infinity)).toBe("0%");
  });
});

describe("formatNumber", () => {
  it("formats zero as 0", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("formats numbers with thousands separators", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });

  it("handles decimal values with precision", () => {
    expect(formatNumber(1234.56)).toBe("1,234.56");
  });

  it("handles very large numbers", () => {
    expect(formatNumber(1234567890)).toBe("1,234,567,890");
  });

  it("returns 0 for non-finite values", () => {
    expect(formatNumber(NaN)).toBe("0");
    expect(formatNumber(Infinity)).toBe("0");
    expect(formatNumber(-Infinity)).toBe("0");
  });
});

describe("parseCurrencyInput", () => {
  it("parses plain numbers", () => {
    expect(parseCurrencyInput("1000")).toBe(1000);
    expect(parseCurrencyInput("1234.56")).toBe(1234.56);
  });

  it("removes currency symbol", () => {
    expect(parseCurrencyInput("₪1000")).toBe(1000);
    expect(parseCurrencyInput("₪1,000")).toBe(1000);
  });

  it("removes thousands separators", () => {
    expect(parseCurrencyInput("1,000")).toBe(1000);
    expect(parseCurrencyInput("1,000,000")).toBe(1000000);
  });

  it("removes spaces", () => {
    expect(parseCurrencyInput("1 000")).toBe(1000);
    expect(parseCurrencyInput("₪ 1,000")).toBe(1000);
  });

  it("handles combinations of symbols and separators", () => {
    expect(parseCurrencyInput("₪1,234,567.89")).toBe(1234567.89);
  });

  it("returns 0 for invalid input", () => {
    expect(parseCurrencyInput("")).toBe(0);
    expect(parseCurrencyInput("abc")).toBe(0);
    expect(parseCurrencyInput("₪abc")).toBe(0);
  });
});

describe("parsePercentInput", () => {
  it("parses plain numbers as decimal", () => {
    expect(parsePercentInput("5")).toBe(0.05);
    expect(parsePercentInput("10")).toBe(0.1);
    expect(parsePercentInput("50")).toBe(0.5);
  });

  it("removes percent symbol", () => {
    expect(parsePercentInput("5%")).toBe(0.05);
    expect(parsePercentInput("10%")).toBe(0.1);
  });

  it("removes spaces", () => {
    expect(parsePercentInput("5 %")).toBe(0.05);
    expect(parsePercentInput("5 % ")).toBe(0.05);
  });

  it("handles decimal percentages", () => {
    expect(parsePercentInput("5.5")).toBe(0.055);
    expect(parsePercentInput("5.5%")).toBe(0.055);
  });

  it("returns 0 for invalid input", () => {
    expect(parsePercentInput("")).toBe(0);
    expect(parsePercentInput("abc")).toBe(0);
    expect(parsePercentInput("%")).toBe(0);
  });
});

describe("downloadJson", () => {
  it("is a function that exists", () => {
    expect(typeof downloadJson).toBe("function");
  });

  // Note: Full testing of downloadJson requires DOM mocking which is complex
  // The function is tested manually in the browser
});

describe("uploadJson", () => {
  it("is a function that exists", () => {
    expect(typeof uploadJson).toBe("function");
  });

  // Note: FileReader is a browser API not available in Node environment
  // These tests would require jsdom environment or proper mocking
  // The function is tested manually in the browser
});

describe("getCurrentTimestamp", () => {
  it("returns an ISO string", () => {
    const timestamp = getCurrentTimestamp();
    expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("returns current time", () => {
    const before = new Date();
    const timestamp = getCurrentTimestamp();
    const after = new Date();

    const timestampDate = new Date(timestamp);
    expect(timestampDate.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(timestampDate.getTime()).toBeLessThanOrEqual(after.getTime());
  });
});
