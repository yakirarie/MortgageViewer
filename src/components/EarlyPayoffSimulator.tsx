import { useState, useEffect, useMemo } from 'react';
import type { Profile, PayoffReductionMode } from '../lib/types';
import {
  recalculateTrack,
  getOptimalAllocation,
  computePayoffSummary,
} from '../engine/earlyPayoff';
import { applyEarlyPayoffToProfile } from '../engine/applyEarlyPayoff';
import { liveTrackBalance } from '../lib/mortgage-math';
import { formatCurrency } from '../lib/utils';



interface EarlyPayoffSimulatorProps {
  t: any;
  profile: Profile;
  onUpdateProfile: (profile: Profile) => void;
}

export function EarlyPayoffSimulator({ t, profile, onUpdateProfile }: EarlyPayoffSimulatorProps) {

  const [lumpSum, setLumpSum] = useState<number>(100000);
  const [mode, setMode] = useState<PayoffReductionMode>('reduce_term');
  const [hasAdvanceNotice, setHasAdvanceNotice] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // Initialize allocations to an equal share of the lump sum, clamped to each
  // track's live balance.
  useEffect(() => {
    if (profile.tracks.length === 0) {
      setAllocations({});
      return;
    }
    const equalShare = lumpSum / profile.tracks.length;
    const next: Record<string, number> = {};
    profile.tracks.forEach((track) => {
      next[track.track_id] = Math.min(equalShare, liveTrackBalance(track));
    });
    setAllocations(next);
  }, [profile.tracks, lumpSum]);

  const totalAllocated = Object.values(allocations).reduce((s, v) => s + v, 0);
  const remainingToAllocate = Math.max(0, lumpSum - totalAllocated);

  // Dynamic slider max bounds: max_i = min(B_i, lumpSum − Σ_{j≠i} A_j).
  const sliderMax = (trackId: string): number => {
    const balance = liveTrackBalance(profile.tracks.find((tr) => tr.track_id === trackId) as any);
    const others = Object.entries(allocations)
      .filter(([id]) => id !== trackId)
      .reduce((s, [, v]) => s + v, 0);
    return Math.max(0, Math.min(balance, lumpSum - others));
  };

  const handleAllocationChange = (trackId: string, value: number) => {
    const track = profile.tracks.find((tr) => tr.track_id === trackId);
    const balance = track ? liveTrackBalance(track) : 0;
    const clamped = Math.max(0, Math.min(value, balance));
    setAllocations((prev) => ({ ...prev, [trackId]: clamped }));
  };

  const handleSuggestOptimal = () => {
    const results = getOptimalAllocation(profile.tracks, lumpSum, mode, hasAdvanceNotice);
    const next: Record<string, number> = {};
    results.forEach((r) => {
      next[r.track_id] = r.allocated;
    });
    setAllocations(next);
  };

  // Per-track results.
  const trackResults = useMemo(
    () =>
      profile.tracks.map((track) => {
        const allocated = allocations[track.track_id] || 0;
        const result = recalculateTrack(track, allocated, { mode, hasAdvanceNotice });
        return { track, allocated, result };
      }),
    [profile.tracks, allocations, mode, hasAdvanceNotice]
  );

  const summary = useMemo(
    () => computePayoffSummary(profile.tracks, allocations, mode, hasAdvanceNotice),
    [profile.tracks, allocations, mode, hasAdvanceNotice]
  );

  // Commit the current allocation to the active profile after confirmation.
  const handleApplyPayoff = () => {
    if (totalAllocated === 0) return;

    const confirmText =
      `Are you sure you want to apply a ₪${totalAllocated.toLocaleString()} early payoff to your active mortgage profile?\n\n` +
      `This will permanently update your track balances and ${
        mode === 'reduce_payment' ? 'monthly payments' : 'remaining terms'
      }.`;

    if (window.confirm(confirmText)) {
      const executionResults = trackResults
        .filter(({ allocated }) => allocated > 0)
        .map(({ track, allocated, result }) => ({
          trackId: track.track_id,
          allocatedAmount: allocated,
          newBalance: result.newBalance,
          newMonthlyPayment: result.newMonthlyPayment,
          newTermMonths: result.newRemainingMonths,
        }));


      const updatedProfile = applyEarlyPayoffToProfile(
        profile,
        allocations,
        mode,
        executionResults
      );

      onUpdateProfile(updatedProfile);

      // Reset simulator inputs to a fresh equal-share allocation.
      const equalShare = lumpSum / updatedProfile.tracks.length;
      const next: Record<string, number> = {};
      updatedProfile.tracks.forEach((track) => {
        next[track.track_id] = Math.min(equalShare, liveTrackBalance(track));
      });
      setAllocations(next);
    }
  };


  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">{t.payoff.title}</h2>

      {/* Input Controls */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex items-center gap-3">
            <label className="text-text-primary font-medium">{t.payoff.availableLumpSum}</label>
            <input
              type="text"
              value={formatCurrency(lumpSum)}
              onChange={(e) => {
                const value = parseFloat(e.target.value.replace(/[^\d]/g, '')) || 0;
                setLumpSum(value);
              }}
              className="w-48 bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right focus:outline-none focus:border-accent-info"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="text-sm text-text-secondary">{t.payoff.mode}</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as PayoffReductionMode)}
              className="bg-bg-surface border border-border-subtle rounded px-2 py-1 text-text-primary text-sm focus:outline-none focus:border-accent-info"
            >
              <option value="reduce_term">{t.payoff.reduceTerm}</option>
              <option value="reduce_payment">{t.payoff.reducePayment}</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="ep-notice-waived"
              checked={hasAdvanceNotice}
              onChange={(e) => setHasAdvanceNotice(e.target.checked)}
              className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-accent-primary focus:ring-accent-primary"
            />
            <label htmlFor="ep-notice-waived" className="text-sm text-text-secondary">
              {t.payoff.noticeWaived}
            </label>
          </div>

          <button
            onClick={handleSuggestOptimal}
            className="px-4 py-2 bg-accent-info text-bg-primary rounded text-sm font-medium hover:opacity-90"
            title={t.payoff.suggestOptimalTooltip}
          >
            {t.payoff.suggestOptimalAllocation}
          </button>
        </div>
      </div>

      {/* Allocation Sliders */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.payoff.allocation}</h3>
        <div className="space-y-4">
          {profile.tracks.map((track) => {
            const allocated = allocations[track.track_id] || 0;
            const max = sliderMax(track.track_id);
            return (
              <div key={track.track_id} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">{track.custom_name}</span>
                  <span className="text-text-secondary text-sm">
                    {t.payoff.max} {formatCurrency(max)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, max)}
                    step={1000}
                    value={Math.min(allocated, max)}
                    onChange={(e) => handleAllocationChange(track.track_id, parseFloat(e.target.value))}
                    className="flex-1"
                  />
                  <input
                    type="text"
                    value={formatCurrency(allocated)}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value.replace(/[^\d]/g, '')) || 0;
                      handleAllocationChange(track.track_id, value);
                    }}
                    className="w-32 bg-bg-surface border border-border-subtle rounded px-2 py-1 text-text-primary font-mono text-right text-sm focus:outline-none focus:border-accent-info"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">{t.payoff.totalAllocated}</span>
            <span className={`font-mono ${remainingToAllocate > 0 ? 'text-accent-warning' : 'text-accent-primary'}`}>
              {formatCurrency(totalAllocated)} / {formatCurrency(lumpSum)}
            </span>
          </div>
          {remainingToAllocate > 0 && (
            <div className="text-accent-warning text-sm mt-1">
              {formatCurrency(remainingToAllocate)} {t.payoff.remainingToAllocate}
            </div>
          )}
        </div>
      </div>

      {/* Results by Track */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.payoff.resultsByTrack}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-text-secondary border-b border-border-subtle">
                <th className="text-left py-2 pr-4 font-medium">{t.portfolio.name}</th>
                <th className="text-right py-2 px-4 font-medium">{t.portfolio.balance}</th>
                <th className="text-right py-2 px-4 font-medium">{t.payoff.allocated}</th>
                <th className="text-right py-2 px-4 font-medium">{t.payoff.penaltyFees}</th>
                <th className="text-right py-2 px-4 font-medium">
                  {mode === 'reduce_payment' ? t.payoff.newMonthlyPayment : t.payoff.newTerm}
                </th>
                <th className="text-right py-2 px-4 font-medium">{t.payoff.interestSaved}</th>
                <th className="text-right py-2 px-4 font-medium">{t.payoff.netBenefit}</th>
              </tr>
            </thead>
            <tbody>
              {trackResults.map(({ track, allocated, result }) => (
                <tr key={track.track_id} className="border-b border-border-subtle last:border-0">
                  <td className="py-2 pr-4 text-text-primary">{track.custom_name}</td>
                  <td className="py-2 px-4 text-right font-mono text-text-secondary">
                    {formatCurrency(liveTrackBalance(track))}
                  </td>
                  <td className="py-2 px-4 text-right font-mono">{formatCurrency(allocated)}</td>
                  <td className="py-2 px-4 text-right font-mono text-accent-danger">
                    {formatCurrency(result.penalty + result.noticeFee + result.operationalFee)}
                  </td>

                  <td className="py-2 px-4 text-right font-mono">
                    {mode === 'reduce_payment'
                      ? formatCurrency(result.newMonthlyPayment)
                      : `${Math.ceil(result.newRemainingMonths)} ${t.common.months}`}
                  </td>

                  <td className="py-2 px-4 text-right font-mono text-accent-primary">
                    {formatCurrency(result.interestSaved)}
                  </td>
                  <td className={`py-2 px-4 text-right font-mono ${result.netBenefit > 0 ? 'text-accent-primary' : 'text-accent-danger'}`}>
                    {formatCurrency(result.netBenefit)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Apply to Active Profile */}
        <div className="mt-4 pt-4 border-t border-border-subtle flex items-center justify-between gap-4">
          <p className="text-sm text-text-secondary">
            {t.payoff.applyToProfileHint}
          </p>
          <button
            onClick={handleApplyPayoff}
            disabled={totalAllocated === 0}
            className="px-4 py-2 bg-accent-primary text-bg-primary rounded text-sm font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed"
            title={totalAllocated === 0 ? t.payoff.applyToProfileDisabledTooltip : t.payoff.applyToProfileTooltip}
          >
            {t.payoff.applyToProfile}
          </button>
        </div>
      </div>

      {/* Payoff Diagnostics Summary Cards */}

      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.payoff.payoffDiagnostics}</h3>
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-bg-surface border border-border-subtle rounded p-4">
            <div className="text-text-secondary mb-2">{t.payoff.totalPayoffOutlay}</div>
            <div className="text-2xl font-mono text-accent-danger">{formatCurrency(summary.totalPayoffOutlay)}</div>
          </div>
          <div className="bg-bg-surface border border-border-subtle rounded p-4">
            <div className="text-text-secondary mb-2">{t.payoff.guaranteedInterestSaved}</div>
            <div className="text-2xl font-mono text-accent-primary">{formatCurrency(summary.guaranteedInterestSaved)}</div>
          </div>
          <div className="bg-bg-surface border border-border-subtle rounded p-4">
            <div className="text-text-secondary mb-2">{t.payoff.monthlyCashflowRelief}</div>
            <div className="text-2xl font-mono text-accent-primary">{formatCurrency(summary.monthlyCashflowRelief)}</div>
          </div>
          <div className="bg-bg-surface border border-border-subtle rounded p-4">
            <div className="text-text-secondary mb-2">{t.payoff.netBenefit}</div>
            <div className={`text-2xl font-mono ${summary.netBenefit > 0 ? 'text-accent-primary' : 'text-accent-danger'}`}>
              {formatCurrency(summary.netBenefit)}
            </div>
          </div>
        </div>

        <div className="bg-bg-surface border border-border-subtle rounded p-4 text-sm text-text-secondary mt-6">
          <p className="mb-2">
            <strong>{t.payoff.disclaimer}</strong> {t.payoff.disclaimerText}
          </p>
          {hasAdvanceNotice && <p className="text-accent-info">{t.payoff.noticeWaivedNote}</p>}
        </div>
      </div>
    </div>
  );
}
