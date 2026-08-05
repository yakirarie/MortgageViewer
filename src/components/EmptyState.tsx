
interface EmptyStateProps {
  onOpenProfileSettings: () => void;
  t: any;
}

export function EmptyState({ onOpenProfileSettings, t }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center">
        <div className="text-6xl mb-4">🏠</div>
        <h2 className="text-3xl font-bold text-text-primary mb-4">
          {t.emptyState.title}
        </h2>
        <p className="text-text-secondary mb-8 max-w-md mx-auto">
          {t.emptyState.description}
        </p>
        <div className="flex gap-4 justify-center">
          <button
            onClick={onOpenProfileSettings}
            className="px-6 py-3 bg-accent-primary text-bg-primary rounded font-medium hover:opacity-90"
          >
            ⚙ Profile Settings
          </button>
        </div>
      </div>
    </div>
  );
}
