import React from 'react';
import type { Profile } from '../lib/types';

interface HeaderProps {
  onManageTracks: () => void;
  onSettings: () => void;
  profile: Profile;
  onExport: () => void;
  onImport: (file: File) => Promise<void>;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
}

export function Header({ onManageTracks, onSettings, profile, onExport, onImport, theme, onToggleTheme }: HeaderProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await onImport(file);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        alert('Failed to import profile');
      }
    }
  };

  return (
    <header className="bg-bg-surface border-b border-border-subtle px-6 py-4">
      <div className="container mx-auto flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-text-primary">Mashkanta Decision Engine</h1>
          {profile.profile_name && (
            <span className="text-text-secondary text-sm">| {profile.profile_name}</span>
          )}
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={onManageTracks}
            className="px-4 py-2 bg-accent-primary text-bg-primary rounded font-medium hover:opacity-90 text-sm"
          >
            Manage Tracks
          </button>
          
          <button
            onClick={onExport}
            className="px-4 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
          >
            Save
          </button>
          
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
          >
            Load
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          
          <button
            onClick={onSettings}
            className="px-3 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info"
            title="Settings"
          >
            ⚙
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
