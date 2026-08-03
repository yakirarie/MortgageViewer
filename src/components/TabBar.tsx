type TabId = 'portfolio' | 'payoff' | 'refinance' | 'recommendations';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  t: any;
}

export function TabBar({ activeTab, onTabChange, t }: TabBarProps) {
  const tabs: { id: TabId; label: string }[] = [
    { id: 'portfolio', label: t.tabs.portfolio },
    { id: 'payoff', label: t.tabs.payoff },
    { id: 'refinance', label: t.tabs.refinance },
    { id: 'recommendations', label: t.tabs.recommendations },
  ];
  return (
    <div className="bg-bg-surface border-b border-border-subtle px-6">
      <div className="container mx-auto">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-accent-primary border-accent-primary'
                  : 'text-text-secondary border-transparent hover:text-text-primary hover:border-border-subtle'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
