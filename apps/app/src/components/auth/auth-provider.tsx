"use client";

import React, { useEffect, useState, type ReactNode } from "react";
import type {
  AuthClient,
  CurrentUserResponse,
  SignUpData,
  SignInData,
  RequestEmailCodeData,
  VerifyEmailCodeData,
} from "@corely/auth-client";
import { AuthContext } from "./auth-context";

interface AuthProviderProps {
  children: ReactNode;
  authClient: AuthClient;
  onLogout?: () => void;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, authClient, onLogout }) => {
  const [user, setUser] = useState<CurrentUserResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const initAuth = async () => {
      try {
        await authClient.loadStoredTokens();
        if (authClient.getAccessToken()) {
          const currentUser = await authClient.getCurrentUser();
          setUser(currentUser);
        }
      } catch (err) {
        await authClient.clearTokens();
        setError(err instanceof Error ? err.message : "Auth initialization failed");
      } finally {
        setIsLoading(false);
      }
    };
    void initAuth();
  }, [authClient]);

  const signup = async (data: SignUpData) => {
    setError(null);
    const result = await authClient.signup(data);
    const currentUser = await authClient.getCurrentUser();
    setUser(currentUser);
    return result;
  };

  const signin = async (data: SignInData) => {
    setError(null);
    const result = await authClient.signin(data);
    const currentUser = await authClient.getCurrentUser();
    setUser(currentUser);
    return result;
  };

  const requestEmailCode = async (data: RequestEmailCodeData) => {
    setError(null);
    return await authClient.requestEmailCode(data);
  };

  const verifyEmailCode = async (data: VerifyEmailCodeData) => {
    setError(null);
    const result = await authClient.verifyEmailCode(data);
    const currentUser = await authClient.getCurrentUser();
    setUser(currentUser);
    return result;
  };

  const logout = async () => {
    try {
      await authClient.signout();
    } finally {
      await authClient.clearTokens();
      if (onLogout) {
        onLogout();
      }
      setUser(null);
    }
  };

  const switchTenant = async (tenantId: string | null) => {
    setError(null);
    const result = await authClient.switchTenant(tenantId);
    const currentUser = await authClient.getCurrentUser();
    setUser(currentUser);
    return result;
  };

  const refresh = async () => {
    await authClient.refreshAccessToken();
    if (authClient.getAccessToken()) {
      const currentUser = await authClient.getCurrentUser();
      setUser(currentUser);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signup,
        signin,
        requestEmailCode,
        verifyEmailCode,
        logout,
        switchTenant,
        refresh,
        error,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
