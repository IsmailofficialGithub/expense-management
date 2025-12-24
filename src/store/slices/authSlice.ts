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
        // Save user to local storage for offline access
        // We need to add setUser/getUser to storageService first (I'll add it in next step, but let's assume it exists or use generic set)
        // actually I will use storageService.storage.set('user', result.user) directly or similar if I can't change storageService here.
        // But better to update storageService first.
        // I will assume I will update storageService in the next step.
        // For now, let's keep the flow.

        let profile = null;
        try {
          profile = await profileService.getProfile(result.user.id);
        } catch (e) {
          console.warn("Profile fetch failed during login", e);
        }

        if (!profile) {
          // Try to load from cache if network failed
          const cachedProfile = await storageService.getProfile();
          if (cachedProfile && cachedProfile.id === result.user.id) {
            profile = cachedProfile;
          }
        }

        // If still no profile, we can't strictly validate, but if we are ONLINE and it's missing, that's bad.
        // But if we are offline (which signIn usually isn't, but maybe flaky), we might want to proceed?
        // Actually signIn requires online.
        // So if profile is missing after online sign in, it's a database issue. 
        // BUT, we should try to not block the user if possible? 
        // No, strict requirement: "User profile not found" IS an error for new users.
        if (!profile) {
          // Retry one more time? Or just fail.
          // If this is a new user, profile SHOULD exist. 
          // Error out.
          if (!profile) {
            // Check if it's a network error vs 404
            // We will throw, but user said "stuck on loading".
            // Throwing stops the loading spinner in LoginScreen (catch block).
            throw new Error('User profile could not be loaded. Please check your connection.');
          }
        }

        await storageService.setProfile(profile);
        // We'll also store the user token/session implicitly via supabase, but let's store the user object explicitly for our offline fallback
        await storageService.storage.set('user', result.user);

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
      let user = await authService.getCurrentUser();

      // FALLBACK: If Supabase returns null (offline), try our local backup
      if (!user) {
        try {
          const cachedUser = await storageService.storage.get<User>('user');
          if (cachedUser) {
            console.log('Restored user from local backup (Offline Mode)');
            user = cachedUser;
          }
        } catch (e) {
          console.warn('Failed to restore user backup', e);
        }
      }

      if (user) {
        let profile = null;
        try {
          profile = await profileService.getProfile(user.id);
        } catch (profileError) {
          console.warn('Failed to fetch profile from Supabase, trying cache:', profileError);
        }

        if (!profile) {
          // Fallback to cache
          const cachedProfile = await storageService.getProfile();
          if (cachedProfile && cachedProfile.id === user.id) {
            profile = cachedProfile;
            console.log('Restored profile from cache');
          }
        }

        if (!profile) {
          console.warn('Session found but profile missing (and no cache). Likely offline or first login issue.');
          return { user, profile: null };
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