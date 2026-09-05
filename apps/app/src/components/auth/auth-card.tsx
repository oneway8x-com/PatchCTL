"use client";

import React, { useEffect, useState } from "react";
import { Button, Input } from "@corely/ui";
import { useAuth } from "./auth-context";

export interface AuthCardProps {
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}

export const AuthCard: React.FC<AuthCardProps> = ({ 
  title = "Sign in", 
  subtitle = "Enter your email. We'll sign you in or create your account, then send a secure 6-digit code.",
  onSuccess
}) => {
  const { requestEmailCode, verifyEmailCode, error } = useAuth();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [verificationMode, setVerificationMode] = useState<"login" | "signup">("login");
  const [step, setStep] = useState<"email" | "code">("email");
  const [notice, setNotice] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (cooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setCooldownSeconds((current) => (current <= 1 ? 0 : current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [cooldownSeconds]);

  const handleRequestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setIsRequesting(true);
    try {
      let resolvedMode: "login" | "signup" = "login";
      let result = await requestEmailCode({ email, mode: resolvedMode });

      if (result.status === "needs_signup") {
        resolvedMode = "signup";
        result = await requestEmailCode({ email, mode: resolvedMode });
      }
      if (result.status === "needs_login") {
        resolvedMode = "login";
        result = await requestEmailCode({ email, mode: resolvedMode });
      }

      setVerificationMode(resolvedMode);
      setNotice(result.message);
      setCooldownSeconds(result.cooldownSeconds ?? 0);
      setStep(result.canProceed ? "code" : "email");
    } catch (err) {
      console.error(err);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleResendCode = async () => {
    setIsRequesting(true);
    try {
      const result = await requestEmailCode({ email, mode: verificationMode });
      setNotice(result.message);
      setCooldownSeconds(result.cooldownSeconds ?? 0);
    } catch (err) {
      console.error(err);
    } finally {
      setIsRequesting(false);
    }
  };

  const handleVerifyCode = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsVerifying(true);
    try {
      await verifyEmailCode({ email, code, mode: verificationMode });
      if (onSuccess) {
        onSuccess();
      } else {
        window.location.href = "/dashboard";
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{subtitle}</p>
        </div>
        {step === "email" ? (
          <form onSubmit={handleRequestCode} className="space-y-4">
            {notice ? <div className="rounded-md bg-muted p-3 text-sm">{notice}</div> : null}
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="email">
                Email address
              </label>
              <Input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <Button
              type="submit"
              disabled={isRequesting || !email.trim()}
              className="w-full"
            >
              {isRequesting ? "Checking your account..." : "Continue with email"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              No password needed. New accounts are created after email verification.
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerifyCode} className="space-y-4">
            <div className="text-center">
              <h2 className="text-xl font-semibold">Check your inbox</h2>
            </div>
            <div className="rounded-md bg-muted p-3 text-sm">
              {notice || `We sent a 6-digit code to ${email}.`}
            </div>
            {error && <div className="text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor="code">
                6-digit code
              </label>
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]*"
                maxLength={6}
                required
                className="text-center tracking-[0.3em]"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              />
            </div>
            <Button
              type="submit"
              disabled={isVerifying || code.length !== 6}
              className="w-full"
            >
              {isVerifying ? "Verifying..." : "Continue"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void handleResendCode()}
              disabled={isRequesting || cooldownSeconds > 0}
              className="w-full"
            >
              {isRequesting
                ? "Sending..."
                : cooldownSeconds > 0
                  ? `Resend code in ${cooldownSeconds}s`
                  : "Resend code"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setStep("email");
                setCode("");
                setNotice("");
                setCooldownSeconds(0);
              }}
              className="w-full text-muted-foreground"
            >
              Use a different email
            </Button>
          </form>
        )}
      </div>
    </div>
  );
};
