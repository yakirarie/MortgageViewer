import { useRef } from 'react';
import { useProfile } from '../hooks/useProfile';
import { TrackCard } from './TrackCard';

interface ProfileManagerProps {
  onClose: () => void;
}

export function ProfileManager({ onClose }: ProfileManagerProps) {
  const {
    profile,
    addTrack,
    updateTrack,
    deleteTrack,
    duplicateTrackById,
    reorderTracks,
    recalculatePayment,
    clearAllTracks,
    loadDemoProfile,
    exportProfile,
    importProfile,
    getFieldError,
  } = useProfile();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        await importProfile(file);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      } catch (error) {
        alert('Failed to import profile. Please check the file format.');
      }
    }
  };

  const handleClearAll = () => {
    if (confirm('This will delete all tracks. Are you sure you want to continue?')) {
      clearAllTracks();
    }
  };

  const canAddTrack = profile.tracks.length < 8;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bg-surface rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-border-subtle flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-bold text-text-primary">Manage Tracks</h2>
            <p className="text-text-secondary text-sm mt-1">
              {profile.tracks.length} of 8 tracks
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary text-2xl"
          >
            ×
          </button>
        </div>

        {/* Profile Actions */}
        <div className="p-4 border-b border-border-subtle flex flex-wrap gap-2">
          <button
            onClick={loadDemoProfile}
            className="px-4 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
          >
            Load Demo Profile
          </button>
          <button
            onClick={exportProfile}
            className="px-4 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
          >
            Export JSON
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-bg-surface-raised border border-border-subtle rounded text-text-primary hover:border-accent-info text-sm"
          >
            Import JSON
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            onChange={handleImport}
            className="hidden"
          />
          <div className="flex-1" />
          <button
            onClick={handleClearAll}
            className="px-4 py-2 border border-accent-danger text-accent-danger rounded hover:bg-accent-danger hover:text-white text-sm"
          >
            Clear All
          </button>
        </div>

        {/* Tracks List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {profile.tracks.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-text-secondary text-lg mb-4">No tracks yet</p>
              <button
                onClick={loadDemoProfile}
                className="px-6 py-2 bg-accent-primary text-bg-primary rounded font-medium"
              >
                Load Demo Profile
              </button>
            </div>
          ) : (
            profile.tracks.map((track, index) => (
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
                canMoveDown={index < profile.tracks.length - 1}
                getFieldError={(field) => getFieldError(track.track_id, field)}
                primeRate={profile.global_assumptions.prime_rate_current}
              />
            ))
          )}
        </div>

        {/* Add Track Button */}
        <div className="p-4 border-t border-border-subtle">
          <button
            onClick={() => addTrack('PRIME')}
            disabled={!canAddTrack}
            className={`w-full py-3 rounded font-medium ${
              canAddTrack
                ? 'bg-accent-primary text-bg-primary hover:opacity-90'
                : 'bg-bg-surface-raised text-text-secondary cursor-not-allowed'
            }`}
          >
            {canAddTrack ? '+ Add Track' : 'Maximum 8 tracks reached'}
          </button>
        </div>
      </div>
    </div>
  );
}
