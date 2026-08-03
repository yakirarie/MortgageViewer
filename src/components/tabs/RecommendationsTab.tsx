import { useProfile } from '../../hooks/useProfile';
import {
  recommendActionsForPortfolio,
  rankTracksByPriority,
  weightedAverageRate,
} from '../../lib/mortgage-math';
import { formatCurrency, formatPercent } from '../../lib/utils';

export function RecommendationsTab() {
  const { profile } = useProfile();

  const recommendations = recommendActionsForPortfolio(
    profile.tracks,
    profile.global_assumptions.reference_market_rate
  );

  const rankedTracks = rankTracksByPriority(profile.tracks);
  const weightedRate = weightedAverageRate(profile.tracks);

  const getActionColor = (action: string) => {
    switch (action) {
      case 'PAY_OFF_NOW':
        return 'bg-accent-primary text-bg-primary';
      case 'WAIT_FOR_RESET':
        return 'bg-accent-warning text-bg-primary';
      case 'CONSIDER_REFINANCING':
        return 'bg-accent-info text-bg-primary';
      case 'HOLD':
        return 'bg-track-other text-bg-primary';
      default:
        return 'bg-track-other text-bg-primary';
    }
  };

  const getActionLabel = (action: string) => {
    switch (action) {
      case 'PAY_OFF_NOW':
        return 'Pay Off Now';
      case 'WAIT_FOR_RESET':
        return 'Wait for Reset';
      case 'CONSIDER_REFINANCING':
        return 'Consider Refinancing';
      case 'HOLD':
        return 'Hold';
      default:
        return action;
    }
  };

  const getPenaltyExposure = (track: typeof profile.tracks[0]) => {
    if (track.principal_balance === 0) return 0;
    return (track.early_exit_penalty / track.principal_balance) * 100;
  };

  return (
    <div className="p-6 space-y-6">
      <h2 className="text-2xl font-bold text-text-primary">Strategic Recommendations</h2>

      {/* Priority Ranking */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">
          Priority Ranking (sorted by action priority)
        </h3>
        <div className="space-y-3">
          {rankedTracks.map((track, index) => {
            const recommendation = recommendations.find((r) => r.track_id === track.track_id);
            const penaltyExposure = getPenaltyExposure(track);
            
            return (
              <div key={track.track_id} className="bg-bg-surface border border-border-subtle rounded p-4">
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="text-2xl font-bold text-text-secondary w-8">{index + 1}</div>
                    <div>
                      <div className="text-text-primary font-medium">{track.custom_name}</div>
                      <div className="text-text-secondary text-sm">{track.track_type.replace(/_/g, ' ')}</div>
                    </div>
                  </div>
                  {recommendation && (
                    <span className={`px-3 py-1 rounded text-sm font-medium ${getActionColor(recommendation.action)}`}>
                      {getActionLabel(recommendation.action)}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-text-secondary">Balance</div>
                    <div className="font-mono text-text-primary">{formatCurrency(track.principal_balance)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">Rate</div>
                    <div className="font-mono text-text-primary">{formatPercent(track.annual_interest_rate)}</div>
                  </div>
                  <div>
                    <div className="text-text-secondary">Reset Window</div>
                    <div className="font-mono text-text-primary">
                      {track.months_to_reset !== null ? `${track.months_to_reset} mo` : '—'}
                    </div>
                  </div>
                  <div>
                    <div className="text-text-secondary">Penalty Exposure</div>
                    <div className={`font-mono ${penaltyExposure >= 5 ? 'text-accent-danger' : penaltyExposure >= 2 ? 'text-accent-warning' : 'text-accent-primary'}`}>
                      {penaltyExposure.toFixed(1)}%
                    </div>
                  </div>
                </div>

                {recommendation && (
                  <div className="mt-3 pt-3 border-t border-border-subtle">
                    <div className="text-text-secondary text-sm">
                      <span className="font-medium">Reason:</span> {recommendation.driver}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detailed Risk/Action Matrix */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Risk/Action Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-subtle">
                <th className="text-left py-2 px-3 text-text-secondary">Track</th>
                <th className="text-left py-2 px-3 text-text-secondary">Recommended Action</th>
                <th className="text-left py-2 px-3 text-text-secondary">Confidence Driver</th>
                <th className="text-right py-2 px-3 text-text-secondary">Reset Window</th>
                <th className="text-right py-2 px-3 text-text-secondary">Penalty Exposure</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((rec) => {
                const track = profile.tracks.find((t) => t.track_id === rec.track_id);
                if (!track) return null;
                
                const penaltyExposure = getPenaltyExposure(track);
                
                return (
                  <tr key={rec.track_id} className="border-b border-border-subtle">
                    <td className="py-2 px-3 text-text-primary">{track.custom_name}</td>
                    <td className="py-2 px-3">
                      <span className={`px-2 py-1 rounded text-xs font-medium ${getActionColor(rec.action)}`}>
                        {getActionLabel(rec.action)}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-text-secondary">{rec.driver}</td>
                    <td className="py-2 px-3 text-right font-mono text-text-primary">
                      {track.months_to_reset !== null ? `${track.months_to_reset} mo` : '—'}
                    </td>
                    <td className={`py-2 px-3 text-right font-mono ${penaltyExposure >= 5 ? 'text-accent-danger' : penaltyExposure >= 2 ? 'text-accent-warning' : 'text-text-primary'}`}>
                      {penaltyExposure.toFixed(1)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Rule Engine Reference */}
      <div className="bg-bg-surface-raised border border-border-subtle rounded-lg p-6">
        <h3 className="text-lg font-semibold text-text-primary mb-4">Rule Engine Reference</h3>
        <div className="space-y-2 text-sm">
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 rounded bg-accent-primary text-bg-primary text-xs font-medium">1</span>
            <div>
              <span className="text-text-primary font-medium">Pay Off Now:</span>
              <span className="text-text-secondary">
                {' '}Rate &gt; weighted avg + 0.5% AND zero penalty
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 rounded bg-accent-warning text-bg-primary text-xs font-medium">2</span>
            <div>
              <span className="text-text-primary font-medium">Wait for Reset:</span>
              <span className="text-text-secondary">
                {' '}Reset window ≤ 6 months
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 rounded bg-accent-info text-bg-primary text-xs font-medium">3</span>
            <div>
              <span className="text-text-primary font-medium">Consider Refinancing:</span>
              <span className="text-text-secondary">
                {' '}Rate &gt; market rate + 0.75% AND penalty &lt; 2% of balance
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 rounded bg-track-other text-bg-primary text-xs font-medium">4</span>
            <div>
              <span className="text-text-primary font-medium">Hold:</span>
              <span className="text-text-secondary">
                {' '}Penalty ≥ 5% of balance
              </span>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-1 rounded bg-track-other text-bg-primary text-xs font-medium">5</span>
            <div>
              <span className="text-text-primary font-medium">Hold:</span>
              <span className="text-text-secondary">
                {' '}Default (no strong signal)
              </span>
            </div>
          </div>
        </div>
        <div className="mt-4 pt-4 border-t border-border-subtle text-xs text-text-secondary">
          Current weighted rate: {formatPercent(weightedRate)} | Market reference: {formatPercent(profile.global_assumptions.reference_market_rate)}
        </div>
      </div>
    </div>
  );
}
