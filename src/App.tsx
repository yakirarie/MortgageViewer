import { useState } from 'react';
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { KpiRow } from './components/KpiRow';
import { TabBar } from './components/TabBar';
import { EmptyState } from './components/EmptyState';
import { ProfileManager } from './components/ProfileManager';
import { PortfolioTab } from './components/tabs/PortfolioTab';
import { PayoffTab } from './components/tabs/PayoffTab';
import { RefinanceTab } from './components/tabs/RefinanceTab';
import { RecommendationsTab } from './components/tabs/RecommendationsTab';
import { useProfile } from './hooks/useProfile';
import { useTheme } from './hooks/useTheme';

type TabId = 'portfolio' | 'payoff' | 'refinance' | 'recommendations';

function App() {
  const [showProfileManager, setShowProfileManager] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>('portfolio');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const {
    profile,
    updateProfile,
    exportProfile,
    importProfile,
    loadDemoProfile,
  } = useProfile();

  const { theme, toggleTheme } = useTheme();

  const handleGlobalAssumptionsChange = (assumptions: typeof profile.global_assumptions) => {
    updateProfile({ global_assumptions: assumptions });
  };

  const renderTab = () => {
    switch (activeTab) {
      case 'portfolio':
        return <PortfolioTab />;
      case 'payoff':
        return <PayoffTab />;
      case 'refinance':
        return <RefinanceTab />;
      case 'recommendations':
        return <RecommendationsTab />;
      default:
        return <PortfolioTab />;
    }
  };

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      {/* Header */}
      <Header
        onManageTracks={() => setShowProfileManager(true)}
        onSettings={() => setShowSettings(true)}
        profile={profile}
        onExport={exportProfile}
        onImport={importProfile}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* Main Layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          onManageTracks={() => setShowProfileManager(true)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
          globalAssumptions={profile.global_assumptions}
          tracks={profile.tracks}
          onGlobalAssumptionsChange={handleGlobalAssumptionsChange}
        />

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* KPI Row */}
          <KpiRow tracks={profile.tracks} />

          {/* Tab Bar */}
          <TabBar activeTab={activeTab} onTabChange={setActiveTab} />

          {/* Tab Content or Empty State */}
          {profile.tracks.length === 0 ? (
            <EmptyState onLoadDemoProfile={loadDemoProfile} />
          ) : (
            <div className="flex-1 overflow-y-auto">
              {renderTab()}
            </div>
          )}
        </div>
      </div>

      {/* Profile Manager Modal */}
      {showProfileManager && (
        <ProfileManager onClose={() => setShowProfileManager(false)} />
      )}

      {/* Settings Modal (placeholder) */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-bg-surface rounded-lg max-w-md w-full p-6">
            <h2 className="text-xl font-bold mb-4">Settings</h2>
            <p className="text-text-secondary mb-4">Settings panel coming soon...</p>
            <button
              onClick={() => setShowSettings(false)}
              className="px-4 py-2 bg-accent-primary text-bg-primary rounded"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
