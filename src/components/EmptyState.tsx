
interface EmptyStateProps {
  onLoadDemoProfile: () => void;
}

export function EmptyState({ onLoadDemoProfile }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">🏠</div>
        <h2 className="text-3xl font-bold text-text-primary mb-4">
          No mortgage tracks yet
        </h2>
        <p className="text-text-secondary mb-8 max-w-md mx-auto">
          Add your mortgage tracks to see portfolio diagnostics, early payoff analysis, 
          refinancing breakeven calculations, and personalized recommendations.
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={onLoadDemoProfile}
            className="px-6 py-3 bg-accent-primary text-bg-primary rounded font-medium hover:opacity-90"
          >
            Load Demo Profile
          </button>
        </div>
      </div>
    </div>
  );
}
