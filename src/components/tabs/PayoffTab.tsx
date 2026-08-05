import { useState, useEffect } from 'react';
import type { Profile } from '../../lib/types';
import {
  netPayoffBenefit,
  suggestOptimalAllocation,
  investmentNetGain,
  comparePayoffVsInvest,
  type PayoffReductionMode,
} from '../../lib/mortgage-math';
import { formatCurrency } from '../../lib/utils';

interface PayoffTabProps {
  t: any;
  profile: Profile;
}

export function PayoffTab({ t, profile }: PayoffTabProps) {
  const [lumpSum, setLumpSum] = useState<number>(100000);
  const [reductionMode, setReductionMode] = useState<PayoffReductionMode>('reduce_term');
  const [noticeWaived, setNoticeWaived] = useState(false);
  const [allocations, setAllocations] = useState<Record<string, number>>({});

  // Initialize allocations to match lump sum distribution
  useEffect(() => {
    if (profile.tracks.length > 0) {
      const equalShare = lumpSum / profile.tracks.length;
      const newAllocations: Record<string, number> = {};
      profile.tracks.forEach((track) => {
        newAllocations[track.track_id] = Math.min(equalShare, track.principal_balance);
      });
      setAllocations(newAllocations);
    }
  }, [profile.tracks, lumpSum]);

  const handleAllocationChange = (trackId: string, value: number) => {
    setAllocations((prev) => ({
      ...prev,
      [trackId]: Math.max(0, Math.min(value, profile.tracks.find(t => t.track_id === trackId)?.principal_balance || 0)),
    }));
  };

  const handleSuggestOptimal = () => {
    const suggestions = suggestOptimalAllocation(profile.tracks, lumpSum, {
      mode: reductionMode,
      noticeWaived,
    });
    const newAllocations: Record<string, number> = {};
    suggestions.forEach((s) => {
      newAllocations[s.track_id] = s.allocated;
    });
    setAllocations(newAllocations);
  };

  const totalAllocated = Object.values(allocations).reduce((sum, val) => sum + val, 0);
  const remainingToAllocate = Math.max(0, lumpSum - totalAllocated);

  // Calculate NPB for each track
  const trackResults = profile.tracks.map((track) => {
    const allocated = allocations[track.track_id] || 0;
    const result = netPayoffBenefit({
      track,
      lumpSum: allocated,
      mode: reductionMode,
      noticeWaived,
    });
    return {
      track,
      allocated,
      result,
    };
  });

  const totalNpb = trackResults.reduce((sum, { result }) => sum + result.netPayoffBenefit, 0);

  // Investment comparison
  const maxTerm = Math.max(...profile.tracks.map(t => t.remaining_term_months));
  const investmentGain = investmentNetGain(lumpSum, profile.global_assumptions.alternative_investment_annual_return, maxTerm);
  const comparison = comparePayoffVsInvest(totalNpb, investmentGain, lumpSum);

  const getVerdictText = () => {
    switch (comparison) {
      case 'PAYOFF_WINS':
        return `${t.payoff.verdictPayoffWins} ≈${formatCurrency(totalNpb - investmentGain)} over ${maxTerm} ${t.common.months}`;
      case 'INVEST_WINS':
        return `${t.payoff.verdictInvestWins} ≈${formatCurrency(investmentGain - totalNpb)} over ${maxTerm} ${t.common.months}`;
      case 'ROUGHLY_EQUAL':
        return t.payoff.verdictRoughlyEqual;
    }
  };

  const getVerdictColor = () => {
    switch (comparison) {
      case 'PAYOFF_WINS':
        return 'text-accent-primary';
      case 'INVEST_WINS':
        return 'text-accent-warning';
      case 'ROUGHLY_EQUAL':
        return 'text-text-secondary';
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">{t.payoff.title}</h2>

      {/* Lump Sum Input */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <div className="flex items-center gap-4">
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
      </div>

      {/* Allocation Controls */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-semibold text-text-primary">{t.payoff.allocation}</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-secondary">{t.payoff.mode}</label>
              <select
                value={reductionMode}
                onChange={(e) => setReductionMode(e.target.value as PayoffReductionMode)}
                className="bg-bg-surface border border-border-subtle rounded px-2 py-1 text-text-primary text-sm focus:outline-none focus:border-accent-info"
              >
                <option value="reduce_term">{t.payoff.reduceTerm}</option>
                <option value="reduce_payment">{t.payoff.reducePayment}</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="notice-waived"
                checked={noticeWaived}
                onChange={(e) => setNoticeWaived(e.target.checked)}
                className="w-4 h-4 rounded border-border-subtle bg-bg-surface text-accent-primary focus:ring-accent-primary"
              />
              <label htmlFor="notice-waived" className="text-sm text-text-secondary">
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

        <div className="space-y-4">
          {profile.tracks.map((track) => {
            const allocated = allocations[track.track_id] || 0;
            const maxAllocation = track.principal_balance;
            
            return (
              <div key={track.track_id} className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="text-text-primary">{track.custom_name}</span>
                  <span className="text-text-secondary text-sm">
                    {t.payoff.max} {formatCurrency(maxAllocation)}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <input
                    type="range"
                    min={0}
                    max={maxAllocation}
                    step={1000}
                    value={allocated}
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

      {/* Per-Track Results */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.payoff.resultsByTrack}</h3>
        <div className="space-y-3">
          {trackResults.map(({ track, allocated, result }) => {
            if (allocated === 0) return null;
            
            return (
              <div key={track.track_id} className="bg-bg-surface border border-border-subtle rounded p-4">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-text-primary font-medium">{track.custom_name}</span>
                  <span className="text-text-secondary text-sm">{formatCurrency(allocated)} {t.payoff.allocated}</span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <div className="text-text-secondary">{t.payoff.interestSaved}</div>
                    <div className="font-mono text-accent-primary">{formatCurrency(result.interestSaved)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">{t.payoff.penaltyFees}</div>
                    <div className="font-mono text-accent-danger">{formatCurrency(result.penaltyPaid + result.noticeFeePaid)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">{t.payoff.netBenefit}</div>
                    <div className={`font-mono ${result.netPayoffBenefit > 0 ? 'text-accent-primary' : 'text-accent-danger'}`}>
                      {formatCurrency(result.netPayoffBenefit)}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Payoff vs Invest Comparison */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.payoff.payoffVsInvest}</h3>
        
        <div className="grid grid-cols-2 gap-6 mb-6">
          <div className="bg-bg-surface border border-border-subtle rounded p-4">
            <div className="text-text-secondary mb-2">{t.payoff.totalPayoffBenefit}</div>
            <div className="text-2xl font-mono text-accent-primary">{formatCurrency(totalNpb)}</div>
          </div>
          <div className="bg-bg-surface border border-border-subtle rounded p-4">
            <div className="text-text-secondary mb-2">{t.payoff.investmentGain} ({maxTerm} {t.common.months})</div>
            <div className="text-2xl font-mono text-accent-warning">{formatCurrency(investmentGain)}</div>
          </div>
        </div>

        <div className={`text-lg font-medium mb-4 ${getVerdictColor()}`}>
          {getVerdictText()}
        </div>

        <div className="bg-bg-surface border border-border-subtle rounded p-4 text-sm text-text-secondary">
          <p className="mb-2">
            <strong>{t.payoff.disclaimer}</strong> {t.payoff.disclaimerText}
          </p>
          {noticeWaived && (
            <p className="text-accent-info">
              {t.payoff.noticeWaivedNote}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
