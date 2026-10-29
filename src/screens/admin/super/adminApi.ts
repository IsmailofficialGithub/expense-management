// Admin API client: its own token, kept apart from the normal app session.
import { API_URL, ApiError, qs } from '../../../services/api';

const KEY = 'admin_access_token';
const store = {
  get: () => { try { return localStorage.getItem(KEY); } catch { return null; } },
  set: (t: string | null) => { try { t ? localStorage.setItem(KEY, t) : localStorage.removeItem(KEY); } catch { /* private mode */ } },
};

let onLogout: () => void = () => {};
export const setOnAdminLogout = (fn: () => void) => { onLogout = fn; };
export const hasAdminToken = () => !!store.get();
export const adminLogout = () => { store.set(null); onLogout(); };

async function request<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const token = store.get();
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : null; } catch { data = { error: text.slice(0, 200) }; }
  // Admin tokens can't be refreshed (adm claim isn't kept on refresh): expired means log in again.
  if ((res.status === 401 || res.status === 403) && token && !path.startsWith('/admin/login') && !path.startsWith('/admin/verify')) adminLogout();
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  return data as T;
}

export const adminApi = {
  get: <T = any>(path: string, params: Record<string, unknown> = {}) => request<T>('GET', path + qs(params)),
  post: <T = any>(path: string, body: unknown = {}) => request<T>('POST', path, body),
  patch: <T = any>(path: string, body: unknown = {}) => request<T>('PATCH', path, body),
  del: <T = any>(path: string) => request<T>('DELETE', path),
  login: (email: string, password: string) => request('POST', '/admin/login', { email, password }),
  verify: async (email: string, code: string) => {
    const s = await request<{ accessToken: string }>('POST', '/admin/verify', { email, code });
    store.set(s.accessToken);
  },
};

// List endpoints may return an array or { rows|items|data, total }.
export function listOf(res: any): { rows: any[]; total?: number } {
  if (Array.isArray(res)) return { rows: res };
  return { rows: res?.rows ?? res?.items ?? res?.data ?? [], total: res?.total };
}
