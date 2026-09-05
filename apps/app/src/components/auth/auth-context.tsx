"use client";

import { createContext, useContext } from "react";
import type {
  CurrentUserResponse,
  SignUpData,
  SignInData,
  RequestEmailCodeData,
  RequestEmailCodeResponse,
  VerifyEmailCodeData,
  AuthResponse,
} from "@corely/auth-client";

export interface AuthContextType {
  user: CurrentUserResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signup: (data: SignUpData) => Promise<AuthResponse>;
  signin: (data: SignInData) => Promise<AuthResponse>;
  requestEmailCode: (data: RequestEmailCodeData) => Promise<RequestEmailCodeResponse>;
  verifyEmailCode: (data: VerifyEmailCodeData) => Promise<AuthResponse>;
  logout: () => Promise<void>;
  switchTenant: (tenantId: string | null) => Promise<AuthResponse>;
  refresh: () => Promise<void>;
  error: string | null;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

export function useAuthOptional() {
  return useContext(AuthContext);
}
