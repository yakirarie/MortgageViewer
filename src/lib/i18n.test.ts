import { describe, it, expect } from "vitest";
import { useTranslation } from "./i18n";

describe("i18n library - static validation", () => {
  it("module can be imported", () => {
    expect(useTranslation).toBeDefined();
    expect(typeof useTranslation).toBe("function");
  });

  // Note: Full i18n testing requires React Testing Library for:
  // - Testing the useTranslation hook behavior
  // - Testing language switching
  // - Testing RTL direction changes
  // - Testing localStorage persistence
  // These would be added in a separate component test suite
});
