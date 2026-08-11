import type { Profile } from '../lib/types';
import { getRatesAsOfDate, isRatesCurrent, formatFullDateTime } from '../lib/rates-api';

import type { BoiSyncStatus } from '../hooks/useBoiRateSync';


interface HeaderProps {
  onProfileSettings: () => void;
  profile: Profile;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  language: 'en' | 'he';
  onToggleLanguage: () => void;
  t: any;
  /** Active Prime rate (boi_rate + 1.5%) from the synced store, or null. */
  primeRate?: number | null;
  /** ISO timestamp of the last successful BOI rate sync, or null. */
  lastSyncTime?: string | null;
  /** Whether the cached BOI rates are stale. */
  isStale?: boolean;
  /** Current BOI sync status. */
  syncStatus?: BoiSyncStatus;
  /** Manually trigger a BOI rate sync. */
  onRefreshRates?: () => void;
}

export function Header({
  onProfileSettings,
  profile,
  theme,
  onToggleTheme,
  language,
  onToggleLanguage,
  t,
  syncStatus,
  onRefreshRates,
}: HeaderProps) {

  const ratesAsOf = getRatesAsOfDate();
  const ratesCurrent = isRatesCurrent();
  const ratesAsOfLabel = formatFullDateTime(ratesAsOf);
  const syncing = syncStatus === 'syncing';


  return (
    <header className="bg-bg-surface border-b border-border-subtle px-6 py-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-text-primary">{t.common.appName}</h1>
          {profile.profile_name && (
            <span className="text-text-secondary text-sm">| {profile.profile_name}</span>
          )}
          <span className="text-success text-xs" title="Auto-saved to browser">
            ✓
          </span>
        </div>
        
        <div className="flex items-center gap-3">
          {/* Rate data freshness indicator — all rates rely on the same BOI decision date */}
          <span
            className={`text-xs px-2 py-1 rounded border ${
              ratesCurrent
                ? 'text-success border-success/40 bg-success/10'
                : 'text-accent-warning border-accent-warning/40 bg-accent-warning/10'
            }`}
            title={`All rate data in this tool — Bank of Israel base rate, Prime rate, and accrued interest — is based on the Bank of Israel decision of ${ratesAsOfLabel}. ${ratesCurrent ? 'Current.' : 'May be outdated — refresh to update.'}`}
          >
            {ratesCurrent ? '✓' : '⚠'} All rates (BOI, Prime, Accrued Interest) as of {ratesAsOfLabel}
          </span>


          <button
            onClick={onRefreshRates}
            disabled={syncing}
            className="px-3 py-1.5 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-xs disabled:opacity-50"
            title="Refresh Bank of Israel prime rates"
          >
            {syncing ? 'Syncing…' : '↻ Refresh BOI Rates'}
          </button>

          <button
            onClick={onProfileSettings}
            className="px-4 py-2 bg-accent-primary text-bg-primary rounded font-medium hover:opacity-90 text-sm"
          >
            ⚙ Profile Settings
          </button>
          
          <button
            onClick={onToggleLanguage}
            className="px-3 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info"
            title={`Switch to ${language === 'en' ? 'Hebrew' : 'English'}`}
          >
            {language === 'en' ? '🇮🇱' : '🇺🇸'}
          </button>
          <button
            onClick={onToggleTheme}
            className="px-3 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </div>
      </div>
    </header>
  );
}
