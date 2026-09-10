import axios, {
  AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8001/api/v1';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export class ApiClientError extends Error {
  status: number;
  detail: string;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ApiClientError';
    this.status = status;
    this.detail = detail;
  }
}

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    new RegExp(`(?:^|;\\s*)${name}=([^;]+)`),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function getCsrfToken(): string {
  return readCookie('csrf_token') ?? '';
}

function extractDetail(body: unknown): { message: string; isPermission: boolean } {
  if (body && typeof body === 'object' && 'detail' in body) {
    const detail = (body as { detail: unknown }).detail;
    if (typeof detail === 'string') return { message: detail, isPermission: detail.toLowerCase().includes('permission') };
    if (Array.isArray(detail)) {
      const msgs = detail
        .map((item: unknown) => {
          if (typeof item === 'string') return item;
          if (item && typeof item === 'object' && 'msg' in item) return String((item as { msg: unknown }).msg);
          return JSON.stringify(item);
        })
        .filter(Boolean);
      return { message: msgs.join('; ') || 'Request failed', isPermission: false };
    }
  }
  return { message: 'Request failed', isPermission: false };
}

function toApiClientError(error: unknown): ApiClientError {
  if (error instanceof ApiClientError) return error;

  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError;
    const status = axiosError.response?.status ?? 0;
    const body = axiosError.response?.data;
    if (body !== undefined && body !== null) {
      const { message, isPermission } = extractDetail(body);
      const clientError = new ApiClientError(status, message);
      (clientError as ApiClientError & { isPermission: boolean }).isPermission =
        isPermission || status === 403;
      return clientError;
    }
    return new ApiClientError(status, axiosError.message || 'Request failed');
  }

  if (error instanceof Error) return new ApiClientError(0, error.message);
  return new ApiClientError(0, 'Request failed');
}

const client: AxiosInstance = axios.create({
  baseURL: API_URL,
  withCredentials: true,
});

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  if (MUTATING_METHODS.has(config.method?.toUpperCase() ?? '')) {
    config.headers.set('X-CSRF-Token', getCsrfToken());
  }
  return config;
});

client.interceptors.response.use(
  (response) => response,
  (error: unknown) => Promise.reject(toApiClientError(error)),
);

async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await client.request<T>({
    url: path,
    method,
    data: body,
  });

  if (response.status === 204) return undefined as T;
  return response.data as T;
}

async function uploadRequest<T>(path: string, file: File): Promise<T> {
  const form = new FormData();
  form.append('file', file);

  const response = await client.request<T>({
    url: path,
    method: 'POST',
    data: form,
  });

  if (response.status === 204) return undefined as T;
  return response.data as T;
}

async function uploadFormRequest<T>(
  path: string,
  file: File,
  fields: Record<string, string>,
): Promise<T> {
  const form = new FormData();
  form.append('file', file);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, value);
  }

  const response = await client.request<T>({
    url: path,
    method: 'POST',
    data: form,
  });

  if (response.status === 204) return undefined as T;
  return response.data as T;
}

function filenameFromDisposition(disposition: string): string | null {
  const match = /filename="?([^";]+)"?/.exec(disposition);
  return match ? match[1] : null;
}

async function downloadRequest(path: string, fallbackName: string): Promise<void> {
  const response = await client.get<Blob>(path, { responseType: 'blob' });
  const disposition = response.headers['content-disposition'] ?? '';
  const filename = filenameFromDisposition(disposition) ?? fallbackName;

  const url = window.URL.createObjectURL(response.data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export function downloadOnClick(path: string, fallbackName: string) {
  return (event: { preventDefault: () => void }) => {
    event.preventDefault();
    void downloadRequest(path, fallbackName);
  };
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, 'GET'),
  post: <T>(path: string, body?: unknown) => request<T>(path, 'POST', body),
  patch: <T>(path: string, body?: unknown) => request<T>(path, 'PATCH', body),
  put: <T>(path: string, body?: unknown) => request<T>(path, 'PUT', body),
  delete: <T>(path: string) => request<T>(path, 'DELETE'),
  upload: <T>(path: string, file: File) => uploadRequest<T>(path, file),
  uploadForm: <T>(path: string, file: File, fields: Record<string, string>) =>
    uploadFormRequest<T>(path, file, fields),
  download: (path: string, fallbackName: string) => downloadRequest(path, fallbackName),
};