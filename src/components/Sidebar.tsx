import type { Profile } from '../lib/types';
import { liveTrackBalance } from '../lib/mortgage-math';

interface SidebarProps {
  collapsed?: boolean;
  onToggleCollapse?: () => void;
  tracks: Profile['tracks'];
  t: any;
}

/** Format a track balance as a compact "NNNk ₪" label, falling back to "₪0"
 *  when the balance is missing/NaN so the sidebar never shows NaN. */
function formatSidebarBalance(balance: number): string {
  if (!Number.isFinite(balance) || balance <= 0) return '₪0';
  return `${(balance / 1000).toFixed(0)}k ₪`;
}

export function Sidebar({ 

  collapsed = false, 
  onToggleCollapse,
  tracks,
  t,
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
            {/* Profile Quick List */}
            <div>
              <h3 className="text-sm font-semibold text-text-secondary mb-3 uppercase tracking-wide">
                {t.sidebar.profileSummary}
              </h3>
              
              {tracks.length === 0 ? (
                <p className="text-text-secondary text-sm">{t.common.noTracks}</p>
              ) : (
                <div className="space-y-2">
                  {tracks.map((track) => (
                    <div
                      key={track.track_id}
                      className="bg-bg-surface-raised border border-border-subtle rounded p-2"
                    >
                      <div className="text-sm text-text-primary">{track.custom_name}</div>
                      <div className="text-xs text-text-secondary">
                        {formatSidebarBalance(liveTrackBalance(track))}
                      </div>

                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}
