// Utility functions

import type { Track, TrackExportSchema } from './types';
import { clampRate, totalExitCost, computeAccruedDailyInterest } from './mortgage-math';


export function generateId(): string {

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function formatCurrency(value: number): string {
  if (value === 0 || !Number.isFinite(value)) return '₪0';
  return new Intl.NumberFormat('en-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a currency value with a configurable number of decimal places (Agorot
 * precision). Used for figures like accrued daily interest where sub-shekel
 * precision matters (e.g. +₪3,078.25). `decimals` defaults to 2.
 */
export function formatCurrencyPrecision(value: number, decimals = 2): string {
  if (value === 0 || !Number.isFinite(value)) return '₪0';
  return new Intl.NumberFormat('en-IL', {
    style: 'currency',
    currency: 'ILS',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}


export function formatPercent(value: number): string {
  if (!Number.isFinite(value)) return '0%';
  return new Intl.NumberFormat('en-IL', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return '0';
  return new Intl.NumberFormat('en-IL').format(value);
}

export function parseCurrencyInput(value: string): number {
  // Remove currency symbols, spaces, and commas, then parse
  const cleaned = value.replace(/[₪\s,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed;
}

export function parsePercentInput(value: string): number {
  // Remove % and spaces, then parse as decimal
  const cleaned = value.replace(/[%\s]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? 0 : parsed / 100;
}

export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sanitize a user-supplied filename for a "Save As" download. Strips path
 * separators and other characters that are invalid in filenames, trims
 * whitespace, and guarantees a `.json` extension. Falls back to `fallback`
 * (defaulting to a timestamped name) when the result would be empty.
 */
export function sanitizeFilename(input: string, fallback?: string): string {
  const cleaned = (input || '')
    .replace(/[\\/:*?"<>|]/g, '-') // replace path-invalid chars with '-'
    .replace(/\s+/g, ' ') // collapse whitespace
    .trim();

  // Fall back when the result is empty or contains no meaningful (alphanumeric)
  // characters — e.g. input was only whitespace or only invalid characters.
  let name = /[a-z0-9]/i.test(cleaned) ? cleaned : '';
  if (!name) {
    name = fallback || `mashkanta-profile-${new Date().toISOString().split('T')[0]}`;
  }
  // Guarantee a .json extension (avoid double extensions like .json.json).
  if (!/\.json$/i.test(name)) {
    name = `${name}.json`;
  }
  return name;
}



export async function uploadJson(file: File): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const parsed = JSON.parse(content);
        resolve(parsed);
      } catch (error) {
        reject(new Error('Invalid JSON file'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}

export function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Serialize a track into the clean JSON export schema (TrackExportSchema).
 *
 * The export isolates the pure amortized principal from the daily accrued
 * interest, and separates the early-payoff fee into its distinct line items per
 * Bank of Israel terminology. Rates are clamped to 6 decimal places so the
 * exported file is clean and round-trip stable (no floating-point artifacts).
 *
 * The `net_principal_balance` is the amortized principal owed today (before
 * accrued daily interest); `accrued_daily_interest` is the interest accrued
 * since the last payment date; `total_payoff_balance` is their sum — the figure
 * a bank quotes as the payoff amount.
 */
export function serializeTrackForExport(track: Track): TrackExportSchema {
  const netPrincipalBalance = track.principal_balance;

  // Derive the monthly payment day-of-month from the first payout date (falling
  // back to the start date), matching the amortization clock. The accrued daily
  // interest is computed with fractional-day precision and stored as a float
  // with 2 decimal places (Agorot level).
  const paymentDay = track.first_payout_date
    ? new Date(track.first_payout_date).getDate()
    : track.start_date
      ? new Date(track.start_date).getDate()
      : new Date().getDate();

  // Use the current effective rate (latest rate-history entry for Prime tracks,
  // otherwise the track's annual rate).
  const effectiveRate =
    track.rate_history && track.rate_history.length > 0
      ? track.rate_history[track.rate_history.length - 1].annual_interest_rate
      : track.annual_interest_rate;

  const accruedDailyInterest = computeAccruedDailyInterest(
    netPrincipalBalance,
    effectiveRate,
    paymentDay
  );
  const totalPayoffBalance = netPrincipalBalance + accruedDailyInterest;


  return {
    track_id: track.track_id,
    custom_name: track.custom_name,
    track_type: track.track_type as TrackExportSchema['track_type'],
    net_principal_balance: netPrincipalBalance,
    accrued_daily_interest: accruedDailyInterest,
    total_payoff_balance: totalPayoffBalance,
    annual_interest_rate: clampRate(track.annual_interest_rate),
    remaining_term_months: track.remaining_term_months,
    monthly_repayment: track.monthly_repayment,
    is_payment_manual_override: track.is_payment_manual_override,
    amlat_pearei_ribit: track.amlat_pearei_ribit,
    notice_fee: track.notice_fee,
    operational_fee: track.operational_fee ?? 60,
    total_exit_cost: totalExitCost(track),
    months_to_reset: track.months_to_reset,
    is_cpi_linked: track.is_cpi_linked,
    start_date: track.start_date,
    first_payout_date: track.first_payout_date,
    prime_margin: track.prime_margin,
    rate_history: track.rate_history
      ? track.rate_history.map((entry) => ({
          effective_date: entry.effective_date,
          annual_interest_rate: clampRate(entry.annual_interest_rate),
          is_manual_override: entry.is_manual_override,
        }))
      : undefined,
    original_principal: track.original_principal,
    original_term_months: track.original_term_months,
  };
}

