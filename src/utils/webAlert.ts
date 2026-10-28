// react-native-web ships Alert.alert as a no-op, so every confirm/info dialog silently did nothing on web.
// This maps it onto the browser's own dialogs.
import { Alert, AlertButton, Platform } from 'react-native';

export function installWebAlert() {
  if (Platform.OS !== 'web') return;
  Alert.alert = (title: string, message?: string, buttons?: AlertButton[]) => {
    const text = [title, message].filter(Boolean).join('\n\n');
    const btns = buttons ?? [];
    if (btns.length <= 1) {
      window.alert(text);
      btns[0]?.onPress?.();
      return;
    }
    const cancel = btns.find((b) => b.style === 'cancel');
    const actions = btns.filter((b) => b !== cancel);
    if (actions.length === 1) {
      // OK = the action button, Cancel = the cancel button
      (window.confirm(text) ? actions[0] : cancel)?.onPress?.();
      return;
    }
    // shortcut: 3+ choices use a numbered prompt, upgrade to a real in-app dialog if web gets more of these
    const choice = window.prompt(`${text}\n\n${actions.map((b, i) => `${i + 1}. ${b.text}`).join('\n')}\n\nType a number:`);
    const picked = actions[Number(choice) - 1];
    (picked ?? cancel)?.onPress?.();
  };
}
