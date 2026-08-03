import type { Profile, GlobalAssumptions } from '../lib/types';
import { formatPercent, parsePercentInput } from '../lib/utils';

interface SidebarProps {
  onManageTracks: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  globalAssumptions: GlobalAssumptions;
  tracks: Profile['tracks'];
  onGlobalAssumptionsChange: (assumptions: GlobalAssumptions) => void;
}

export function Sidebar({ 
  onManageTracks, 
  collapsed = false, 
  onToggleCollapse,
  globalAssumptions,
  tracks,
  onGlobalAssumptionsChange,
}: SidebarProps) {

  return (
    <aside
      className={`bg-bg-surface border-r border-border-subtle transition-all duration-300 ${
        collapsed ? 'w-16' : 'w-72'
      }`}
    >
      <div className="p-4">
        {/* Collapse Toggle */}
        <button
          onClick={onToggleCollapse}
          className="mb-4 text-text-secondary hover:text-text-primary text-sm"
        >
          {collapsed ? '→' : '←'}
        </button>

        {!collapsed && (
          <>
            {/* Global Assumptions */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wide">
                Global Assumptions
              </h3>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Reference Market Rate
                  </label>
                  <input
                    type="text"
                    value={formatPercent(globalAssumptions.reference_market_rate)}
                    onChange={(e) => {
                      const value = parsePercentInput(e.target.value);
                      onGlobalAssumptionsChange({
                        ...globalAssumptions,
                        reference_market_rate: value,
                      });
                    }}
                    className="w-full bg-bg-surface-raised border border-border-subtle rounded px-2 py-1 text-text-primary text-sm font-mono text-right focus:outline-none focus:border-accent-info font-tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Alternative Investment Return
                  </label>
                  <input
                    type="text"
                    value={formatPercent(globalAssumptions.alternative_investment_annual_return)}
                    onChange={(e) => {
                      const value = parsePercentInput(e.target.value);
                      onGlobalAssumptionsChange({
                        ...globalAssumptions,
                        alternative_investment_annual_return: value,
                      });
                    }}
                    className="w-full bg-bg-surface-raised border border-border-subtle rounded px-2 py-1 text-text-primary text-sm font-mono text-right focus:outline-none focus:border-accent-info font-tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-secondary mb-1">
                    Prime Rate Current
                  </label>
                  <input
                    type="text"
                    value={formatPercent(globalAssumptions.prime_rate_current)}
                    onChange={(e) => {
                      const value = parsePercentInput(e.target.value);
                      onGlobalAssumptionsChange({
                        ...globalAssumptions,
                        prime_rate_current: value,
                      });
                    }}
                    className="w-full bg-bg-surface-raised border border-border-subtle rounded px-2 py-1 text-text-primary text-sm font-mono text-right focus:outline-none focus:border-accent-info font-tabular-nums"
                  />
                </div>
              </div>
            </div>

            {/* Profile Quick List */}
            <div>
              <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wide">
                Profile Summary
              </h3>
              
              {tracks.length === 0 ? (
                <p className="text-text-secondary text-sm">No tracks yet</p>
              ) : (
                <div className="space-y-2">
                  {tracks.map((track) => (
                    <div
                      key={track.track_id}
                      className="bg-bg-surface-raised border border-border-subtle rounded p-2"
                    >
                      <div className="text-sm text-text-primary">{track.custom_name}</div>
                      <div className="text-xs text-text-secondary">
                        {(track.principal_balance / 1000).toFixed(0)}k ₪
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={onManageTracks}
                    className="w-full text-sm text-accent-info hover:text-accent-primary mt-2"
                  >
                    Manage Tracks →
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
