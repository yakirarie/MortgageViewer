// Types matching PRD §2.2 (field definitions) and §2.3.1 (JSON schema)

export type TrackType =
  | "PRIME"
  | "FIXED_UNLINKED"
  | "FIXED_LINKED"
  | "VARIABLE_5Y"
  | "VARIABLE_5Y_LINKED"
  | "VARIABLE_BOND_UNLINKED"
  | "OTHER";


/**
 * A single point on a track's historical interest-rate timeline.
 * `effective_date` is the ISO date (YYYY-MM-DD) on which the rate takes effect.
 * `is_manual_override` marks entries the user edited by hand (vs. auto-populated
 * from Bank of Israel base-rate data).
 */
export interface RateHistoryEntry {
  effective_date: string; // ISO date, e.g. "2023-01-05"
  annual_interest_rate: number; // decimal, e.g. 0.045 = 4.5%
  is_manual_override?: boolean;
}

export interface Track {
  track_id: string;
  custom_name: string;
  track_type: TrackType;
  principal_balance: number; // ₪
  annual_interest_rate: number; // decimal, e.g. 0.055 = 5.5%
  remaining_term_months: number;
  monthly_repayment: number; // ₪
  is_payment_manual_override: boolean;
  /** Interest gap penalty (Amlat Pe'arei Ribit) in ₪. 0 for Prime tracks. */
  amlat_pearei_ribit: number;
  /** Notice fee (Amlat Hoda'a Mukdamet) in ₪ — raw input from the bank statement. */
  notice_fee: number;
  /** Operational fee (Amlat Hotza'ot Tipuliyot) in ₪ — fixed at 60 per track. */
  operational_fee: number;
  months_to_reset: number | null;
  is_cpi_linked: boolean;

  /** ISO date the track was taken out (used to build the Prime rate timeline). */
  start_date?: string;
  /**
   * ISO date the bank first disbursed the loan funds. The amortization clock
   * starts here (the first payment is due ~1 month after payout), not at the
   * signing date. Falls back to `start_date` when omitted.
   */
  first_payout_date?: string;
  /** Prime spread/margin as a decimal, e.g. -0.006 for "Prime − 0.6%". */
  prime_margin?: number;

  /** Auto-populated historical effective-rate timeline (Prime tracks). */
  rate_history?: RateHistoryEntry[];
  /** Original loan amount (₪) at origination — used to derive the current balance. */
  original_principal?: number;
  /** Original committed term in months (e.g. 360 for 30 years). */
  original_term_months?: number;
  /**
   * Optional manual override for the BOI benchmark market rate (decimal, e.g.
   * 0.0433 for 4.33%) used in the interest-gap penalty (Amlat Pa'arei Ribit).
   * When present, the penalty engine uses this user-supplied rate instead of
   * looking up the default tier table — for cases where the bank quotes a
   * specific benchmark (e.g. a bond-anchored variable track, משתנה עוגן אג"ח).
   */
  boiBenchmarkRateOverride?: number;
}




/**
 * The JSON serialization schema for a single track on export. Cleanly isolates
 * the pure amortized principal from the daily accrued interest, and separates
 * the early-payoff fee into its distinct line items per Bank of Israel
 * terminology. Rates are clamped to 6 decimal places to avoid floating-point
 * artifacts (e.g. 0.049800000000000004 → 0.0498).
 */
export interface TrackExportSchema {
  track_id: string;
  custom_name: string;
  track_type: 'PRIME' | 'FIXED_UNLINKED' | 'VARIABLE_5Y' | 'VARIABLE_5Y_LINKED' | 'VARIABLE_BOND_UNLINKED' | 'FIXED_LINKED';

  /** Pure amortized principal (₪), before accrued daily interest. */
  net_principal_balance: number;
  /** Accrued daily interest since the last payment date (₪). */
  accrued_daily_interest: number;
  /** net_principal_balance + accrued_daily_interest (₪). */
  total_payoff_balance: number;
  /** Clamped float (decimal, e.g. 0.0498). */
  annual_interest_rate: number;
  remaining_term_months: number;
  monthly_repayment: number;
  /** True only when the user explicitly typed a custom payment. */
  is_payment_manual_override: boolean;
  /** Interest gap penalty (Amlat Pe'arei Ribit) in ₪ (0 for Prime). */
  amlat_pearei_ribit: number;
  /** Notice fee (Amlat Hoda'a Mukdamet) in ₪ — raw input from the bank. */
  notice_fee: number;
  /** Operational fee (Amlat Hotza'ot Tipuliyot) in ₪ — fixed at 60. */
  operational_fee: number;
  /** Total early exit cost = amlat_pearei_ribit + notice_fee + operational_fee. */
  total_exit_cost: number;
  months_to_reset: number | null;
  is_cpi_linked: boolean;
  start_date?: string;
  first_payout_date?: string;
  prime_margin?: number;
  rate_history?: RateHistoryEntry[];
  original_principal?: number;
  original_term_months?: number;
}

export interface Profile {
  schema_version: number;
  profile_name: string;
  created_at: string;
  tracks: Track[];
}



export type PayoffReductionMode = "reduce_term" | "reduce_payment";

export type RecommendedAction =
  | "PAY_OFF_NOW"
  | "WAIT_FOR_RESET"
  | "HOLD";


export interface TrackRecommendation {
  track_id: string;
  action: RecommendedAction;
  driver: string; // human-readable reason
}
