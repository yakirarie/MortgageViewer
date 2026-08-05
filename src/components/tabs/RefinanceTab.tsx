import { useState } from 'react';
import type { Profile } from '../../lib/types';
import { refinancingBreakeven, effectiveMonthlyPayment } from '../../lib/mortgage-math';
import { formatCurrency, formatPercent } from '../../lib/utils';

interface RefinanceTabProps {
  t: any;
  profile: Profile;
}

export function RefinanceTab({ t, profile }: RefinanceTabProps) {
  const [selectedTrackIds, setSelectedTrackIds] = useState<string[]>([]);
  const [newRate, setNewRate] = useState<number>(0.04);
  const [newTerm, setNewTerm] = useState<number>(180);
  const [otherFees, setOtherFees] = useState<number>(0);

  const handleTrackToggle = (trackId: string) => {
    setSelectedTrackIds((prev) =>
      prev.includes(trackId) ? prev.filter((id) => id !== trackId) : [...prev, trackId]
    );
  };

  const selectedTracks = profile.tracks.filter((t) => selectedTrackIds.includes(t.track_id));

  // Calculate switching costs
  const totalPenalty = selectedTracks.reduce((sum, t) => sum + t.early_exit_penalty, 0);
  const totalNoticeFees = selectedTracks.reduce((sum, t) => sum + t.notice_fee, 0);
  const totalSwitchingCosts = totalPenalty + totalNoticeFees + otherFees;

  // Calculate old blended payment
  const oldBlendedPayment = selectedTracks.reduce((sum, t) => sum + effectiveMonthlyPayment(t), 0);

  // Calculate new payment (simplified - same structure, new rate)
  const totalBalance = selectedTracks.reduce((sum, t) => sum + t.principal_balance, 0);
  const newMonthlyRate = newRate / 12;
  const newBlendedPayment = totalBalance > 0 && newTerm > 0
    ? (totalBalance * newMonthlyRate * Math.pow(1 + newMonthlyRate, newTerm)) / (Math.pow(1 + newMonthlyRate, newTerm) - 1)
    : 0;

  // Calculate breakeven
  const refinanceResult = refinancingBreakeven({
    oldMonthlyRepayment: oldBlendedPayment,
    newMonthlyRepayment: newBlendedPayment,
    totalSwitchingCosts,
    oldTermRemainingMonths: Math.max(...selectedTracks.map(t => t.remaining_term_months)),
    newTermMonths: newTerm,
  });

  // Sensitivity analysis
  const sensitivityRates = [newRate - 0.005, newRate - 0.0025, newRate, newRate + 0.0025, newRate + 0.005];
  const sensitivityResults = sensitivityRates.map((rate) => {
    const monthlyRate = rate / 12;
    const newPayment = totalBalance > 0 && newTerm > 0
      ? (totalBalance * monthlyRate * Math.pow(1 + monthlyRate, newTerm)) / (Math.pow(1 + monthlyRate, newTerm) - 1)
      : 0;
    
    const result = refinancingBreakeven({
      oldMonthlyRepayment: oldBlendedPayment,
      newMonthlyRepayment: newPayment,
      totalSwitchingCosts,
      oldTermRemainingMonths: Math.max(...selectedTracks.map(t => t.remaining_term_months)),
      newTermMonths: newTerm,
    });
    
    return { rate, result };
  });

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">{t.refinance.title}</h2>

      {/* Track Selection */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.refinance.selectTracks}</h3>
        <div className="space-y-2">
          {profile.tracks.map((track) => (
            <label key={track.track_id} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={selectedTrackIds.includes(track.track_id)}
                onChange={() => handleTrackToggle(track.track_id)}
                className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-accent-primary focus:ring-accent-primary"
              />
              <span className="text-text-primary">{track.custom_name}</span>
              <span className="text-text-secondary text-sm">
                ({formatCurrency(track.principal_balance)} @ {formatPercent(track.annual_interest_rate)})
              </span>
            </label>
          ))}
        </div>
      </div>

      {/* New Offer Inputs */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.refinance.newOfferDetails}</h3>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.refinance.newRate}</label>
            <input
              type="text"
              value={formatPercent(newRate)}
              onChange={(e) => {
                const value = parseFloat(e.target.value.replace('%', '')) / 100 || 0;
                setNewRate(value);
              }}
              className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right focus:outline-none focus:border-accent-info"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.refinance.newTerm}</label>
            <input
              type="number"
              value={newTerm}
              onChange={(e) => setNewTerm(parseInt(e.target.value) || 0)}
              className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right focus:outline-none focus:border-accent-info"
            />
          </div>
          <div>
            <label className="block text-sm text-text-secondary mb-1">{t.refinance.otherFees}</label>
            <input
              type="text"
              value={formatCurrency(otherFees)}
              onChange={(e) => {
                const value = parseFloat(e.target.value.replace(/[^\d]/g, '')) || 0;
                setOtherFees(value);
              }}
              className="w-full bg-bg-surface border border-border-subtle rounded px-3 py-2 text-text-primary font-mono text-right focus:outline-none focus:border-accent-info"
            />
          </div>
        </div>
      </div>

      {/* Results */}
      {selectedTracks.length > 0 && (
        <>
          <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t.refinance.refinancingAnalysis}</h3>
            
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-bg-surface border border-border-subtle rounded p-4">
                <div className="text-text-secondary mb-2">{t.refinance.oldMonthlyPayment}</div>
                <div className="text-2xl font-mono text-text-primary">{formatCurrency(oldBlendedPayment)}</div>
              </div>
              <div className="bg-bg-surface border border-border-subtle rounded p-4">
                <div className="text-text-secondary mb-2">{t.refinance.newMonthlyPayment}</div>
                <div className="text-2xl font-mono text-text-primary">{formatCurrency(newBlendedPayment)}</div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">{t.refinance.monthlySavings}</span>
                <span className={`font-mono ${refinanceResult.deltaMonthlyRepayment > 0 ? 'text-accent-primary' : 'text-accent-danger'}`}>
                  {formatCurrency(refinanceResult.deltaMonthlyRepayment)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">{t.refinance.totalSwitchingCosts}</span>
                <span className="font-mono text-text-secondary">{formatCurrency(totalSwitchingCosts)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">{t.refinance.breakevenMonth}</span>
                <span className="font-mono text-text-primary">
                  {refinanceResult.breakevenMonth ? `${Math.round(refinanceResult.breakevenMonth)} ${t.common.months}` : t.refinance.neverBreaksEven}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-text-secondary">{t.refinance.lifetimeNetSavings}</span>
                <span className={`font-mono ${refinanceResult.lifetimeNetSavings > 0 ? 'text-accent-primary' : 'text-accent-danger'}`}>
                  {formatCurrency(refinanceResult.lifetimeNetSavings)}
                </span>
              </div>
            </div>
          </div>

          {/* Sensitivity Analysis */}
          <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
            <h3 className="text-lg font-semibold text-text-primary mb-4">{t.refinance.sensitivityAnalysis}</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border-subtle">
                    <th className="text-left py-2 px-3 text-text-secondary">{t.refinance.rate}</th>
                    <th className="text-right py-2 px-3 text-text-secondary">{t.refinance.breakeven}</th>
                    <th className="text-right py-2 px-3 text-text-secondary">{t.refinance.lifetimeSavings}</th>
                  </tr>
                </thead>
                <tbody>
                  {sensitivityResults.map(({ rate, result }) => (
                    <tr key={rate} className="border-b border-border-subtle">
                      <td className="py-2 px-3 font-mono text-text-primary">{formatPercent(rate)}</td>
                      <td className="py-2 px-3 font-mono text-text-primary text-right">
                        {result.breakevenMonth ? `${Math.round(result.breakevenMonth)}` : 'Never'}
                      </td>
                      <td className={`py-2 px-3 font-mono text-right ${result.lifetimeNetSavings > 0 ? 'text-accent-primary' : 'text-accent-danger'}`}>
                        {formatCurrency(result.lifetimeNetSavings)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {selectedTracks.length === 0 && (
        <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-8 text-center">
          <p className="text-text-secondary">{t.refinance.selectTracksToSee}</p>
        </div>
      )}
    </div>
  );
}
