import AsyncStorage from '@react-native-async-storage/async-storage';
import { API } from '../config/api';
import i18n from '../i18n';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type Options = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  form?: FormData;
  timeoutMs?: number;
};

/** Authenticated JSON request to the ServeHome API with friendly errors and a timeout. */
export async function apiFetch<T = any>(path: string, { method = 'GET', body, form, timeoutMs = 20000 }: Options = {}): Promise<T> {
  const token = await AsyncStorage.getItem('jwt_token');
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(i18n.t('workflow.errors.network'), 0, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!res.ok) {
    const code = data?.code as string | undefined;
    const message = code === 'COMMUNICATION_LOCKED' ? i18n.t('workflow.errors.locked') : data?.error || i18n.t('workflow.errors.generic');
    throw new ApiError(message, res.status, code);
  }
  return data as T;
}

/** Appends a picked image to FormData on web (Blob) and native ({ uri }). */
export async function appendFile(form: FormData, field: string, asset: { uri: string; mimeType?: string | null; fileName?: string | null }) {
  const type = asset.mimeType || 'image/jpeg';
  const name = asset.fileName || `upload.${type.split('/')[1] || 'jpg'}`;
  if (typeof document !== 'undefined') {
    const blob = await (await fetch(asset.uri)).blob();
    form.append(field, blob, name);
  } else {
    form.append(field, { uri: asset.uri, type, name } as any);
  }
}
