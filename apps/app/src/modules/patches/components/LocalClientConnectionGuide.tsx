"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@corely/ui";
import { useAuth } from "@/components/auth/auth-context";
import { patchClient } from "../patches-api";

function localTenantAlias(tenantName: string, tenantId: string): string {
  const normalized = tenantName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
  return (
    normalized || `tenant-${tenantId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 12)}`
  );
}

function Command({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border bg-muted p-3 text-sm">
      <code>{children}</code>
    </pre>
  );
}

export function LocalClientConnectionGuide({
  tenantId,
  tenantName,
}: {
  tenantId: string;
  tenantName: string;
}) {
  const auth = useAuth();
  const [clientToken, setClientToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [serverOrigin, setServerOrigin] = useState(
    "https://your-patchctl-instance.example",
  );
  const actor = useQuery({
    queryKey: ["local-actor", auth.user?.userId, auth.user?.activeTenantId],
    queryFn: () => patchClient.actor(),
    enabled:
      !auth.isLoading &&
      auth.isAuthenticated &&
      auth.user?.activeTenantId === tenantId,
    retry: false,
  });
  const alias = localTenantAlias(tenantName, tenantId);

  useEffect(() => {
    setServerOrigin(window.location.origin);
  }, []);

  async function createToken() {
    setBusy(true);
    setError("");
    setCopyStatus("");
    try {
      setClientToken((await patchClient.createLocalToken()).token);
    } catch {
      setError(
        "Could not create a client token. Owner or administrator access is required.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function copyToken() {
    try {
      await navigator.clipboard.writeText(clientToken);
      setCopyStatus("Token copied.");
    } catch {
      setCopyStatus("Copy failed. Select the token and copy it manually.");
    }
  }

  const canConfigure =
    actor.data?.kind === "human" &&
    actor.data.permissions.includes("configure");

  return (
    <Card>
      <CardHeader>
        <CardTitle>Connect your local CLI</CardTitle>
        <CardDescription>
          Keep the database credential on this machine, then pair the CLI with{" "}
          {tenantName} using a one-connection token.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="list-decimal space-y-5 pl-5">
          <li className="space-y-2">
            <p>
              Connect PostgreSQL. <code>{alias}</code> is a local profile name,
              not the hosted Tenant ID.
            </p>
            <Command>{`pnpm patchctl connect postgres --tenant ${alias}`}</Command>
            <p className="text-sm text-muted-foreground">
              Enter the DSN at the hidden prompt. PatchCTL stores it in the
              operating-system credential backend and never sends it to the
              review service.
            </p>
          </li>
          <li className="space-y-2">
            <p>Select the tables and columns the CLI may read.</p>
            <Command>{"pnpm patchctl init"}</Command>
          </li>
          <li className="space-y-3">
            <p>
              Create a scoped token, then pair this local profile with the
              active Tenant.
            </p>
            {actor.isLoading ? (
              <p role="status">Checking Tenant permissions…</p>
            ) : null}
            {actor.isError ? (
              <p role="alert" className="text-sm text-destructive">
                Tenant permissions are unavailable. Refresh after confirming
                your session.
              </p>
            ) : null}
            {canConfigure ? (
              <Button
                type="button"
                disabled={busy}
                onClick={() => void createToken()}
              >
                {busy ? "Creating token…" : "Create client token"}
              </Button>
            ) : actor.data ? (
              <p className="text-sm text-muted-foreground">
                Owner or administrator access is required to create a client
                token.
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : null}
            {clientToken ? (
              <div className="space-y-2 rounded-lg border p-4">
                <Label htmlFor="client-token">
                  Copy this token now; it is shown only in this session
                </Label>
                <Input
                  id="client-token"
                  readOnly
                  autoComplete="off"
                  spellCheck={false}
                  className="font-mono text-sm"
                  value={clientToken}
                  onFocus={(event) => event.currentTarget.select()}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => void copyToken()}
                  >
                    Copy token
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      setClientToken("");
                      setCopyStatus("");
                    }}
                  >
                    Hide token
                  </Button>
                </div>
                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {copyStatus}
                </p>
              </div>
            ) : null}
            <Command>{`pnpm patchctl login --server ${serverOrigin}`}</Command>
            <p className="text-sm text-muted-foreground">
              Paste the token at the hidden prompt. Never add it to the command,
              URL, or source control.
            </p>
          </li>
          <li className="space-y-2">
            <p>
              Prepare, validate, and submit an immutable proposal for human
              review.
            </p>
            <Command>{`pnpm patchctl patch start --title "Describe the content change"
pnpm patchctl update <resource> <record-id> --set field=value
pnpm patchctl diff
pnpm patchctl validate
pnpm patchctl submit`}</Command>
          </li>
        </ol>
        <p className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          Approval records the human decision, but local apply is not
          implemented yet and does not write changes back to PostgreSQL.
        </p>
      </CardContent>
    </Card>
  );
}
