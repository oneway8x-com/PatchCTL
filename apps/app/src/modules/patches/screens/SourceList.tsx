"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@corely/ui";
import { patchClient } from "../patches-api";

export function SourceList() {
  const sources = useQuery({
    queryKey: ["patchctl-sources"],
    queryFn: () => patchClient.localSources(),
    retry: false,
  });

  return (
    <section className="mx-auto max-w-5xl space-y-6">
      <header className="space-y-2">
        <p className="text-sm font-medium text-muted-foreground">
          Configuration
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">Sources</h1>
        <p className="text-muted-foreground">
          PostgreSQL credentials stay in the local CLI. This page contains only
          synchronized schema metadata and PatchCTL allowlists.
        </p>
      </header>

      {sources.isLoading ? <p role="status">Loading sources…</p> : null}
      {sources.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>Sources unavailable</CardTitle>
            <CardDescription>
              Confirm your active Tenant and sign in again before retrying.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
      {sources.data?.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No paired sources</CardTitle>
            <CardDescription>
              Create a local client token from the dashboard, run `patchctl
              login`, and the CLI will sync normalized schema metadata.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <Link href="/dashboard">Open connection guide</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {sources.data?.map((source) => (
          <Card key={source.id}>
            <CardHeader>
              <CardTitle>{source.name}</CardTitle>
              <CardDescription className="break-all font-mono">
                {source.id}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button asChild variant="outline">
                <Link href={`/sources/${encodeURIComponent(source.id)}`}>
                  Configure source
                </Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
