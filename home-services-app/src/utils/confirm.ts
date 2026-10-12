import { Alert, Platform } from 'react-native';
import i18n from '../i18n';

interface ConfirmOptions {
  confirmLabel?: string;
  destructive?: boolean;
}

/** Yes/no confirmation that also works in the web build (where Alert buttons are not supported). */
export function confirmAction(title: string, message: string, onConfirm: () => void, { confirmLabel, destructive }: ConfirmOptions = {}) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onConfirm();
    return;
  }
  Alert.alert(title, message, [
    { text: i18n.t('common.cancel'), style: 'cancel' },
    { text: confirmLabel || i18n.t('common.confirm'), style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}
