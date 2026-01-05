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
      console.log('🔵 [AUTH INIT] Starting auth initialization...');
      console.log('🔵 [AUTH INIT] Timestamp:', new Date().toISOString());

      // Retry mechanism to handle async session loading from AsyncStorage
      // Supabase needs time to load the session from storage
      let user = null;
      const maxRetries = 3;
      const retryDelay = 200; // ms

      for (let i = 0; i < maxRetries; i++) {
        console.log(`🔵 [AUTH INIT] Attempt ${i + 1}/${maxRetries} - Getting current user...`);
        const startTime = Date.now();

        try {
          // Add timeout to prevent hanging forever (especially on web)
          const timeoutMs = 5000; // 5 second timeout
          const userPromise = authService.getCurrentUser();
          const timeoutPromise = new Promise<null>((_, reject) =>
            setTimeout(() => reject(new Error('getCurrentUser timeout')), timeoutMs)
          );

          user = await Promise.race([userPromise, timeoutPromise]);

          const duration = Date.now() - startTime;
          console.log(`🔵 [AUTH INIT] Attempt ${i + 1} completed in ${duration}ms`);

          if (user) {
            console.log('✅ [AUTH INIT] User session found on attempt', i + 1);
            console.log('✅ [AUTH INIT] User ID:', user.id);
            console.log('✅ [AUTH INIT] User email:', user.email);
            break;
          }
        } catch (error: any) {
          const duration = Date.now() - startTime;
          console.error(`❌ [AUTH INIT] Attempt ${i + 1} failed after ${duration}ms:`, error.message);

          // If it's a timeout and not the last retry, continue to next attempt
          if (i < maxRetries - 1) {
            console.log(`⏳ [AUTH INIT] Retrying after error...`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          // On last retry, break and try cache
          console.warn('⚠️ [AUTH INIT] All getCurrentUser attempts failed, will try cache');
          break;
        }

        // If no user found and not the last retry, wait a bit
        if (!user && i < maxRetries - 1) {
          console.log(`⏳ [AUTH INIT] No session yet, retrying in ${retryDelay}ms...`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }

      // FALLBACK: If Supabase returns null (offline), try our local backup
      if (!user) {
        console.log('🔶 [AUTH INIT] No user from Supabase, checking local backup...');
        try {
          const cachedUser = await storageService.storage.get<User>('user');
          if (cachedUser) {
            console.log('✅ [AUTH INIT] Restored user from local backup (Offline Mode)');
            console.log('✅ [AUTH INIT] Cached user ID:', cachedUser.id);
            user = cachedUser;
          } else {
            console.log('⚠️ [AUTH INIT] No cached user found in local storage');
          }
        } catch (e) {
          console.error('❌ [AUTH INIT] Failed to restore user backup:', e);
        }
      }

      if (user) {
        console.log('🔵 [AUTH INIT] User authenticated, fetching profile...');
        let profile = null;
        try {
          const profileStartTime = Date.now();
          profile = await profileService.getProfile(user.id);
          const profileDuration = Date.now() - profileStartTime;
          console.log(`✅ [AUTH INIT] Profile fetched in ${profileDuration}ms`);
          console.log('✅ [AUTH INIT] Profile name:', profile?.full_name);
        } catch (profileError) {
          console.error('❌ [AUTH INIT] Failed to fetch profile from Supabase:', profileError);
          console.log('🔶 [AUTH INIT] Trying to load profile from cache...');
        }

        if (!profile) {
          // Fallback to cache
          const cachedProfile = await storageService.getProfile();
          if (cachedProfile && cachedProfile.id === user.id) {
            profile = cachedProfile;
            console.log('✅ [AUTH INIT] Restored profile from cache');
            console.log('✅ [AUTH INIT] Cached profile name:', profile?.full_name);
          } else {
            console.log('⚠️ [AUTH INIT] No matching cached profile found');
          }
        }

        if (!profile) {
          console.warn('⚠️ [AUTH INIT] Session found but profile missing (and no cache). Likely offline or first login issue.');
          return { user, profile: null };
        }

        await storageService.setProfile(profile);
        console.log('✅ [AUTH INIT] Auth initialization completed successfully');
        console.log('✅ [AUTH INIT] Returning user:', user.id, 'profile:', profile.full_name);
        return { user, profile };
      }

      console.log('ℹ️ [AUTH INIT] No user session found, user is logged out');
      return { user: null, profile: null };
    } catch (error: any) {
      console.error('❌ [AUTH INIT] Critical error during initialization:', error);
      console.error('❌ [AUTH INIT] Error message:', error.message);
      console.error('❌ [AUTH INIT] Error stack:', error.stack);
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
      state.initialized = true; // Mark as initialized when auth state changes
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
    builder.addCase(signOut.pending, (state) => {
      state.loading = true;
      state.error = null;
    });
    builder.addCase(signOut.fulfilled, (state) => {
      state.user = null;
      state.profile = null;
      state.isAuthenticated = false;
      state.loading = false;
      state.error = null;
    });
    builder.addCase(signOut.rejected, (state, action) => {
      state.loading = false;
      state.error = action.payload as string;
      // Even if sign out fails, clear the auth state
      state.user = null;
      state.profile = null;
      state.isAuthenticated = false;
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