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
