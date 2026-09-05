import { request, createIdempotencyKey, normalizeError } from "@corely/api-client";
import type { TokenStorage } from "./storage/storage.interface";

export interface SignUpData {
  email: string;
  password: string;
  tenantName?: string;
  userName?: string;
}

export interface SignInData {
  email: string;
  password: string;
  tenantId?: string | null;
}

export type EmailCodeMode = "login" | "signup";

export interface RequestEmailCodeData {
  email: string;
  mode: EmailCodeMode;
  tenantId?: string | null;
}

export interface RequestEmailCodeResponse {
  message: string;
  status: "code_sent" | "cooldown" | "needs_signup" | "needs_login" | "workspace_access_required";
  canProceed: boolean;
  nextAction?: "enter_code" | "signup" | "login";
  cooldownSeconds?: number;
}

export interface VerifyEmailCodeData extends RequestEmailCodeData {
  code: string;
  tenantName?: string;
  userName?: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  userId: string;
  email: string;
  tenantId?: string | null;
  tenantName?: string;
  membershipId?: string;
}

export interface CurrentUserResponse {
  userId: string;
  email: string;
  name: string | null;
  isSuperAdmin: boolean;
  activeTenantId?: string | null;
  memberships: Array<{
    tenantId?: string | null;
    tenantName?: string | null;
    workspaceName?: string;
    roleId: string;
  }>;
}

export interface AuthClientConfig {
  apiUrl: string;
  storage: TokenStorage;
}

export class AuthClient {
  private storage: TokenStorage;
  private apiUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  constructor(config: AuthClientConfig) {
    this.storage = config.storage;
    this.apiUrl = config.apiUrl;
  }

  /**
   * Initialize from stored tokens
   */
  async loadStoredTokens(): Promise<void> {
    this.accessToken = await this.storage.getAccessToken();
    this.refreshToken = await this.storage.getRefreshToken();
  }

  /**
   * Store tokens
   */
  private async storeTokens(accessToken: string, refreshToken: string): Promise<void> {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;

    await this.storage.setAccessToken(accessToken);
    await this.storage.setRefreshToken(refreshToken);
  }

  /**
   * Clear stored tokens
   */
  async clearTokens(): Promise<void> {
    this.accessToken = null;
    this.refreshToken = null;
    await this.storage.clear();
  }

  /**
   * Get current access token
   */
  getAccessToken(): string | null {
    return this.accessToken;
  }

  /**
   * Get current refresh token
   */
  getRefreshToken(): string | null {
    return this.refreshToken;
  }

  /**
   * Sign up
   */
  async signup(data: SignUpData): Promise<AuthResponse> {
    try {
      const result = await request<AuthResponse>({
        url: `${this.apiUrl}/auth/signup`,
        method: "POST",
        body: data,
        idempotencyKey: createIdempotencyKey(),
      });
      await this.storeTokens(result.accessToken, result.refreshToken);
      const workspaceId = result.tenantId ?? null;
      await this.storage.setActiveWorkspaceId(workspaceId);

      return result;
    } catch (error) {
      // Normalize error to extract proper message from ProblemDetails
      throw normalizeError(error);
    }
  }

  /**
   * Sign in
   */
  async signin(data: SignInData): Promise<AuthResponse> {
    try {
      const result = await request<AuthResponse>({
        url: `${this.apiUrl}/auth/login`,
        method: "POST",
        body: data,
      });
      await this.storeTokens(result.accessToken, result.refreshToken);
      const workspaceId =
        result.tenantId ?? data.tenantId ?? null;
      await this.storage.setActiveWorkspaceId(workspaceId);

      return result;
    } catch (error) {
      // Normalize error to extract proper message from ProblemDetails
      throw normalizeError(error);
    }
  }

  async requestEmailCode(data: RequestEmailCodeData): Promise<RequestEmailCodeResponse> {
    try {
      return await request<RequestEmailCodeResponse>({
        url: `${this.apiUrl}/auth/request-code`,
        method: "POST",
        body: data,
      });
    } catch (error) {
      throw normalizeError(error);
    }
  }

  async verifyEmailCode(data: VerifyEmailCodeData): Promise<AuthResponse> {
    try {
      const result = await request<AuthResponse>({
        url: `${this.apiUrl}/auth/verify-code`,
        method: "POST",
        body: data,
        idempotencyKey: createIdempotencyKey(),
      });
      await this.storeTokens(result.accessToken, result.refreshToken);
      const workspaceId = result.tenantId ?? data.tenantId ?? null;
      await this.storage.setActiveWorkspaceId(workspaceId);
      return result;
    } catch (error) {
      throw normalizeError(error);
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<CurrentUserResponse> {
    if (!this.accessToken) {
      throw new Error("No access token");
    }

    try {
      return await request<CurrentUserResponse>({
        url: `${this.apiUrl}/auth/me`,
        method: "GET",
        accessToken: this.accessToken,
      });
    } catch (error) {
      const normalized = normalizeError(error);
      if (normalized.status === 401) {
        await this.refreshAccessToken();
        return this.getCurrentUser();
      }
      throw normalized;
    }
  }

  /**
   * Refresh access token
   */
  async refreshAccessToken(): Promise<void> {
    if (!this.refreshToken) {
      throw new Error("No refresh token");
    }

    try {
      const result = await request<{ accessToken: string; refreshToken: string }>({
        url: `${this.apiUrl}/auth/refresh`,
        method: "POST",
        body: { refreshToken: this.refreshToken },
      });

      await this.storeTokens(result.accessToken, result.refreshToken);
    } catch (error) {
      throw normalizeError(error);
    }
  }

  /**
   * Sign out
   */
  async signout(): Promise<void> {
    if (this.accessToken) {
      try {
        await request({
          url: `${this.apiUrl}/auth/logout`,
          method: "POST",
          accessToken: this.accessToken,
          body: { refreshToken: this.refreshToken },
        });
      } catch (error) {
        // Ignore errors on logout
      }
    }

    await this.clearTokens();
  }

  /**
   * Switch tenant
   */
  async switchTenant(tenantId: string | null): Promise<AuthResponse> {
    if (!this.accessToken) {
      throw new Error("No access token");
    }

    try {
      const result = await request<AuthResponse>({
        url: `${this.apiUrl}/auth/switch-tenant`,
        method: "POST",
        accessToken: this.accessToken,
        body: { tenantId },
      });
      await this.storeTokens(result.accessToken, result.refreshToken);
      await this.storage.setActiveWorkspaceId(
        result.tenantId ?? tenantId ?? null
      );

      return result;
    } catch (error) {
      throw normalizeError(error);
    }
  }
}
