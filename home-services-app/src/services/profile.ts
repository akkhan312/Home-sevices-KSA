import { Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import i18n from '../i18n';
import { apiFetch, appendFile } from './apiClient';
import { toAbsoluteUrl } from '../config/api';
import { useAuthStore } from '../store/authStore';

/** Lets the user pick a square photo and uploads it as their profile picture. Returns the new URL. */
export async function pickAndUploadAvatar(): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert(i18n.t('wizard.details.permissionTitle'), i18n.t('wizard.details.permissionBody'));
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
  if (result.canceled || !result.assets[0]) return null;

  const form = new FormData();
  await appendFile(form, 'image', result.assets[0]);
  const data = await apiFetch('/users/profile-picture', { method: 'POST', form, timeoutMs: 60000 });
  const url = toAbsoluteUrl(data.profilePicture);
  const { user, setUser } = useAuthStore.getState();
  if (user) await setUser({ ...user, profilePicture: url });
  return url;
}
