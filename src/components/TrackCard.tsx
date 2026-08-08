import { useState } from 'react';
import type { Track } from '../lib/types';
import { formatCurrency, formatPercent } from '../lib/utils';
import { TrackForm } from './TrackForm';

interface TrackCardProps {
  track: Track;
  onUpdate: (updates: Partial<Track>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  getFieldError: (field: string) => string | undefined;
}

export function TrackCard({
  track,
  onUpdate,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
  getFieldError,
}: TrackCardProps) {

  const [isExpanded, setIsExpanded] = useState(false);

  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const handleDelete = () => {
    if (deleteConfirm) {
      onDelete();
      setDeleteConfirm(false);
    } else {
      setDeleteConfirm(true);
      setTimeout(() => setDeleteConfirm(false), 3000);
    }
  };

  const getTrackTypeColor = () => {
    const colors: Record<string, string> = {
      PRIME: 'bg-track-prime',
      FIXED_UNLINKED: 'bg-track-fixed-unlinked',
      FIXED_LINKED: 'bg-track-fixed-linked',
      VARIABLE_5Y: 'bg-track-variable-5y',
      VARIABLE_5Y_LINKED: 'bg-track-variable-5y-linked',
      OTHER: 'bg-track-other',
    };
    return colors[track.track_type] || 'bg-track-other';
  };

  return (
    <div className="bg-bg-surface border border-border-subtle rounded-lg overflow-hidden">
      {/* Card Header (always visible) */}
      <div
        className="p-4 cursor-pointer hover:bg-bg-surface-raised transition-colors-fast"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Expand/collapse indicator */}
            <div className="text-text-secondary">
              {isExpanded ? '▼' : '▶'}
            </div>

            {/* Track type badge */}
            <span
              className={`px-2 py-1 rounded text-xs font-medium text-white ${getTrackTypeColor()}`}
            >
              {track.track_type.replace(/_/g, ' ')}
            </span>

            {/* Track name */}
            <span className="font-medium text-text-primary">{track.custom_name}</span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            {/* Balance */}
            <div className="text-right">
              <div className="text-text-secondary text-xs">Balance</div>
              <div className="text-text-primary font-mono">{formatCurrency(track.principal_balance)}</div>
            </div>

            {/* Rate */}
            <div className="text-right">
              <div className="text-text-secondary text-xs">Rate</div>
              <div className="text-text-primary font-mono">{formatPercent(track.annual_interest_rate)}</div>
            </div>

            {/* Term */}
            <div className="text-right">
              <div className="text-text-secondary text-xs">Term</div>
              <div className="text-text-primary font-mono">{track.remaining_term_months}mo</div>
            </div>
          </div>
        </div>
      </div>

      {/* Card Body (expanded form) */}
      {isExpanded && (
        <div className="p-4 border-t border-border-subtle bg-bg-surface-raised">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-lg font-medium text-text-primary">Edit Track</h3>
            <div className="flex gap-2">
              {/* Move Up */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp();
                }}
                disabled={!canMoveUp}
                className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move up"
              >
                ↑
              </button>

              {/* Move Down */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown();
                }}
                disabled={!canMoveDown}
                className="p-1 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                title="Move down"
              >
                ↓
              </button>

              {/* Duplicate */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicate();
                }}
                className="px-3 py-1 text-sm border border-border-subtle rounded text-text-secondary hover:text-text-primary hover:border-text-secondary transition-colors-fast"
                title="Duplicate track"
              >
                Duplicate
              </button>

              {/* Delete */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleDelete();
                }}
                className={`px-3 py-1 text-sm border rounded ${
                  deleteConfirm
                    ? 'bg-accent-danger border-accent-danger text-white'
                    : 'border-accent-danger text-accent-danger hover:bg-accent-danger hover:text-white'
                }`}
              >
                {deleteConfirm ? 'Confirm Delete?' : 'Delete'}
              </button>
            </div>
          </div>

          <TrackForm
            track={track}
            onUpdate={onUpdate}
            getFieldError={getFieldError}
          />


        </div>
      )}
    </div>
  );
}
