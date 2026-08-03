type TabId = 'portfolio' | 'payoff' | 'refinance' | 'recommendations';

interface TabBarProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'portfolio', label: 'Portfolio & Diagnostics' },
  { id: 'payoff', label: 'Early Payoff' },
  { id: 'refinance', label: 'Refinancing' },
  { id: 'recommendations', label: 'Recommendations' },
];

export function TabBar({ activeTab, onTabChange }: TabBarProps) {
  return (
    <div className="bg-bg-surface border-b border-border-subtle px-6">
      <div className="container mx-auto">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
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
