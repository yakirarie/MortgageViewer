import { portfolioTotals } from '../lib/mortgage-math';
import { formatCurrency, formatPercent } from '../lib/utils';
import type { Track } from '../lib/types';

interface KpiRowProps {
  tracks: Track[];
  t: any;
}

export function KpiRow({ tracks, t }: KpiRowProps) {
  const totals = portfolioTotals(tracks);

  // Don't render KPI row if no tracks exist (per PRD §3.1)
  if (tracks.length === 0) {
    return null;
  }

  return (
    <div className="bg-bg-surface border-b border-border-subtle px-6 py-4">
      <div className="container mx-auto">
        <div className="grid grid-cols-4 gap-4">
          {/* Total Outstanding Balance */}
          <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-4">
            <div className="text-xs text-text-secondary mb-1">{t.kpi.totalOutstandingBalance}</div>
            <div className="text-2xl font-bold text-text-primary font-mono">
              {formatCurrency(totals.totalBalance)}
            </div>
          </div>

          {/* Weighted Avg Interest Rate */}
          <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-4">
            <div className="text-xs text-text-secondary mb-1">{t.kpi.weightedAvgInterestRate}</div>
            <div className="text-2xl font-bold text-text-primary font-mono">
              {formatPercent(totals.weightedRate)}
            </div>
          </div>

          {/* Blended Monthly Repayment */}
          <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-4">
            <div className="text-xs text-text-secondary mb-1">{t.kpi.blendedMonthlyRepayment}</div>
            <div className="text-2xl font-bold text-text-primary font-mono">
              {formatCurrency(totals.blendedMonthlyPayment)}
            </div>
          </div>

          {/* Est. Total Remaining Interest */}
          <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-4">
            <div className="text-xs text-text-secondary mb-1">{t.kpi.estTotalRemainingInterest}</div>
            {totals.invalidInterestTrackIds.length > 0 ? (
              <div className="text-sm text-accent-warning">
                N/A — payment below amortizing minimum
              </div>
            ) : (
              <div className="text-2xl font-bold text-text-primary font-mono">
                ≈{formatCurrency(totals.totalRemainingInterest)}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
