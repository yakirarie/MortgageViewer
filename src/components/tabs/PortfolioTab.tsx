import { useState } from 'react';
import { useProfile } from '../../hooks/useProfile';
import { weightedAverageRate, effectiveMonthlyPayment } from '../../lib/mortgage-math';
import { formatCurrency, formatPercent, formatNumber } from '../../lib/utils';

interface PortfolioTabProps {
  t: any;
}

export function PortfolioTab({ t }: PortfolioTabProps) {
  const { profile } = useProfile();
  const [sortField, setSortField] = useState<'name' | 'balance' | 'rate' | 'payment' | 'term'>('balance');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  const sortedTracks = [...profile.tracks].sort((a, b) => {
    let comparison = 0;
    switch (sortField) {
      case 'name':
        comparison = a.custom_name.localeCompare(b.custom_name);
        break;
      case 'balance':
        comparison = a.principal_balance - b.principal_balance;
        break;
      case 'rate':
        comparison = a.annual_interest_rate - b.annual_interest_rate;
        break;
      case 'payment':
        comparison = effectiveMonthlyPayment(a) - effectiveMonthlyPayment(b);
        break;
      case 'term':
        comparison = a.remaining_term_months - b.remaining_term_months;
        break;
    }
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const weightedRate = weightedAverageRate(profile.tracks);
  const totalBalance = profile.tracks.reduce((sum, t) => sum + t.principal_balance, 0);

  const getTrackTypeColor = (type: string) => {
    const colors: Record<string, string> = {
      PRIME: 'bg-track-prime',
      FIXED_UNLINKED: 'bg-track-fixed-unlinked',
      FIXED_LINKED: 'bg-track-fixed-linked',
      VARIABLE_5Y: 'bg-track-variable-5y',
      VARIABLE_5Y_LINKED: 'bg-track-variable-5y-linked',
      OTHER: 'bg-track-other',
    };
    return colors[type] || 'bg-track-other';
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">{t.portfolio.title}</h2>

      {/* Balance Distribution */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.portfolio.balanceDistribution}</h3>
        <div className="space-y-3">
          {profile.tracks.map((track) => {
            const percentage = totalBalance > 0 ? (track.principal_balance / totalBalance) * 100 : 0;
            return (
              <div key={track.track_id}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-text-primary">{track.custom_name}</span>
                  <span className="text-text-secondary">
                    {formatCurrency(track.principal_balance)} ({percentage.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-4 bg-bg-surface rounded overflow-hidden">
                  <div
                    className={`h-full ${getTrackTypeColor(track.track_type)}`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Track Diagnostics Table */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.portfolio.trackDiagnostics}</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th
                  className="text-left py-2 px-3 text-text-secondary cursor-pointer hover:text-text-primary"
                  onClick={() => handleSort('name')}
                >
                  {t.portfolio.name} {sortField === 'name' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-left py-2 px-3 text-text-secondary">{t.portfolio.type}</th>
                <th
                  className="text-right py-2 px-3 text-text-secondary cursor-pointer hover:text-text-primary"
                  onClick={() => handleSort('balance')}
                >
                  {t.portfolio.balance} {sortField === 'balance' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="text-right py-2 px-3 text-text-secondary cursor-pointer hover:text-text-primary"
                  onClick={() => handleSort('rate')}
                >
                  {t.portfolio.rate} {sortField === 'rate' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-right py-2 px-3 text-text-secondary">{t.portfolio.portfolioPercent}</th>
                <th
                  className="text-right py-2 px-3 text-text-secondary cursor-pointer hover:text-text-primary"
                  onClick={() => handleSort('payment')}
                >
                  {t.portfolio.monthlyPmt} {sortField === 'payment' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th
                  className="text-right py-2 px-3 text-text-secondary cursor-pointer hover:text-text-primary"
                  onClick={() => handleSort('term')}
                >
                  {t.portfolio.termLeft} {sortField === 'term' && (sortDirection === 'asc' ? '↑' : '↓')}
                </th>
                <th className="text-right py-2 px-3 text-text-secondary">{t.portfolio.resetWindow}</th>
                <th className="text-right py-2 px-3 text-text-secondary">{t.portfolio.penalty}</th>
              </tr>
            </thead>
            <tbody>
              {sortedTracks.map((track) => {
                const effectivePayment = effectiveMonthlyPayment(track);
                const portfolioPercentage = totalBalance > 0 ? (track.principal_balance / totalBalance) * 100 : 0;

                return (
                  <tr key={track.track_id} className="border-b border-border-subtle">
                    <td className="py-2 px-3 text-text-primary">{track.custom_name}</td>
                    <td className="py-2 px-3">
                      <span className={`inline-block px-2 py-1 rounded text-xs text-white ${getTrackTypeColor(track.track_type)}`}>
                        {track.track_type.replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-text-primary">
                      {formatCurrency(track.principal_balance)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-text-primary">
                      {formatPercent(track.annual_interest_rate)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-text-secondary">
                      {portfolioPercentage.toFixed(1)}%
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-text-primary">
                      {formatCurrency(effectivePayment)}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-text-primary">
                      {formatNumber(track.remaining_term_months)} {t.common.months}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-text-secondary">
                      {track.months_to_reset !== null ? `${track.months_to_reset} ${t.common.months}` : '—'}
                    </td>
                    <td className="py-2 px-3 text-right font-mono text-text-secondary">
                      {formatCurrency(track.early_exit_penalty)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weighted Rate Breakdown */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.portfolio.weightedRateBreakdown}</h3>
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-sm mb-2">
            <span className="text-text-secondary w-32">{t.portfolio.portfolioAvg}</span>
            <div className="flex-1 h-2 bg-bg-surface rounded">
              <div className="h-full bg-accent-info" style={{ width: '100%' }} />
            </div>
            <span className="font-mono text-text-primary w-20 text-right">
              {formatPercent(weightedRate)}
            </span>
          </div>
          {sortedTracks.map((track) => {
            const rateDiff = track.annual_interest_rate - weightedRate;
            const isAboveAverage = rateDiff > 0;
            return (
              <div key={track.track_id} className="flex items-center gap-4 text-sm">
                <span className="text-text-primary w-32 truncate">{track.custom_name}</span>
                <div className="flex-1 h-2 bg-bg-surface rounded">
                  <div
                    className={`h-full ${isAboveAverage ? 'bg-accent-danger' : 'bg-accent-primary'}`}
                    style={{
                      width: `${Math.min(100, Math.max(0, (track.annual_interest_rate / 0.15) * 100))}%`,
                    }}
                  />
                </div>
                <span className={`font-mono w-20 text-right ${isAboveAverage ? 'text-accent-danger' : 'text-accent-primary'}`}>
                  {formatPercent(track.annual_interest_rate)}
                  {rateDiff !== 0 && (
                    <span className="text-xs ml-1">
                      ({rateDiff > 0 ? '+' : ''}{formatPercent(rateDiff)})
                    </span>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Reset Timeline */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">{t.portfolio.resetTimeline}</h3>
        {profile.tracks.filter(t => t.months_to_reset !== null).length === 0 ? (
          <p className="text-text-secondary text-sm">{t.portfolio.noResetWindows}</p>
        ) : (
          <div className="space-y-3">
            {profile.tracks
              .filter(t => t.months_to_reset !== null)
              .map((track) => {
                const maxTerm = Math.max(...profile.tracks.map(t => t.remaining_term_months));
                const resetPosition = (track.months_to_reset! / maxTerm) * 100;
                const termPosition = (track.remaining_term_months / maxTerm) * 100;
                
                return (
                  <div key={track.track_id} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="text-text-primary">{track.custom_name}</span>
                      <span className="text-text-secondary">
                        {t.portfolio.resetIn} {track.months_to_reset} {t.common.months}
                      </span>
                    </div>
                    <div className="relative h-6 bg-bg-surface rounded">
                      {/* Track term bar */}
                      <div
                        className={`absolute h-full ${getTrackTypeColor(track.track_type)} opacity-30`}
                        style={{ width: `${termPosition}%` }}
                      />
                      {/* Reset marker */}
                      <div
                        className="absolute h-full w-1 bg-accent-warning"
                        style={{ left: `${resetPosition}%` }}
                      />
                      {/* Now marker */}
                      <div className="absolute h-full w-1 bg-accent-info" style={{ left: '0%' }} />
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
