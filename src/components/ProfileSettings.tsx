import { useState, useEffect, useRef } from 'react';
import type { Profile, GlobalAssumptions, Track } from '../lib/types';
import { TrackCard } from './TrackCard';
import { uploadJson, downloadJson, getCurrentTimestamp } from '../lib/utils';
import { validateProfile, validateGlobalAssumptions } from '../lib/validation';
import { spitzerMonthlyPayment } from '../lib/mortgage-math';
import { createDemoProfile, createEmptyProfile, createDefaultTrack, duplicateTrack } from '../lib/demo-profile';

interface ProfileSettingsProps {
  profile: Profile;
  onApplyChanges: (updatedProfile: Profile) => void;
  onClose: () => void;
}

export function ProfileSettings({ profile: initialProfile, onApplyChanges, onClose }: ProfileSettingsProps) {
  const [localProfile, setLocalProfile] = useState<Profile>(initialProfile);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [importStatus, setImportStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [importMessage, setImportMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Update local profile when initial profile changes
  useEffect(() => {
    setLocalProfile(initialProfile);
    setHasUnsavedChanges(false);
  }, [initialProfile]);

  const handleProfileNameChange = (name: string) => {
    setLocalProfile(prev => ({ ...prev, profile_name: name }));
    setHasUnsavedChanges(true);
  };

  const handleGlobalAssumptionsChange = (assumptions: GlobalAssumptions) => {
    setLocalProfile(prev => ({ ...prev, global_assumptions: assumptions }));
    setHasUnsavedChanges(true);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportStatus('loading');
      setImportMessage('Loading profile...');
      
      try {
        const data = await uploadJson(file);
        const importedProfile = data as Profile;
        
        // Validate the imported profile
        const validation = validateProfile(importedProfile);
        if (!validation.isValid) {
          throw new Error('Invalid profile format');
        }
        
        // Auto-calculate payments for imported tracks
        const tracksWithPayments = importedProfile.tracks.map((track) => {
          if (!track.is_payment_manual_override && track.principal_balance > 0 && track.remaining_term_months > 0) {
            const calculatedPayment = spitzerMonthlyPayment(
              track.principal_balance,
              track.annual_interest_rate,
              track.remaining_term_months
            );
            return { ...track, monthly_repayment: calculatedPayment };
          }
          return track;
        });
        
        setLocalProfile({ ...importedProfile, tracks: tracksWithPayments });
        setHasUnsavedChanges(true);
        setImportStatus('success');
        setImportMessage(`Profile "${file.name}" loaded! Click Apply to save changes.`);
        
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
        
        setTimeout(() => {
          setImportStatus('idle');
          setImportMessage('');
        }, 5000);
      } catch (error) {
        setImportStatus('error');
        setImportMessage('Failed to load profile. Please check the file format.');
        
        setTimeout(() => {
          setImportStatus('idle');
          setImportMessage('');
        }, 5000);
      }
    }
  };

  const handleExport = () => {
    const filename = `mashkanta-${localProfile.profile_name.replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}.json`;
    downloadJson(localProfile, filename);
    setImportStatus('success');
    setImportMessage(`Profile exported as ${filename}`);
    
    setTimeout(() => {
      setImportStatus('idle');
      setImportMessage('');
    }, 3000);
  };

  const handleLoadDemo = () => {
    const demo = createDemoProfile();
    const tracksWithPayments = demo.tracks.map((track) => {
      if (!track.is_payment_manual_override && track.principal_balance > 0 && track.remaining_term_months > 0) {
        const calculatedPayment = spitzerMonthlyPayment(
          track.principal_balance,
          track.annual_interest_rate,
          track.remaining_term_months
        );
        return { ...track, monthly_repayment: calculatedPayment };
      }
      return track;
    });
    
    setLocalProfile({ ...demo, tracks: tracksWithPayments });
    setHasUnsavedChanges(true);
    setImportStatus('success');
    setImportMessage('Demo profile loaded! Click Apply to save changes.');
    
    setTimeout(() => {
      setImportStatus('idle');
      setImportMessage('');
    }, 3000);
  };

  const handleResetProfile = () => {
    if (confirm('This will reset everything to a fresh empty profile. All your data will be lost. Are you sure?')) {
      const empty = createEmptyProfile();
      setLocalProfile(empty);
      setHasUnsavedChanges(true);
      setImportStatus('success');
      setImportMessage('Profile reset to empty state! Click Apply to save changes.');
      setTimeout(() => {
        setImportStatus('idle');
        setImportMessage('');
      }, 3000);
    }
  };

  const handleApply = () => {
    onApplyChanges(localProfile);
    setHasUnsavedChanges(false);
    setImportStatus('success');
    setImportMessage('Changes applied successfully!');
    setTimeout(() => {
      setImportStatus('idle');
      setImportMessage('');
    }, 2000);
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm('You have unsaved changes. Apply them before closing?')) {
        handleApply();
        onClose();
      } else {
        onClose();
      }
    } else {
      onClose();
    }
  };

  // Track operations
  const addTrack = (trackType: string = 'PRIME') => {
    if (localProfile.tracks.length >= 8) return;
    
    const newTrack = createDefaultTrack(trackType);
    if (newTrack.principal_balance > 0 && newTrack.remaining_term_months > 0) {
      newTrack.monthly_repayment = spitzerMonthlyPayment(
        newTrack.principal_balance,
        newTrack.annual_interest_rate,
        newTrack.remaining_term_months
      );
    }
    
    setLocalProfile(prev => ({
      ...prev,
      tracks: [...prev.tracks, newTrack],
    }));
    setHasUnsavedChanges(true);
  };

  const updateTrack = (trackId: string, updates: Partial<Track>) => {
    setLocalProfile(prev => {
      const updatedTracks = prev.tracks.map((track) => {
        if (track.track_id !== trackId) return track;
        
        let updated = { ...track, ...updates };
        
        // Set manual override flag if user edited monthly payment directly
        if (updates.monthly_repayment !== undefined && updates.monthly_repayment !== track.monthly_repayment) {
          updated.is_payment_manual_override = true;
        }
        
        // Auto-calculate payment if not manually overridden
        if (!updated.is_payment_manual_override && updated.principal_balance > 0 && updated.remaining_term_months > 0) {
          updated.monthly_repayment = spitzerMonthlyPayment(
            updated.principal_balance,
            updated.annual_interest_rate,
            updated.remaining_term_months
          );
        }
        
        return updated;
      });
      
      return { ...prev, tracks: updatedTracks };
    });
    setHasUnsavedChanges(true);
  };

  const deleteTrack = (trackId: string) => {
    setLocalProfile(prev => ({
      ...prev,
      tracks: prev.tracks.filter((t) => t.track_id !== trackId),
    }));
    setHasUnsavedChanges(true);
  };

  const duplicateTrackById = (trackId: string) => {
    if (localProfile.tracks.length >= 8) return;
    
    const trackToDuplicate = localProfile.tracks.find((t) => t.track_id === trackId);
    if (!trackToDuplicate) return;
    
    const duplicated = duplicateTrack(trackToDuplicate);
    setLocalProfile(prev => ({
      ...prev,
      tracks: [...prev.tracks, duplicated],
    }));
    setHasUnsavedChanges(true);
  };

  const reorderTracks = (fromIndex: number, toIndex: number) => {
    setLocalProfile(prev => {
      const tracks = [...prev.tracks];
      const [movedTrack] = tracks.splice(fromIndex, 1);
      tracks.splice(toIndex, 0, movedTrack);
      return { ...prev, tracks };
    });
    setHasUnsavedChanges(true);
  };

  const recalculatePayment = (trackId: string) => {
    updateTrack(trackId, {
      is_payment_manual_override: false,
      monthly_repayment: 0, // Will be auto-calculated
    });
  };

  const getFieldError = (trackId: string | null, field: string): string | undefined => {
    return undefined;
  };

  const canAddTrack = localProfile.tracks.length < 8;

  const { profile_name, global_assumptions } = localProfile;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-surface rounded-lg max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border-subtle flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Profile Settings</h2>
            <p className="text-text-secondary text-sm mt-1">
              {localProfile.tracks.length} of 8 tracks
              {hasUnsavedChanges && <span className="ml-2 text-accent-warning">• Unsaved changes</span>}
            </p>
          </div>
          <button
            onClick={handleClose}
            className="text-text-secondary hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {/* Settings Form */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Profile Name */}
          <div>
            <label className="block text-sm font-medium text-text-primary mb-2">
              Profile Name
            </label>
            <input
              type="text"
              value={profile_name}
              onChange={(e) => handleProfileNameChange(e.target.value)}
              className="w-full bg-bg-surface-raised border border-border-subtle rounded px-3 py-2 text-text-primary focus:outline-none focus:border-accent-info"
              placeholder="My Mashkanta"
            />
          </div>

          {/* Global Assumptions */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Global Assumptions</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Reference Market Rate
                </label>
                <input
                  type="text"
                  value={`${(global_assumptions.reference_market_rate * 100).toFixed(2)}%`}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value.replace('%', '')) / 100;
                    handleGlobalAssumptionsChange({
                      ...global_assumptions,
                      reference_market_rate: value,
                    });
                  }}
                  className="w-full bg-bg-surface-raised border border-border-subtle rounded px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-info"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Alternative Investment Return
                </label>
                <input
                  type="text"
                  value={`${(global_assumptions.alternative_investment_annual_return * 100).toFixed(2)}%`}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value.replace('%', '')) / 100;
                    handleGlobalAssumptionsChange({
                      ...global_assumptions,
                      alternative_investment_annual_return: value,
                    });
                  }}
                  className="w-full bg-bg-surface-raised border border-border-subtle rounded px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-info"
                />
              </div>

              <div>
                <label className="block text-sm text-text-secondary mb-1">
                  Prime Rate Current
                </label>
                <input
                  type="text"
                  value={`${(global_assumptions.prime_rate_current * 100).toFixed(2)}%`}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value.replace('%', '')) / 100;
                    handleGlobalAssumptionsChange({
                      ...global_assumptions,
                      prime_rate_current: value,
                    });
                  }}
                  className="w-full bg-bg-surface-raised border border-border-subtle rounded px-3 py-2 text-text-primary font-mono focus:outline-none focus:border-accent-info"
                />
              </div>
            </div>
          </div>

          {/* Tracks Section */}
          <div>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold text-text-primary">Mortgage Tracks</h3>
              <button
                onClick={() => addTrack('PRIME')}
                disabled={!canAddTrack}
                className={`px-4 py-2 rounded font-medium text-sm ${
                  canAddTrack
                    ? 'bg-accent-primary text-bg-primary hover:opacity-90'
                    : 'bg-bg-surface-raised text-text-secondary cursor-not-allowed'
                }`}
              >
                {canAddTrack ? '+ Add Track' : 'Max 8 tracks'}
              </button>
            </div>
            <div className="space-y-3">
              {localProfile.tracks.length === 0 ? (
                <div className="text-center py-8 bg-bg-surface-raised border border-border-subtle rounded">
                  <p className="text-text-secondary mb-4">No tracks yet</p>
                  <p className="text-text-secondary text-sm">Load a demo profile or add your first track above.</p>
                </div>
              ) : (
                localProfile.tracks.map((track, index) => (
                  <TrackCard
                    key={track.track_id}
                    track={track}
                    onUpdate={(updates) => updateTrack(track.track_id, updates)}
                    onDelete={() => deleteTrack(track.track_id)}
                    onDuplicate={() => duplicateTrackById(track.track_id)}
                    onRecalculatePayment={() => recalculatePayment(track.track_id)}
                    onMoveUp={() => reorderTracks(index, index - 1)}
                    onMoveDown={() => reorderTracks(index, index + 1)}
                    canMoveUp={index > 0}
                    canMoveDown={index < localProfile.tracks.length - 1}
                    getFieldError={(field) => getFieldError(track.track_id, field)}
                    primeRate={localProfile.global_assumptions.prime_rate_current}
                  />
                ))
              )}
            </div>
          </div>

          {/* Profile Actions */}
          <div>
            <h3 className="text-lg font-semibold text-text-primary mb-4">Profile Actions</h3>
            <div className="grid grid-cols-4 gap-3">
              <button
                onClick={handleLoadDemo}
                className="px-4 py-3 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
              >
                Load Demo Profile
              </button>
              <button
                onClick={handleExport}
                className="px-4 py-3 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
              >
                💾 Download Profile
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-3 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
                disabled={importStatus === 'loading'}
              >
                📁 Upload Profile
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={handleImport}
                className="hidden"
              />
              <button
                onClick={handleResetProfile}
                className="px-4 py-3 border border-accent-danger text-accent-danger rounded hover:bg-accent-danger hover:text-white text-sm col-span-4"
              >
                Reset to Empty Profile
              </button>
            </div>
          </div>

          {/* Status Message */}
          {importMessage && (
            <div className={`text-sm p-3 rounded ${
              importStatus === 'success' 
                ? 'bg-success/10 text-success' 
                : importStatus === 'error'
                ? 'bg-accent-danger/10 text-accent-danger'
                : 'bg-accent-info/10 text-accent-info'
            }`}>
              {importMessage}
            </div>
          )}

          {/* Help Text */}
          {importStatus === 'idle' && !importMessage && (
            <div className="text-text-secondary text-xs space-y-1">
              <p>💡 <strong>Profile Name:</strong> A friendly name for your mortgage portfolio.</p>
              <p>📊 <strong>Global Assumptions:</strong> Market rates used for calculations across all tracks.</p>
              <p>🏠 <strong>Tracks:</strong> Add, edit, or remove mortgage tracks directly here.</p>
              <p>💾 <strong>Download:</strong> Save your complete profile as a JSON file for backup.</p>
              <p>📁 <strong>Upload:</strong> Load a previously saved profile from a JSON file.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border-subtle flex gap-3">
          <button
            onClick={handleClose}
            className="flex-1 py-3 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info font-medium"
          >
            Cancel
          </button>
          {hasUnsavedChanges && (
            <button
              onClick={handleApply}
              className="flex-1 py-3 bg-success text-bg-primary rounded font-medium hover:opacity-90"
            >
              Apply Changes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
