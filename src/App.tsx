import { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { KpiRow } from './components/KpiRow';
import { TabBar } from './components/TabBar';
import { EmptyState } from './components/EmptyState';
import { ProfileSettings } from './components/ProfileSettings';
import { PortfolioTab } from './components/tabs/PortfolioTab';
import { PayoffTab } from './components/tabs/PayoffTab';
import { RefinanceTab } from './components/tabs/RefinanceTab';
import { RecommendationsTab } from './components/tabs/RecommendationsTab';
import { useProfile } from './hooks/useProfile';
import { useTheme } from './hooks/useTheme';
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

  const renderTab = () => {
    switch (activeTab) {
      case 'portfolio':
        return <PortfolioTab t={t} profile={profile} />;
      case 'payoff':
        return <PayoffTab t={t} profile={profile} />;
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
