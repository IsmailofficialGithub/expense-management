// Switch between the normal app and the super admin portal (/mikasa/go, web only).
import Constants from 'expo-constants';
import { Linking, Platform } from 'react-native';

const ADMIN_PATH = '/mikasa/go';
const WEB_URL: string = Constants.expoConfig?.extra?.WEB_URL ?? 'https://flatmate.ismailabbasi.qzz.io';

// Web: same site, full page load (the portal is chosen at page load). Phone app: opens the portal in the browser.
export function openAdminPortal() {
  if (Platform.OS === 'web') window.location.assign(ADMIN_PATH);
  else Linking.openURL(`${WEB_URL}${ADMIN_PATH}`);
}

export function openNormalApp() {
  window.location.assign('/');
}

// App storage is wiped on sign-out (AsyncStorage.clear = localStorage.clear on web), which would also drop the
// admin portal's own token. Run fn and put that token back.
const ADMIN_TOKEN_KEY = 'admin_access_token';
async function keepingAdminToken(fn: () => Promise<unknown>) {
  let token: string | null = null;
  try { token = localStorage.getItem(ADMIN_TOKEN_KEY); } catch { /* private mode */ }
  try { await fn(); } finally {
    try { if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token); } catch { /* private mode */ }
  }
}

// Admin "log in as": drop the current app session and its cached data, store the user's session, open the app.
export async function startImpersonation(session: { accessToken: string; refreshToken: string; user: { id: string; email: string; imp?: string } }) {
  const { authService } = await import('../services/domain/auth');
  const { storageService } = await import('../services/storage.service');
  const { setSession } = await import('../services/api');
  await keepingAdminToken(async () => {
    await authService.signOut();
    await storageService.clearAll();
  });
  await setSession(session);
  window.location.assign('/');
}

// Leave a "log in as" session: sign that user out and go back to the admin portal's Users page.
export async function endImpersonation() {
  const { authService } = await import('../services/domain/auth');
  const { storageService } = await import('../services/storage.service');
  await keepingAdminToken(async () => {
    await authService.signOut();
    await storageService.clearAll();
  });
  window.location.assign(`${ADMIN_PATH}/users`);
}
