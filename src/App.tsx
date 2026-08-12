import { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { KpiRow } from './components/KpiRow';
import { TabBar } from './components/TabBar';
import { EmptyState } from './components/EmptyState';
import { ProfileSettings } from './components/ProfileSettings';
import { PortfolioTab } from './components/tabs/PortfolioTab';
import { EarlyPayoffSimulator } from './components/EarlyPayoffSimulator';
import { RefinanceTab } from './components/tabs/RefinanceTab';
import { RecommendationsTab } from './components/tabs/RecommendationsTab';

import { useProfile } from './hooks/useProfile';
import { useTheme } from './hooks/useTheme';
import { useBoiRateSync } from './hooks/useBoiRateSync';
import { setDynamicBaseRate } from './lib/rates-api';
import { useTranslation } from './lib/i18n';


type TabId = 'portfolio' | 'payoff' | 'refinance' | 'recommendations';

function App() {
  const [showProfileSettings, setShowProfileSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('portfolio');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const {
    profile,
    updateProfile,
  } = useProfile();

  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage } = useTranslation();

  // BOI rate sync: auto-syncs on mount, exposes the active Prime rate, and
  // feeds the dynamic base rate into the calculation engine so all Prime track
  // calculations consume the latest synced rate automatically.
  const boiSync = useBoiRateSync();
  setDynamicBaseRate(boiSync.boiRate);

  const renderTab = () => {

    switch (activeTab) {
      case 'portfolio':
        return <PortfolioTab t={t} profile={profile} />;
      case 'payoff':
        return <EarlyPayoffSimulator t={t} profile={profile} onUpdateProfile={updateProfile} />;


      case 'refinance':
        return <RefinanceTab t={t} profile={profile} />;
      case 'recommendations':
        return <RecommendationsTab t={t} profile={profile} />;
      default:
        return <PortfolioTab t={t} profile={profile} />;
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Header */}
      <Header
        onProfileSettings={() => setShowProfileSettings(true)}
        profile={profile}
        theme={theme}
        onToggleTheme={toggleTheme}
        language={language}
        onToggleLanguage={() => setLanguage(language === 'en' ? 'he' : 'en')}
        t={t}
        primeRate={boiSync.primeRate}
        lastSyncTime={boiSync.lastSyncTime}
        isStale={boiSync.isStale}
        syncStatus={boiSync.status}
        onRefreshRates={() => { boiSync.refresh().catch(() => {}); }}
      />


      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          tracks={profile.tracks}
          t={t}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* KPI Row */}
          <KpiRow tracks={profile.tracks} t={t} />

          {/* Tab Bar */}
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} t={t} />

          {/* Tab Content or Empty State */}
          {profile.tracks.length === 0 ? (
            <EmptyState onOpenProfileSettings={() => setShowProfileSettings(true)} t={t} />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {renderTab()}
            </div>
          )}
        </div>
      </div>

      {/* Profile Settings Modal */}
      {showProfileSettings && (
        <ProfileSettings 
          profile={profile}
          onApplyChanges={updateProfile}
          onClose={() => setShowProfileSettings(false)} 
        />
      )}
    </div>
  );
}

export default App;
