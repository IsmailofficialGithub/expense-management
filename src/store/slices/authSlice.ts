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
        await storageService.storage.set('user', result.user);

        // Fetch profile with timeout to prevent hanging
        let profile = null;
        const PROFILE_FETCH_TIMEOUT = 3000; // 3 seconds max
        
        try {
          // Wrap profile fetch in a timeout to prevent hanging
          const profilePromise = profileService.getProfile(result.user.id);
          const timeoutPromise = new Promise<null>((resolve) => {
            setTimeout(() => {
              console.warn('[Auth] Profile fetch timeout - network call may be hanging');
              resolve(null);
            }, PROFILE_FETCH_TIMEOUT);
          });

          profile = await Promise.race([profilePromise, timeoutPromise]);
          
          if (profile) {
            console.log('[Auth] Profile fetched successfully');
          } else {
            console.warn('[Auth] Profile fetch timed out or returned null');
          }
        } catch (e) {
          console.warn("[Auth] Profile fetch failed during login:", e);
        }

        // Try to load from cache if network fetch failed or timed out
        if (!profile) {
          try {
            const cachedProfile = await storageService.getProfile();
            if (cachedProfile && cachedProfile.id === result.user.id) {
              profile = cachedProfile;
              console.log('[Auth] Using cached profile');
            }
          } catch (cacheError) {
            console.warn('[Auth] Failed to load cached profile:', cacheError);
          }
        }

        // Allow login to proceed even if profile is null
        // Profile can be fetched later or created if missing
        if (profile) {
          await storageService.setProfile(profile);
        } else {
          console.warn('[Auth] No profile found (neither from API nor cache). Login will proceed with null profile.');
        }

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
    // Wrap entire initialization in a timeout to ensure it always completes
    const INIT_TIMEOUT = 5000; // 5 seconds max for entire initialization
    
    const initPromise = (async () => {
      try {
        console.log('🔵 [AUTH INIT] Starting auth initialization...');
        console.log('🔵 [AUTH INIT] Timestamp:', new Date().toISOString());

        // Retry mechanism to handle async session loading from AsyncStorage
        // Supabase needs time to load the session from storage
        let user = null;
        const maxRetries = 2; // Reduced retries since getCurrentUser already has timeout
        const retryDelay = 200; // ms

        for (let i = 0; i < maxRetries; i++) {
          console.log(`🔵 [AUTH INIT] Attempt ${i + 1}/${maxRetries} - Getting current user...`);
          const startTime = Date.now();

          try {
            user = await authService.getCurrentUser();

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
          
          // Fetch profile with timeout to prevent hanging
          const PROFILE_FETCH_TIMEOUT = 2000; // 2 seconds max
          try {
            const profileStartTime = Date.now();
            const profilePromise = profileService.getProfile(user.id);
            const timeoutPromise = new Promise<null>((resolve) => {
              setTimeout(() => {
                console.warn('⚠️ [AUTH INIT] Profile fetch timeout');
                resolve(null);
              }, PROFILE_FETCH_TIMEOUT);
            });
            
            profile = await Promise.race([profilePromise, timeoutPromise]);
            
            if (profile) {
              const profileDuration = Date.now() - profileStartTime;
              console.log(`✅ [AUTH INIT] Profile fetched in ${profileDuration}ms`);
              console.log('✅ [AUTH INIT] Profile name:', profile?.full_name);
            }
          } catch (profileError) {
            console.error('❌ [AUTH INIT] Failed to fetch profile from Supabase:', profileError);
            console.log('🔶 [AUTH INIT] Trying to load profile from cache...');
          }

          if (!profile) {
            // Fallback to cache
            try {
              const cachedProfile = await storageService.getProfile();
              if (cachedProfile && cachedProfile.id === user.id) {
                profile = cachedProfile;
                console.log('✅ [AUTH INIT] Restored profile from cache');
                console.log('✅ [AUTH INIT] Cached profile name:', profile?.full_name);
              } else {
                console.log('⚠️ [AUTH INIT] No matching cached profile found');
              }
            } catch (cacheError) {
              console.warn('⚠️ [AUTH INIT] Failed to load cached profile:', cacheError);
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
        // Return null user instead of rejecting to ensure initialized is set
        return { user: null, profile: null };
      }
    })();

    // Race with timeout to ensure thunk always completes
    const timeoutPromise = new Promise<{ user: null; profile: null }>((resolve) => {
      setTimeout(() => {
        console.warn('⚠️ [AUTH INIT] Overall timeout - initialization taking too long, proceeding with no user');
        resolve({ user: null, profile: null });
      }, INIT_TIMEOUT);
    });

    return await Promise.race([initPromise, timeoutPromise]);
  }
);
  })();

    // Race with timeout to ensure thunk always completes
    const timeoutPromise = new Promise<{ user: null; profile: null }>((resolve) => {
      setTimeout(() => {
        console.warn('[initializeAuth] Overall timeout - initialization taking too long, proceeding with no user');
        resolve({ user: null, profile: null });
      }, INIT_TIMEOUT);
    });

    return await Promise.race([initPromise, timeoutPromise]);
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