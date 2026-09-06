"use client";

import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@corely/ui";
import { useAuth } from "@/components/auth/auth-context";
import { LocalClientConnectionGuide } from "@/modules/patches";

export function DashboardHome() {
  const auth = useAuth();

  if (auth.isLoading) {
    return <p role="status">Loading your account…</p>;
  }
  if (!auth.isAuthenticated || !auth.user) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardHeader>
          <CardTitle>Sign in to PatchCTL</CardTitle>
          <CardDescription>
            Verify your email to access your Tenant and CLI setup guide.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild>
            <Link href="/login">Sign in</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const membership = auth.user.memberships.find(
    (item) => item.tenantId === auth.user?.activeTenantId,
  );

  return (
    <section className="mx-auto max-w-5xl space-y-8">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          PatchCTL onboarding
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Signed in as{" "}
          <span className="font-medium text-foreground">{auth.user.email}</span>
        </p>
      </header>

      {auth.user.activeTenantId && membership?.tenantName ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Active Tenant</CardTitle>
              <CardDescription>
                This is the hosted review boundary used to authorize your
                browser and paired CLI.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-muted-foreground">Name</dt>
                  <dd className="mt-1 font-medium">{membership.tenantName}</dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Tenant ID</dt>
                  <dd className="mt-1 break-all font-mono text-sm">
                    {auth.user.activeTenantId}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <LocalClientConnectionGuide
            tenantId={auth.user.activeTenantId}
            tenantName={membership.tenantName}
          />
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Tenant setup unavailable</CardTitle>
            <CardDescription>
              Your session has no active Tenant. Sign out and verify your email
              again. If this continues, contact the instance operator before
              connecting a database.
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </section>
  );
}
