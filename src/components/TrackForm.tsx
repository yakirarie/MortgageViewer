import { useEffect, useState } from 'react';
import type { Track, RateHistoryEntry } from '../lib/types';

import { formatCurrency, formatPercent, parseCurrencyInput, parsePercentInput } from '../lib/utils';

import { shouldShowResetWindow, getDefaultCpiLinked, getDefaultRate } from '../lib/validation';
import { TRACK_TYPES } from '../lib/validation';
import { populatePrimeRateHistory, getPrimeBaseRateAt, primeEffectiveRate, getMarketRates } from '../lib/rates-api';

import { simulatePrimeAmortization, simulateFixedAmortization, monthsBetween } from '../lib/mortgage-math';





interface TrackFormProps {
  track: Track;
  onUpdate: (updates: Partial<Track>) => void;
  getFieldError: (field: string) => string | undefined;
}

export function TrackForm({ track, onUpdate, getFieldError }: TrackFormProps) {


  const handleCurrencyBlur = (field: keyof Track, value: string) => {
    const parsed = parseCurrencyInput(value);
    onUpdate({ [field]: parsed });
  };

  const handlePercentBlur = (field: keyof Track, value: string) => {
    const parsed = parsePercentInput(value);
    onUpdate({ [field]: parsed });
  };

  const handleTypeChange = (newType: string) => {
    const updates: Partial<Track> = {
      track_type: newType as any,
      annual_interest_rate: getDefaultRate(newType as any, getMarketRates().prime_rate_current),
      is_cpi_linked: getDefaultCpiLinked(newType as any),
      months_to_reset: shouldShowResetWindow(newType as any) ? 60 : null,
    };
    onUpdate(updates);
  };


  const showResetWindow = shouldShowResetWindow(track.track_type);
  const isPrime = track.track_type === 'PRIME';



  // Local string state so the user can type freely (including '-' and '.')
  // without the controlled input resetting mid-typing.
  const [marginInput, setMarginInput] = useState<string>(
    track.prime_margin !== undefined ? String(track.prime_margin * 100) : ''
  );

  // Keep the local margin string in sync when the track (or its margin) changes
  // externally, e.g. when switching between tracks in the form.
  useEffect(() => {
    setMarginInput(track.prime_margin !== undefined ? String(track.prime_margin * 100) : '');
  }, [track.track_id, track.prime_margin]);

  // Rate history editor is collapsed by default.
  const [showHistory, setShowHistory] = useState(false);

  // -------------------------------------------------------------------------
  // Amortization: derive current balance / remaining term / monthly payment
  // from the original amount + original term + start date + rate.
  // -------------------------------------------------------------------------

  const buildRateHistory = (): RateHistoryEntry[] => {
    if (isPrime) return track.rate_history || [];
    // Non-Prime tracks use a single constant rate from the start date.
    if (track.start_date) {
      return [{ effective_date: track.start_date, annual_interest_rate: track.annual_interest_rate }];
    }
    return [];
  };

  /**
   * The original term in months. When a track was imported without an explicit
   * `original_term_months` (older profiles only stored `remaining_term_months`),
   * derive it as `remaining_term_months + months elapsed since the start date`.
   */
  const getEffectiveOriginalTerm = (): number => {
    if (track.original_term_months && track.original_term_months > 0) {
      return track.original_term_months;
    }
    if (track.start_date && track.remaining_term_months && track.remaining_term_months > 0) {
      return track.remaining_term_months + monthsBetween(new Date(track.start_date), new Date());
    }
    return 0;
  };

  const applyAmortization = (updates: Partial<Track>): Partial<Track> => {
    const originalPrincipal =
      updates.original_principal !== undefined ? updates.original_principal : track.original_principal;
    const originalTerm =
      updates.original_term_months !== undefined && updates.original_term_months > 0
        ? updates.original_term_months
        : getEffectiveOriginalTerm();
    const startDate = updates.start_date !== undefined ? updates.start_date : track.start_date;
    const firstPayoutDate =
      updates.first_payout_date !== undefined
        ? updates.first_payout_date
        : track.first_payout_date;
    const annualRate =
      updates.annual_interest_rate !== undefined ? updates.annual_interest_rate : track.annual_interest_rate;


    let history: RateHistoryEntry[];
    if (isPrime) {
      history = updates.rate_history !== undefined ? updates.rate_history : track.rate_history || [];
    } else {
      history = startDate ? [{ effective_date: startDate, annual_interest_rate: annualRate }] : [];
    }

    if (
      originalPrincipal !== undefined &&
      originalPrincipal > 0 &&
      originalTerm > 0
    ) {
      if (isPrime) {
        // Prime: amortize along the historical BoI rate timeline.
        if (startDate && history.length > 0) {
          const result = simulatePrimeAmortization(
            originalPrincipal,
            startDate,
            originalTerm,
            history,
            firstPayoutDate
          );
          updates.principal_balance = result.currentBalance;
          updates.remaining_term_months = result.remainingTermMonths;
          updates.monthly_repayment = result.currentMonthlyPayment;
          updates.is_payment_manual_override = false;
        }
      } else {
        // All non-Prime tracks (FIXED_UNLINKED, VARIABLE_5Y, FIXED_LINKED,
        // OTHER) amortize at the current block's constant rate over the elapsed
        // months. Runs even without a start date (elapsed = 0 → balance =
        // original, payment = Spitzer at the original principal over the full
        // term). This prevents a Variable 5Y track from falling back to a fresh
        // 360-month loan when it has a start date but no rate history.
        const result = simulateFixedAmortization(
          originalPrincipal,
          startDate || '',
          originalTerm,
          annualRate,
          firstPayoutDate
        );
        updates.principal_balance = result.currentBalance;
        updates.remaining_term_months = result.remainingTermMonths;
        updates.monthly_repayment = result.currentMonthlyPayment;
        updates.is_payment_manual_override = false;
      }
    }
    return updates;
  };




  // Derived values for the read-only "Auto-Calculated" section.
  const derived = (() => {
    const history = buildRateHistory();
    const originalTerm = getEffectiveOriginalTerm();
    if (
      track.original_principal !== undefined &&
      track.original_principal > 0 &&
      originalTerm > 0
    ) {
      if (isPrime) {
        // Prime: amortize along the historical BoI rate timeline (needs a start
        // date + rate history).
        if (track.start_date && history.length > 0) {
          return simulatePrimeAmortization(
            track.original_principal,
            track.start_date,
            originalTerm,
            history,
            track.first_payout_date
          );
        }
      } else {
        // All non-Prime tracks (FIXED_UNLINKED, VARIABLE_5Y, FIXED_LINKED,
        // OTHER) amortize at the current block's constant rate over the elapsed
        // months. Runs even without a start date (elapsed = 0 → balance =
        // original, payment = Spitzer at the original principal over the full
        // term). This prevents a Variable 5Y track from falling back to a fresh
        // 360-month loan when it has a start date but no rate history.
        return simulateFixedAmortization(
          track.original_principal,
          track.start_date || '',
          originalTerm,
          track.annual_interest_rate,
          track.first_payout_date
        );
      }
    }
    return null;
  })();





  const displayNetPrincipal = derived ? derived.netPrincipalBalance : track.principal_balance;
  const displayAccruedInterest = derived ? derived.accruedDailyInterest : 0;
  const displayTotalPayoff = derived ? derived.totalPayoffBalance : track.principal_balance;
  const displayTerm = derived ? derived.remainingTermMonths : track.remaining_term_months;
  const displayPayment = derived ? derived.currentMonthlyPayment : track.monthly_repayment;
  const displayTermYears = Math.round(displayTerm / 12);




  // -------------------------------------------------------------------------
  // Handlers
  // -------------------------------------------------------------------------

  const commitMargin = (value: string) => {
    const parsed = parseFloat(value);
    const margin = isNaN(parsed) ? 0 : parsed / 100;
    const updates: Partial<Track> = { prime_margin: margin };
    if (track.start_date) {
      updates.rate_history = populatePrimeRateHistory(track.start_date, margin);
      updates.annual_interest_rate =
        updates.rate_history.length > 0
          ? updates.rate_history[updates.rate_history.length - 1].annual_interest_rate
          : track.annual_interest_rate;
    }
    onUpdate(applyAmortization(updates));
  };

  const handleMarginChange = (value: string) => {
    if (/^-?\d*\.?\d*$/.test(value)) {
      setMarginInput(value);
    }
  };

  const handleMarginBlur = () => {
    commitMargin(marginInput);
  };

  const handleStartDateChange = (value: string) => {
    const updates: Partial<Track> = { start_date: value };
    if (isPrime && value && track.prime_margin !== undefined) {
      updates.rate_history = populatePrimeRateHistory(value, track.prime_margin);
      updates.annual_interest_rate =
        updates.rate_history.length > 0
          ? updates.rate_history[updates.rate_history.length - 1].annual_interest_rate
          : track.annual_interest_rate;
    }
    onUpdate(applyAmortization(updates));
  };

  const handleHistoryEntryChange = (index: number, rate: number) => {
    const history = (track.rate_history || []).map((entry, i) =>
      i === index ? { ...entry, annual_interest_rate: rate, is_manual_override: true } : entry
    );
    const updates: Partial<Track> = { rate_history: history };
    if (history.length > 0) {
      updates.annual_interest_rate = history[history.length - 1].annual_interest_rate;
    }
    onUpdate(applyAmortization(updates));
  };

  const handleResetHistory = () => {
    if (track.start_date && track.prime_margin !== undefined) {
      const history = populatePrimeRateHistory(track.start_date, track.prime_margin);
      const updates: Partial<Track> = { rate_history: history };
      if (history.length > 0) {
        updates.annual_interest_rate = history[history.length - 1].annual_interest_rate;
      }
      onUpdate(applyAmortization(updates));
    }
  };

  const handleOriginalPrincipalChange = (value: string) => {
    const parsed = parseCurrencyInput(value);
    onUpdate(applyAmortization({ original_principal: parsed }));
  };

  const handleOriginalTermChange = (months: number) => {
    onUpdate(applyAmortization({ original_term_months: months }));
  };

  const handleAnnualRateChange = (value: string) => {
    const parsed = parsePercentInput(value);
    onUpdate(applyAmortization({ annual_interest_rate: parsed }));
  };

  return (


    <div className="space-y-5">

      {/* ============================================================
          Section 1: Track Basics
          ============================================================ */}
      <div className="border-b border-border-subtle pb-4">
        <h4 className="text-sm font-semibold text-text-primary mb-3">Track Basics</h4>

        {/* Track Type */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Track Type
          </label>
          <select
            value={track.track_type}
            onChange={(e) => handleTypeChange(e.target.value)}
            className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info"
          >
            {TRACK_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </div>

        {/* Track Name */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Track Name
          </label>
          <input
            type="text"
            value={track.custom_name}
            onChange={(e) => onUpdate({ custom_name: e.target.value })}
            onBlur={(e) => {
              if (!e.target.value.trim()) {
                onUpdate({ custom_name: 'Track' });
              }
            }}
            className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none ${
              getFieldError('custom_name') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
            }`}
          />
          {getFieldError('custom_name') && (
            <p className="text-accent-danger text-xs mt-1">{getFieldError('custom_name')}</p>
          )}
        </div>

        {/* Start Date */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={track.start_date || ''}
            onChange={(e) => handleStartDateChange(e.target.value)}
            className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info"
          />
          <p className="text-text-secondary text-xs mt-1">
            When the loan was taken out. The tool uses this to build the rate timeline.
          </p>
        </div>

        {/* First Payout Date */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            First Payout Date
            <span className="text-accent-info ml-1 cursor-help" title="When the bank first disbursed the funds. The amortization clock starts here — the first payment is due ~1 month after payout, not at signing.">
              (?)
            </span>
          </label>
          <input
            type="date"
            value={track.first_payout_date || ''}
            onChange={(e) => onUpdate(applyAmortization({ first_payout_date: e.target.value }))}
            className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info"
          />
          <p className="text-text-secondary text-xs mt-1">
            Usually ~1 month after the start date (e.g. signed 13.9.23, first payout 10.10.23). Used to count how much has been paid down.
          </p>
        </div>

        {/* Original Term */}

        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Original Term
          </label>
          <div className="flex gap-2">
            <div className="flex-1">
              <input
                type="number"
                value={track.original_term_months || ''}
                placeholder="360"
                onChange={(e) => handleOriginalTermChange(parseInt(e.target.value) || 0)}
                className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info font-mono text-right font-tabular-nums"
              />
              <span className="text-xs text-text-secondary">months</span>
            </div>
            <div className="flex-1">
              <input
                type="number"
                value={track.original_term_months ? Math.round(track.original_term_months / 12) : ''}
                placeholder="30"
                onChange={(e) => {
                  const years = parseInt(e.target.value) || 0;
                  handleOriginalTermChange(years * 12);
                }}
                className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info font-mono text-right font-tabular-nums"
              />
              <span className="text-xs text-text-secondary">years</span>
            </div>
          </div>
          <p className="text-text-secondary text-xs mt-1">
            The committed term (e.g. 360 months / 30 years).
          </p>
        </div>

        {/* Original Amount */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Original Loan Amount (₪)
          </label>
          <input
            type="text"
            value={track.original_principal !== undefined ? formatCurrency(track.original_principal) : ''}
            placeholder="e.g. 1,000,000"
            onChange={(e) => handleOriginalPrincipalChange(e.target.value)}
            className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info font-mono text-right font-tabular-nums"
          />
          <p className="text-text-secondary text-xs mt-1">
            The amount originally borrowed.
          </p>
        </div>
      </div>

      {/* ============================================================
          Section 2: Rate Configuration
          ============================================================ */}
      <div className="border-b border-border-subtle pb-4">
        <h4 className="text-sm font-semibold text-text-primary mb-3">Rate Configuration</h4>

        {isPrime ? (
          <>
            <p className="text-text-secondary text-xs mb-3">
              Prime Rate = BoI Base Rate + 1.5%. Effective Rate = Prime Rate + Margin. The rate history is auto-populated from Bank of Israel base-rate data.
            </p>

            {/* Prime Margin */}
            <div>
              <label className="block text-sm font-medium text-text-secondary mb-1">
                Margin from Prime (%)
                <span className="text-accent-info ml-1 cursor-help" title="e.g. -0.6 for Prime − 0.6%">
                  (?)
                </span>
              </label>
              <input
                type="text"
                value={marginInput}
                placeholder="e.g. -0.6"
                onChange={(e) => handleMarginChange(e.target.value)}
                onBlur={handleMarginBlur}
                className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info font-mono text-right font-tabular-nums"
              />
              <p className="text-text-secondary text-xs mt-1">
                Negative = below Prime (e.g. Prime − 0.6%), positive = above Prime.
              </p>
            </div>

            {/* Current effective rate (derived, read-only) */}
            {track.start_date && track.prime_margin !== undefined && (
              <div className="mt-3 bg-bg-surface-raised border border-border-subtle rounded p-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-text-secondary">Rate at start ({track.start_date})</span>
                  <span className="font-mono font-tabular-nums text-text-primary">
                    {formatPercent(primeEffectiveRate(getPrimeBaseRateAt(track.start_date), track.prime_margin))}
                  </span>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-text-secondary">Current effective rate</span>
                  <span className="font-mono font-tabular-nums text-text-primary">
                    {formatPercent(track.annual_interest_rate)}
                  </span>
                </div>
              </div>
            )}

            {/* Expandable rate history (hidden by default) */}
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setShowHistory((s) => !s)}
                className="flex items-center gap-1 text-sm text-accent-info hover:text-accent-primary"
              >
                <span className={`inline-block transition-transform ${showHistory ? 'rotate-90' : ''}`}>▶</span>
                Rate History {track.rate_history ? `(${track.rate_history.length} entries)` : ''}
              </button>

              {showHistory && (
                <div className="mt-2">
                  <div className="flex justify-end mb-2">
                    <button
                      type="button"
                      onClick={handleResetHistory}
                      disabled={!track.start_date || track.prime_margin === undefined}
                      className="px-3 py-1 text-xs border border-border-subtle rounded text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Reset all entries to the BoI base-rate timeline"
                    >
                      Reset to BoI
                    </button>
                  </div>
                  {!track.start_date ? (
                    <p className="text-text-secondary text-xs">
                      Set a start date to auto-populate the historical rate timeline.
                    </p>
                  ) : track.rate_history && track.rate_history.length > 0 ? (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {track.rate_history.map((entry, index) => (
                        <div key={entry.effective_date} className="flex items-center gap-2 text-sm">
                          <span className="text-text-secondary w-28 shrink-0">{entry.effective_date}</span>
                          <input
                            type="text"
                            value={formatPercent(entry.annual_interest_rate)}
                            onChange={(e) => {
                              const value = e.target.value.replace(/[^\d.]/g, '');
                              const parsed = value ? parseFloat(value) / 100 : 0;
                              handleHistoryEntryChange(index, parsed);
                            }}
                            className="w-24 bg-bg-surface border border-border-subtle rounded px-2 py-1 text-text-primary focus:outline-none focus:border-accent-info font-mono text-right font-tabular-nums"
                          />
                          {entry.is_manual_override && (
                            <span className="text-accent-warning text-xs" title="Manually adjusted">
                              ●
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-text-secondary text-xs">
                      No history yet — set a margin to populate.
                    </p>
                  )}
                </div>
              )}
            </div>
          </>
        ) : (
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Annual Interest Rate (%)
            </label>
            <input
              type="text"
              value={formatPercent(track.annual_interest_rate)}
              onChange={(e) => {
                const value = e.target.value.replace(/[^\d.]/g, '');
                handleAnnualRateChange(value);
              }}
              onBlur={(e) => handlePercentBlur('annual_interest_rate', e.target.value)}
              className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums ${
                getFieldError('annual_interest_rate') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
              }`}
            />
            {getFieldError('annual_interest_rate') && (
              <p className="text-accent-danger text-xs mt-1">{getFieldError('annual_interest_rate')}</p>
            )}
            {track.annual_interest_rate > 0.08 && (
              <p className="text-accent-warning text-xs mt-1">
                Unusually high rate — double check this value
              </p>
            )}
          </div>
        )}
      </div>

      {/* ============================================================
          Section 3: Auto-Calculated (read-only)
          ============================================================ */}
      <div className="border-b border-border-subtle pb-4">
        <h4 className="text-sm font-semibold text-text-primary mb-3">
          Auto-Calculated
          <span className="text-accent-info ml-1 cursor-help" title="Derived from the original amount, term, start date, and rate.">
            (?)
          </span>
        </h4>

        {/* Net Principal Balance */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Net Principal Balance (₪)
            <span className="text-accent-info ml-1 cursor-help" title="The amortized principal owed today, before accrued daily interest.">
              (?)
            </span>
          </label>
          <div className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right font-tabular-nums opacity-80">
            {formatCurrency(displayNetPrincipal)}
          </div>
        </div>

        {/* Accrued Interest */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Accrued Interest (₪)
            <span className="text-accent-info ml-1 cursor-help" title="Interest accrued daily since the last payment date (ריבית צבורה).">
              (?)
            </span>
          </label>
          <div className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right font-tabular-nums opacity-80">
            +{formatCurrency(displayAccruedInterest)}
          </div>
        </div>

        {/* Total Estimated Payoff */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Total Estimated Payoff (₪)
            <span className="text-accent-info ml-1 cursor-help" title="Net principal + accrued interest. This is the figure a bank quotes as the payoff amount.">
              (?)
            </span>
          </label>
          <div className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right font-tabular-nums opacity-80">
            {formatCurrency(displayTotalPayoff)}
          </div>
        </div>


        {/* Remaining Term */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Remaining Term
          </label>
          <div className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right font-tabular-nums opacity-80">
            {displayTerm} months ({displayTermYears} years)
          </div>
        </div>


        {/* Monthly Payout */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Monthly Payout (₪)
          </label>
          <div className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right font-tabular-nums opacity-80">
            {formatCurrency(displayPayment)}
          </div>
        </div>

        {!derived && (
          <p className="text-accent-warning text-xs mt-2">
            Fill in the original amount, term, start date, and rate to auto-calculate these values.
          </p>
        )}
      </div>


      {/* ============================================================
          Section 4: Bank Terms
          ============================================================ */}
      <div>
        <h4 className="text-sm font-semibold text-text-primary mb-3">Bank Terms</h4>

        {/* Early Exit Penalty */}
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Early Exit Penalty (₪)
            <span className="text-accent-info ml-1 cursor-help" title="Amlat Pirachon — penalty for early payoff">
              (?)
            </span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={formatCurrency(track.early_exit_penalty)}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d]/g, '');
                  onUpdate({ early_exit_penalty: value ? parseFloat(value) : 0 });
                }}
                onBlur={(e) => handleCurrencyBlur('early_exit_penalty', e.target.value)}
                className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums ${
                  getFieldError('early_exit_penalty') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                // Estimate penalty using simplified formula from PRD
                const estimatedPenalty = Math.max(
                  0,
                  displayTotalPayoff *
                    Math.max(0, track.annual_interest_rate - 0.043) *
                    (displayTerm / 12) *
                    0.6
                );

                onUpdate({ early_exit_penalty: estimatedPenalty });
              }}
              className="px-3 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-secondary hover:text-text-primary text-sm"
              title="Estimate penalty using simplified formula"
            >
              Estimate
            </button>
          </div>
          {getFieldError('early_exit_penalty') && (
            <p className="text-accent-danger text-xs mt-1">{getFieldError('early_exit_penalty')}</p>
          )}
          <p className="text-text-secondary text-xs mt-1">
            Estimate only. Your bank's actual penalty uses a regulated formula — request the exact figure from your bank.
          </p>
        </div>

        {/* Notice Fee */}
        <div className="mt-3">
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Notice Fee (₪)
            <span className="text-accent-info ml-1 cursor-help" title="Amlat Hoda'a Mukdamet — fee for advance notice">
              (?)
            </span>
          </label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <input
                type="text"
                value={formatCurrency(track.notice_fee)}
                onChange={(e) => {
                  const value = e.target.value.replace(/[^\d]/g, '');
                  onUpdate({ notice_fee: value ? parseFloat(value) : 0 });
                }}
                onBlur={(e) => handleCurrencyBlur('notice_fee', e.target.value)}
                className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums ${
                  getFieldError('notice_fee') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
                }`}
              />
            </div>
            <button
              type="button"
              onClick={() => {
                onUpdate({ notice_fee: displayTotalPayoff * 0.0015 });
              }}

              className="px-3 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-secondary hover:text-text-primary text-sm"
              title="Recalculate as 0.15% of balance"
            >
              Auto
            </button>
          </div>
          {getFieldError('notice_fee') && (
            <p className="text-accent-danger text-xs mt-1">{getFieldError('notice_fee')}</p>
          )}
        </div>

        {/* Reset Window (conditional) */}
        {showResetWindow && (
          <div className="mt-3">
            <label className="block text-sm font-medium text-text-secondary mb-1">
              Months to Reset
            </label>
            <input
              type="number"
              value={track.months_to_reset || ''}
              onChange={(e) => onUpdate({ months_to_reset: e.target.value ? parseInt(e.target.value) : null })}
              className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums ${
                getFieldError('months_to_reset') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
              }`}
            />
            {getFieldError('months_to_reset') && (
              <p className="text-accent-danger text-xs mt-1">{getFieldError('months_to_reset')}</p>
            )}
          </div>
        )}

        {/* CPI Linked */}
        <div className="mt-3 flex items-center gap-2">
          <input
            type="checkbox"
            id={`cpi-linked-${track.track_id}`}
            checked={track.is_cpi_linked}
            onChange={(e) => onUpdate({ is_cpi_linked: e.target.checked })}
            className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-accent-primary focus:ring-accent-primary"
          />
          <label htmlFor={`cpi-linked-${track.track_id}`} className="text-sm text-text-secondary">
            CPI-Linked
            <span className="text-accent-info ml-1 cursor-help" title="Balance is indexed to inflation">
              (?)
            </span>
          </label>
        </div>
        {track.is_cpi_linked && (
          <p className="text-accent-warning text-xs mt-1">
            CPI-linked — balance shown does not project future indexation
          </p>
        )}
      </div>
    </div>
  );
}
