// Types matching PRD §2.2 (field definitions) and §2.3.1 (JSON schema)

export type TrackType =
  | "PRIME"
  | "FIXED_UNLINKED"
  | "FIXED_LINKED"
  | "VARIABLE_5Y"
  | "VARIABLE_5Y_LINKED"
  | "OTHER";

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
