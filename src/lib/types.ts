// Types matching PRD §2.2 (field definitions) and §2.3.1 (JSON schema)

export type TrackType =
  | "PRIME"
  | "FIXED_UNLINKED"
  | "FIXED_LINKED"
  | "VARIABLE_5Y"
  | "VARIABLE_5Y_LINKED"
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
  early_exit_penalty: number; // ₪ (Amlat Pirachon)
  notice_fee: number; // ₪ (Amlat Hoda'a Mukdamet)
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
}



export interface GlobalAssumptions {
  reference_market_rate: number; // decimal
  alternative_investment_annual_return: number; // decimal
  prime_rate_current: number; // decimal
}

export interface Profile {
  schema_version: number;
  profile_name: string;
  created_at: string;
  global_assumptions: GlobalAssumptions;
  tracks: Track[];
}

export type PayoffReductionMode = "reduce_term" | "reduce_payment";

export type RecommendedAction =
  | "PAY_OFF_NOW"
  | "WAIT_FOR_RESET"
  | "CONSIDER_REFINANCING"
  | "HOLD";

export interface TrackRecommendation {
  track_id: string;
  action: RecommendedAction;
  driver: string; // human-readable reason
}
