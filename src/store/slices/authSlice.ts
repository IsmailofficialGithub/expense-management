// src/store/slices/authSlice.ts
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { User } from '@supabase/supabase-js';
import { authService, profileService } from '../../services/supabase.service';
import { Profile, SignUpData, SignInData } from '../../types/database.types';

import { storageService } from '../../services/storage.service';

interface AuthState {
  user: User | null;
  profile: Profile | null;
  isAuthenticated: boolean;
  loading: boolean;
  error: string | null;
  initialized: boolean;
  isPasswordReset: boolean;
}

const initialState: AuthState = {
  user: null,
  profile: null,
  isAuthenticated: false,
  loading: false,
  error: null,
  initialized: false,
  isPasswordReset: false,
};

// Async Thunks
export const signUp = createAsyncThunk(
  'auth/signUp',
  async (data: SignUpData, { rejectWithValue }) => {
    try {
      const result = await authService.signUp(data.email, data.password, data.full_name, data.invitationToken);
      // After signup, user is signed out and must verify email
      // Return null user to indicate no auto-login
      return { user: null, profile: null, requiresVerification: true };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Sign up failed');
    }
  }
);

export const signIn = createAsyncThunk(
  'auth/signIn',
  async (data: SignInData, { rejectWithValue }) => {
    try {
      const result = await authService.signIn(data.email, data.password);
      if (result.user) {
        // Verify profile exists in public.profiles table
        // This ensures the user is a valid application user
        const profile = await profileService.getProfile(result.user.id);

        if (!profile) {
          // If auth exists but no profile, this is an invalid state
          // Sign out immediately and inform the user
          await authService.signOut();
          throw new Error('User profile not found in database. Please contact support.');
        }

        await storageService.setProfile(profile);
        return { user: result.user, profile };
      }
      throw new Error('Sign in failed: No user returned');
    } catch (error: any) {
      return rejectWithValue(error.message || 'Sign in failed');
    }
  }
);

export const signOut = createAsyncThunk(
  'auth/signOut',
  async (_, { rejectWithValue }) => {
    try {
      await authService.signOut();
      await storageService.clearAll();
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const initializeAuth = createAsyncThunk(
  'auth/initialize',
  async (_, { rejectWithValue }) => {
    try {
      const user = await authService.getCurrentUser();
      if (user) {
        let profile = null;
        try {
          profile = await profileService.getProfile(user.id);
        } catch (profileError) {
          console.warn('Failed to fetch profile from Supabase, trying cache:', profileError);
        }

        if (!profile) {
          // Fallback to cache if network request failed or returned null (though getProfile usually handles null)
          const cachedProfile = await storageService.getProfile();
          if (cachedProfile && cachedProfile.id === user.id) {
            profile = cachedProfile;
            console.log('Restored profile from cache');
          }
        }

        if (!profile) {
          // If still no profile (neither in DB nor cache), then it's a critical auth error
          // Only sign out if we really think the session is invalid, but for now safe to fail 
          // However, if we are offline and have no cache, user is stuck. 
          // But strict mode requires a profile.

          // Check if it was definitely a missing profile (406/PGRST116) vs network error?
          // For safety, if we can't find a profile, logging out is the only way to recover strictly,
          // BUT this breaks offline usage if cache is empty.
          // Assuming cache is populated on login.

          console.warn('Session found but profile missing (and no cache).');

          // Only logout if we are sure it's not a temporary network issue?
          // If we are offline, profileService.getProfile might throw.
          // If we are offline and no cache, we can't let them in as we need profile data.

          await authService.signOut();
          await storageService.clearAll();
          return { user: null, profile: null };
        }

        await storageService.setProfile(profile);
        return { user, profile };
      }
      return { user: null, profile: null };
    } catch (error: any) {
      return rejectWithValue(error.message || 'Failed to initialize auth');
    }
  }
);

export const updateProfile = createAsyncThunk(
  'auth/updateProfile',
  async (updates: Partial<Profile>, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      if (!state.auth.user) throw new Error('Not authenticated');

      const updatedProfile = await profileService.updateProfile(
        state.auth.user.id,
        updates
      );
      await storageService.setProfile(updatedProfile);
      return updatedProfile;
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

export const uploadAvatar = createAsyncThunk(
  'auth/uploadAvatar',
  async (imageUri: string, { rejectWithValue }) => {
    try {
      return await profileService.uploadAvatar(imageUri);
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setUser: (state, action: PayloadAction<{ user: User | null; profile: Profile | null }>) => {
      state.user = action.payload.user;
      state.profile = action.payload.profile;
      state.isAuthenticated = !!action.payload.user;
    },
    setProfileFromCache: (state, action: PayloadAction<Profile>) => {
      state.profile = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
    setPasswordReset: (state, action: PayloadAction<boolean>) => {
      state.isPasswordReset = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Sign Up
    builder.addCase(signUp.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(signUp.fulfilled, (state, action) => {
      state.loading = false;
      // Don't set user - user must verify email and log in manually
      state.user = null;
      state.profile = null;
      state.isAuthenticated = false;
      // Store verification message in error field (will be shown as success message)
      state.error = action.payload.requiresVerification
        ? 'VERIFICATION_REQUIRED'
        : null;
    });
    builder.addCase(signUp.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Sign In
    builder.addCase(signIn.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(signIn.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.profile = action.payload.profile;
      state.isAuthenticated = true;
    });
    builder.addCase(signIn.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
    });

    // Sign Out
    builder.addCase(signOut.fulfilled, (state) => {
      state.user = null;
      state.profile = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.error = null;
    });

    // Initialize
    builder.addCase(initializeAuth.pending, (state) => {
      state.loading = true;
    });
    builder.addCase(initializeAuth.fulfilled, (state, action) => {
      state.loading = false;
      state.user = action.payload.user;
      state.profile = action.payload.profile;
      state.isAuthenticated = !!action.payload.user;
      state.initialized = true;
    });
    builder.addCase(initializeAuth.rejected, (state) => {
      state.loading = false;
      state.initialized = true;
    });

    // Update Profile
    builder.addCase(updateProfile.fulfilled, (state, action) => {
      state.profile = action.payload;
    });

    // Upload Avatar
    builder.addCase(uploadAvatar.fulfilled, (state, action) => {
      if (state.profile) {
        state.profile.avatar_url = action.payload;
      }
    });
  },
});

export const { setUser, clearError, setProfileFromCache, setPasswordReset } = authSlice.actions;
export default authSlice.reducer;