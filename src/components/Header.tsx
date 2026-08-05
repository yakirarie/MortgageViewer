import React from 'react';
import type { Profile } from '../lib/types';

interface HeaderProps {
  onProfileSettings: () => void;
  profile: Profile;
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  language: 'en' | 'he';
  onToggleLanguage: () => void;
  t: any;
}

export function Header({ onProfileSettings, profile, theme, onToggleTheme, language, onToggleLanguage, t }: HeaderProps) {
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
