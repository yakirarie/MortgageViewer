import { useState, useCallback, useEffect } from 'react';
import type { Profile, Track } from '../lib/types';
import { validateProfile, validateTrack } from '../lib/validation';
import { createDemoProfile, createEmptyProfile, createDefaultTrack, duplicateTrack } from '../lib/demo-profile';
import { downloadJson, uploadJson, getCurrentTimestamp } from '../lib/utils';
import { spitzerMonthlyPayment, spitzerMonthlyPaymentWithHistory } from '../lib/mortgage-math';


const STORAGE_KEY = 'mashkanta-profile';

export function useProfile() {
  const [profile, setProfile] = useState<Profile>(() => {
    // Try to load from localStorage on initialization
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (error) {
        console.error('Failed to load saved profile:', error);
        return createEmptyProfile();
      }
    }
    return createEmptyProfile();
  });
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  // Auto-save to localStorage whenever profile changes
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  }, [profile]);

  // Auto-calculate monthly payment when relevant fields change.
  // Prime tracks with a populated rate history use the historical timeline so
  // the amortization reflects actual BoI base-rate changes over the loan life.
  const autoCalculatePayment = useCallback((track: Track): Track => {
    if (!track.is_payment_manual_override && track.principal_balance > 0 && track.remaining_term_months > 0) {
      const hasHistory = track.track_type === 'PRIME' && track.rate_history && track.rate_history.length > 0;
      const calculatedPayment = hasHistory
        ? spitzerMonthlyPaymentWithHistory(track)
        : spitzerMonthlyPayment(
            track.principal_balance,
            track.annual_interest_rate,
            track.remaining_term_months
          );
      return { ...track, monthly_repayment: calculatedPayment };
    }
    return track;
  }, []);


  // Auto-calculate notice fee when balance changes (0.15% of balance)
  const autoCalculateNoticeFee = useCallback((track: Track): Track => {
    // Only auto-calculate if the user hasn't manually set it
    // We track this by checking if it's exactly 0.15% of balance
    const expectedAutoFee = track.principal_balance * 0.0015;
    const tolerance = 0.01; // Small tolerance for floating point
    
    if (Math.abs(track.notice_fee - expectedAutoFee) < tolerance || track.notice_fee === 0) {
      return { ...track, notice_fee: expectedAutoFee };
    }
    return track;
  }, []);

  // Update profile
  const updateProfile = useCallback((updates: Partial<Profile>) => {
    setProfile((prev) => {
      const updated = { ...prev, ...updates };
      const validation = validateProfile(updated);
      
      if (!validation.isValid) {
        const errors: Record<string, string> = {};
        validation.errors.forEach((error) => {
          const key = error.trackId ? `${error.trackId}-${error.field}` : error.field;
          errors[key] = error.message;
        });
        setValidationErrors(errors);
      } else {
        setValidationErrors({});
      }
      
      return updated;
    });
  }, []);

  // Add new track
  const addTrack = useCallback((trackType: string = 'PRIME') => {
    setProfile((prev) => {
      if (prev.tracks.length >= 8) {
        return prev; // Max 8 tracks per PRD
      }
      
      const newTrack = autoCalculatePayment(autoCalculateNoticeFee(createDefaultTrack(trackType)));
      return {
        ...prev,
        tracks: [...prev.tracks, newTrack],
      };
    });
  }, [autoCalculatePayment, autoCalculateNoticeFee]);

  // Update track
  const updateTrack = useCallback((trackId: string, updates: Partial<Track>) => {
    setProfile((prev) => {
      const updatedTracks = prev.tracks.map((track) => {
        if (track.track_id !== trackId) return track;
        
        let updated = { ...track, ...updates };
        
        // Set manual override flag if user edited monthly payment directly
        if (updates.monthly_repayment !== undefined && updates.monthly_repayment !== track.monthly_repayment) {
          updated.is_payment_manual_override = true;
        }
        
        // Auto-calculate payment if not manually overridden
        updated = autoCalculatePayment(updated);
        
        // Auto-calculate notice fee
        updated = autoCalculateNoticeFee(updated);
        
        // Validate the track
        const validation = validateTrack(updated);
        if (!validation.isValid) {
          const errors: Record<string, string> = { ...validationErrors };
          validation.errors.forEach((error) => {
            const key = `${error.trackId}-${error.field}`;
            errors[key] = error.message;
          });
          setValidationErrors(errors);
        } else {
          // Clear errors for this track
          const newErrors = { ...validationErrors };
          Object.keys(newErrors).forEach((key) => {
            if (key.startsWith(`${trackId}-`)) {
              delete newErrors[key];
            }
          });
          setValidationErrors(newErrors);
        }
        
        return updated;
      });
      
      return { ...prev, tracks: updatedTracks };
    });
  }, [autoCalculatePayment, autoCalculateNoticeFee, validationErrors]);

  // Delete track
  const deleteTrack = useCallback((trackId: string) => {
    setProfile((prev) => ({
      ...prev,
      tracks: prev.tracks.filter((t) => t.track_id !== trackId),
    }));
  }, []);

  // Duplicate track
  const duplicateTrackById = useCallback((trackId: string) => {
    setProfile((prev) => {
      if (prev.tracks.length >= 8) return prev;
      
      const trackToDuplicate = prev.tracks.find((t) => t.track_id === trackId);
      if (!trackToDuplicate) return prev;
      
      const duplicated = duplicateTrack(trackToDuplicate);
      return {
        ...prev,
        tracks: [...prev.tracks, duplicated],
      };
    });
  }, []);

  // Reorder tracks
  const reorderTracks = useCallback((fromIndex: number, toIndex: number) => {
    setProfile((prev) => {
      const tracks = [...prev.tracks];
      const [movedTrack] = tracks.splice(fromIndex, 1);
      tracks.splice(toIndex, 0, movedTrack);
      return { ...prev, tracks };
    });
  }, []);

  // Recalculate payment for a track (clears manual override)
  const recalculatePayment = useCallback((trackId: string) => {
    updateTrack(trackId, {
      is_payment_manual_override: false,
      monthly_repayment: 0, // Will be auto-calculated
    });
  }, [updateTrack]);

  // Load demo profile
  const loadDemoProfile = useCallback(() => {
    const demo = createDemoProfile();
    // Auto-calculate payments for all tracks
    const tracksWithPayments = demo.tracks.map((track) =>
      autoCalculatePayment(autoCalculateNoticeFee(track))
    );
    setProfile({ ...demo, tracks: tracksWithPayments });
    setValidationErrors({});
  }, [autoCalculatePayment, autoCalculateNoticeFee]);

  // Clear all tracks
  const clearAllTracks = useCallback(() => {
    setProfile((prev) => ({
      ...prev,
      tracks: [],
      profile_name: 'My Mashkanta',
      created_at: getCurrentTimestamp(),
    }));
    setValidationErrors({});
  }, []);

  // Reset to empty profile (clears localStorage too)
  const resetProfile = useCallback(() => {
    const empty = createEmptyProfile();
    setProfile(empty);
    setValidationErrors({});
    localStorage.removeItem(STORAGE_KEY);
  }, []);

  // Export profile to JSON
  const exportProfile = useCallback(() => {
    const filename = `mashkanta-profile-${new Date().toISOString().split('T')[0]}.json`;
    downloadJson(profile, filename);
  }, [profile]);

  // Import profile from JSON
  const importProfile = useCallback(async (file: File) => {
    try {
      const data = await uploadJson(file);
      const importedProfile = data as Profile;
      
      // Validate the imported profile
      const validation = validateProfile(importedProfile);
      if (!validation.isValid) {
        const errors: Record<string, string> = {};
        validation.errors.forEach((error) => {
          const key = error.trackId ? `${error.trackId}-${error.field}` : error.field;
          errors[key] = error.message;
        });
        setValidationErrors(errors);
        throw new Error('Invalid profile format');
      }
      
      // Auto-calculate payments for imported tracks
      const tracksWithPayments = importedProfile.tracks.map((track) =>
        autoCalculatePayment(autoCalculateNoticeFee(track))
      );
      
      setProfile({ ...importedProfile, tracks: tracksWithPayments });
      setValidationErrors({});
    } catch (error) {
      throw error;
    }
  }, [autoCalculatePayment, autoCalculateNoticeFee]);

  // Get validation error for a specific field
  const getFieldError = useCallback((trackId: string | null, field: string): string | undefined => {
    const key = trackId ? `${trackId}-${field}` : field;
    return validationErrors[key];
  }, [validationErrors]);

  return {
    profile,
    validationErrors,
    updateProfile,
    addTrack,
    updateTrack,
    deleteTrack,
    duplicateTrackById,
    reorderTracks,
    recalculatePayment,
    loadDemoProfile,
    clearAllTracks,
    resetProfile,
    exportProfile,
    importProfile,
    getFieldError,
  };
}
