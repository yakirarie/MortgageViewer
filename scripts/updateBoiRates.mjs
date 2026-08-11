// Server-side script that fetches the Bank of Israel interest-rate Excel sheet,
// parses it, and writes the normalized rate history to `public/data/boiRates.json`.
//
// This runs in CI (see .github/workflows/boi-sync.yml) so the browser never has
// to talk to boi.org.il directly (which is blocked by CORS). The committed JSON
// is then served same-origin to the SPA.
//
// Output schema (matches BoiRateRecord):
//   { "effective_date": "YYYY-MM-DD", "boi_rate": 0.035, "prime_rate": 0.05 }

import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";

const BOI_EXCEL_URL =
  "https://www.boi.org.il/boi_files/Statistics/bointcre_m.xls";
const OUTPUT_PATH = path.join(process.cwd(), "public", "data", "boiRates.json");

/** The constant spread added to the BOI base rate to derive the Prime rate. */
const PRIME_SPREAD = 0.015;

/** Normalize a parsed date value (Date, Excel serial, or string) to YYYY-MM-DD. */
function toIsoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    // YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
    // DD/MM/YYYY or DD.MM.YYYY
    const m = trimmed.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    }
  }
  return null;
}

/** Convert a rate cell (percent string, number, or decimal) to a decimal rate. */
function toDecimalRate(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    // SheetJS may return a percent as a plain number (e.g. 4.5) or a decimal
    // (0.045). Treat values > 1 as percentages.
    return value > 1 ? value / 100 : value;
  }
  if (typeof value === "string") {
    const cleaned = value.replace(/%/g, "").replace(/,/g, ".").trim();
    const num = Number(cleaned);
    if (!Number.isFinite(num)) return null;
    return num > 1 ? num / 100 : num;
  }
  return null;
}

async function run() {
  console.log("Fetching BOI Excel sheet from:", BOI_EXCEL_URL);
  const response = await fetch(BOI_EXCEL_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Excel file: HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const workbook = XLSX.read(new Uint8Array(arrayBuffer), {
    type: "array",
    cellDates: true,
  });

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true });

  const byDate = new Map();

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    // Find the first cell that looks like a date.
    let dateIso = null;
    let dateIdx = -1;
    for (let i = 0; i < row.length; i++) {
      const iso = toIsoDate(row[i]);
      if (iso) {
        dateIso = iso;
        dateIdx = i;
        break;
      }
    }
    if (!dateIso) continue;

    // Find the first numeric rate cell after the date cell.
    let rate = null;
    for (let i = dateIdx + 1; i < row.length; i++) {
      const r = toDecimalRate(row[i]);
      if (r !== null) {
        rate = r;
        break;
      }
    }
    if (rate === null) continue;

    // Keep the first (most recent) occurrence per date.
    if (!byDate.has(dateIso)) {
      byDate.set(dateIso, rate);
    }
  }

  if (byDate.size === 0) {
    throw new Error("No valid date/rate rows found in the Excel sheet.");
  }

  const records = Array.from(byDate.entries())
    .map(([effective_date, boi_rate]) => ({
      effective_date,
      boi_rate,
      prime_rate: Number((boi_rate + PRIME_SPREAD).toFixed(4)),
    }))
    .sort((a, b) => (a.effective_date < b.effective_date ? 1 : -1));

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, JSON.stringify(records, null, 2), "utf-8");

  console.log(
    `Successfully updated ${OUTPUT_PATH} with ${records.length} records.`
  );
  console.log(`Newest: ${records[0].effective_date} @ ${records[0].boi_rate}`);
}

run().catch((err) => {
  console.error("Error updating BOI rates:", err);
  process.exit(1);
});
