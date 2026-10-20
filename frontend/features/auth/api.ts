import { apiClient } from '@/lib/api-client';

export type TokenResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user_id: string;
  tenant_id: string;
};

export type RegisterPayload = {
  tenant_name: string;
  tenant_slug: string;
  email: string;
  full_name: string;
  password: string;
};

export type LoginPayload = {
  email: string;
  password: string;
};

export type MessageResponse = {
  detail: string;
};

export type TokenInfoResponse = {
  valid: boolean;
  email: string | null;
};

export const authApi = {
  register: (payload: RegisterPayload) =>
    apiClient.post<TokenResponse>('/auth/register', payload),

  login: (payload: LoginPayload) =>
    apiClient.post<TokenResponse>('/auth/login', payload),

  logout: () => apiClient.post<void>('/auth/logout'),

  forgotPassword: (email: string) =>
    apiClient.post<MessageResponse>('/auth/forgot-password', { email }),

  resetPassword: (token: string, newPassword: string) =>
    apiClient.post<MessageResponse>('/auth/reset-password', {
      token,
      new_password: newPassword,
    }),

  validateResetToken: (token: string) =>
    apiClient.get<TokenInfoResponse>(
      `/auth/reset-password/validate?token=${encodeURIComponent(token)}`,
    ),

  changePassword: (currentPassword: string, newPassword: string) =>
    apiClient.post<MessageResponse>('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    }),

  verifyEmail: (token: string) =>
    apiClient.post<MessageResponse>('/auth/verify-email', { token }),

  validateVerifyToken: (token: string) =>
    apiClient.get<TokenInfoResponse>(
      `/auth/verify-email/validate?token=${encodeURIComponent(token)}`,
    ),

  resendVerification: (email: string) =>
    apiClient.post<MessageResponse>('/auth/resend-verification', { email }),
};
