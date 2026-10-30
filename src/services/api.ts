// src/services/api.ts — client for our Fastify backend (replaces the Supabase client)
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const API_URL: string = Constants.expoConfig?.extra?.API_URL ?? 'https://api.flatmate.ismailabbasi.qzz.io';

const REFRESH_KEY = 'auth_refresh_token';
const USER_KEY = 'auth_user';

export type AuthUser = { id: string; email: string };

// SecureStore has no web implementation; in the browser the refresh token lives in localStorage (via AsyncStorage).
const tokenStore = Platform.OS === 'web'
  ? { get: AsyncStorage.getItem, set: AsyncStorage.setItem, del: AsyncStorage.removeItem }
  : { get: SecureStore.getItemAsync, set: SecureStore.setItemAsync, del: SecureStore.deleteItemAsync };

export const getRefreshToken = () => tokenStore.get(REFRESH_KEY);

let accessToken: string | null = null;
let currentUser: AuthUser | null = null;
let refreshing: Promise<boolean> | null = null;
const authListeners = new Set<(user: AuthUser | null) => void>();

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

export async function setSession(s: { accessToken: string; refreshToken: string; user: AuthUser }) {
  accessToken = s.accessToken;
  currentUser = s.user;
  await tokenStore.set(REFRESH_KEY, s.refreshToken);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(s.user));
  authListeners.forEach((l) => l(s.user));
}

export async function clearSession() {
  accessToken = null;
  currentUser = null;
  await tokenStore.del(REFRESH_KEY);
  await AsyncStorage.removeItem(USER_KEY);
  authListeners.forEach((l) => l(null));
}

// Offline-friendly: returns the stored user without a network call (like supabase.auth.getSession).
export async function getStoredUser(): Promise<AuthUser | null> {
  if (currentUser) return currentUser;
  const raw = await AsyncStorage.getItem(USER_KEY);
  currentUser = raw ? JSON.parse(raw) : null;
  return currentUser;
}

// Drop-in for `supabase.auth.getUser()` call sites: throws when logged out.
export async function requireUser(): Promise<AuthUser> {
  const user = await getStoredUser();
  if (!user) throw new ApiError(401, 'Not authenticated');
  return user;
}

export function onAuthChange(listener: (user: AuthUser | null) => void) {
  authListeners.add(listener);
  return () => authListeners.delete(listener);
}

async function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return false;
    try {
      const res = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.status === 401) {
        await clearSession();
        return false;
      }
      if (!res.ok) return false;
      await setSession(await res.json());
      return true;
    } catch {
      return false; // offline: keep the stored session
    }
  })().finally(() => { refreshing = null; });
  return refreshing;
}

// Drop the cached access token and refresh (e.g. the realtime socket was rejected with an expired token).
export async function forceRefresh() {
  accessToken = null;
  return refresh();
}

export async function getAccessToken(): Promise<string | null> {
  if (!accessToken) await refresh();
  return accessToken;
}

export async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  let sentToken: string | null = null;
  const send = async () => {
    const token = sentToken = await getAccessToken();
    const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
    return fetch(`${API_URL}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined && !isForm ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    });
  };
  let res = await send();
  // Retry once per request that carried a token. Concurrent 401s share one refresh (see refresh()); only the
  // token that actually failed is dropped, so a newer token another request already got is kept.
  if (res.status === 401 && sentToken) {
    if (accessToken === sentToken) accessToken = null;
    if (accessToken || await refresh()) res = await send();
  }
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  return data as T;
}

export const api = {
  get: <T = any>(path: string) => request<T>('GET', path),
  post: <T = any>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T = any>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  put: <T = any>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T = any>(path: string) => request<T>('DELETE', path),
};

// Upload a local image URI (expo-image-picker etc.) to a bucket; server compresses it to webp.
export async function uploadImage(bucket: 'avatars' | 'receipts' | 'chat', uri: string, mimeType = 'image/jpeg') {
  const form = new FormData();
  form.append('file', { uri, name: uri.split('/').pop() || 'image.jpg', type: mimeType } as any);
  const { url } = await request<{ url: string }>('POST', `/uploads/${bucket}`, form);
  return url;
}

export const qs = (params: Record<string, unknown>) => {
  const p = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '');
  return p.length ? `?${p.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')}` : '';
};
