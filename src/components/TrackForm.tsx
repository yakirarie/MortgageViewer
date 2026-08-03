import type { Track } from '../lib/types';
import { formatCurrency, formatPercent, parseCurrencyInput, parsePercentInput } from '../lib/utils';
import { shouldShowResetWindow, getDefaultCpiLinked, getDefaultRate } from '../lib/validation';
import { TRACK_TYPES } from '../lib/validation';

interface TrackFormProps {
  track: Track;
  onUpdate: (updates: Partial<Track>) => void;
  onRecalculatePayment: () => void;
  getFieldError: (field: string) => string | undefined;
  primeRate?: number;
}

export function TrackForm({ track, onUpdate, onRecalculatePayment, getFieldError, primeRate = 0.06 }: TrackFormProps) {
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
      annual_interest_rate: getDefaultRate(newType as any, primeRate),
      is_cpi_linked: getDefaultCpiLinked(newType as any),
      months_to_reset: shouldShowResetWindow(newType as any) ? 60 : null,
    };
    onUpdate(updates);
  };

  const termYears = Math.round(track.remaining_term_months / 12);
  const handleTermYearsChange = (years: string) => {
    const parsed = parseInt(years, 10);
    if (!isNaN(parsed)) {
      onUpdate({ remaining_term_months: parsed * 12 });
    }
  };

  const showResetWindow = shouldShowResetWindow(track.track_type);

  return (
    <div className="space-y-4">
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

      {/* Custom Name */}
      <div>
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

      {/* Principal Balance */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Principal Balance (₪)
        </label>
        <div className="relative">
          <input
            type="text"
            value={formatCurrency(track.principal_balance)}
            onChange={(e) => {
              // Allow editing while typing, but format on blur
              const value = e.target.value.replace(/[^\d]/g, '');
              onUpdate({ principal_balance: value ? parseFloat(value) : 0 });
            }}
            onBlur={(e) => handleCurrencyBlur('principal_balance', e.target.value)}
              className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums transition-colors-fast ${
                getFieldError('principal_balance') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
              }`}
          />
        </div>
        {getFieldError('principal_balance') && (
          <p className="text-accent-danger text-xs mt-1">{getFieldError('principal_balance')}</p>
        )}
        {track.principal_balance === 0 && (
          <p className="text-accent-warning text-xs mt-1">
            This track has no balance — did you mean to delete it?
          </p>
        )}
      </div>

      {/* Annual Interest Rate */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Annual Interest Rate (%)
        </label>
        <div className="relative">
          <input
            type="text"
            value={formatPercent(track.annual_interest_rate)}
            onChange={(e) => {
              const value = e.target.value.replace(/[^\d.]/g, '');
              onUpdate({ annual_interest_rate: value ? parseFloat(value) / 100 : 0 });
            }}
            onBlur={(e) => handlePercentBlur('annual_interest_rate', e.target.value)}
            className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums transition-colors-fast transition-colors-fast transition-colors-fast ${
              getFieldError('annual_interest_rate') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
            }`}
          />
        </div>
        {getFieldError('annual_interest_rate') && (
          <p className="text-accent-danger text-xs mt-1">{getFieldError('annual_interest_rate')}</p>
        )}
        {track.annual_interest_rate > 0.08 && (
          <p className="text-accent-warning text-xs mt-1">
            Unusually high rate — double check this value
          </p>
        )}
      </div>

      {/* Remaining Term */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Remaining Term
        </label>
        <div className="flex gap-2">
          <div className="flex-1">
            <input
              type="number"
              value={track.remaining_term_months}
              onChange={(e) => onUpdate({ remaining_term_months: parseInt(e.target.value) || 0 })}
              onBlur={(e) => {
                const value = parseInt(e.target.value) || 0;
                if (value < 1 || value > 360) {
                  onUpdate({ remaining_term_months: Math.max(1, Math.min(360, value)) });
                }
              }}
              className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums transition-colors-fast transition-colors-fast ${
                getFieldError('remaining_term_months') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
              }`}
            />
            <span className="text-xs text-text-secondary">months</span>
          </div>
          <div className="flex-1">
            <input
              type="number"
              value={termYears}
              onChange={(e) => handleTermYearsChange(e.target.value)}
              className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info font-mono text-right font-tabular-nums"
            />
            <span className="text-xs text-text-secondary">years</span>
          </div>
        </div>
        {getFieldError('remaining_term_months') && (
          <p className="text-accent-danger text-xs mt-1">{getFieldError('remaining_term_months')}</p>
        )}
      </div>

      {/* Monthly Repayment */}
      <div>
        <label className="block text-sm font-medium text-text-secondary mb-1">
          Monthly Repayment (₪)
        </label>
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={formatCurrency(track.monthly_repayment)}
              onChange={(e) => {
                const value = e.target.value.replace(/[^\d]/g, '');
                onUpdate({ monthly_repayment: value ? parseFloat(value) : 0 });
              }}
              onBlur={(e) => handleCurrencyBlur('monthly_repayment', e.target.value)}
              className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums transition-colors-fast transition-colors-fast ${
                getFieldError('monthly_repayment') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={onRecalculatePayment}
            className="px-3 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-secondary hover:text-text-primary text-sm"
            title="Recalculate using Spitzer formula"
          >
            Auto
          </button>
        </div>
        {getFieldError('monthly_repayment') && (
          <p className="text-accent-danger text-xs mt-1">{getFieldError('monthly_repayment')}</p>
        )}
        {track.is_payment_manual_override && (
          <p className="text-accent-info text-xs mt-1">
            Manual override active — click "Auto" to recalculate
          </p>
        )}
      </div>

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
              className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums transition-colors-fast transition-colors-fast ${
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
                track.principal_balance *
                  Math.max(0, track.annual_interest_rate - 0.043) *
                  (track.remaining_term_months / 12) *
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
      <div>
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
              className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums transition-colors-fast transition-colors-fast ${
                getFieldError('notice_fee') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
              }`}
            />
          </div>
          <button
            type="button"
            onClick={() => {
              onUpdate({ notice_fee: track.principal_balance * 0.0015 });
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
        <div>
          <label className="block text-sm font-medium text-text-secondary mb-1">
            Months to Reset
          </label>
          <input
            type="number"
            value={track.months_to_reset || ''}
            onChange={(e) => onUpdate({ months_to_reset: e.target.value ? parseInt(e.target.value) : null })}
            className={`w-full bg-bg-surface border rounded px-3 py-2 text-text-primary focus:outline-none font-mono text-right font-tabular-nums transition-colors-fast transition-colors-fast ${
              getFieldError('months_to_reset') ? 'border-accent-danger' : 'border-border-subtle focus:border-accent-info'
            }`}
          />
          {getFieldError('months_to_reset') && (
            <p className="text-accent-danger text-xs mt-1">{getFieldError('months_to_reset')}</p>
          )}
        </div>
      )}

      {/* CPI Linked */}
      <div className="flex items-center gap-2">
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
        <p className="text-accent-warning text-xs">
          CPI-linked — balance shown does not project future indexation
        </p>
      )}
    </div>
  );
}
