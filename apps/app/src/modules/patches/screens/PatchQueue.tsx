"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-context";
import { fetchPatches } from "../patches-api";
export function PatchQueue() {
  const auth = useAuth();
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const cursor = cursors.at(-1) ?? null;
  const query = useQuery({ queryKey: ["patches", auth.user?.userId, auth.user?.activeTenantId, cursor],
    queryFn: () => fetchPatches(cursor), enabled: !auth.isLoading && auth.isAuthenticated, retry: false });
  if (auth.isLoading) return <p role="status">Loading session…</p>;
  if (!auth.isAuthenticated) return <p><Link className="underline" href="/login">Sign in</Link> to review content patches.</p>;
  return <section className="mx-auto max-w-5xl space-y-6">
    <div><p className="text-sm text-muted-foreground">PatchCTL / Human review</p><h1 className="text-3xl font-semibold">Content patches</h1>
      <p className="mt-2 text-muted-foreground">Review proposed changes before they reach your content.</p></div>
    <button className="rounded border px-4 py-2" onClick={() => void query.refetch()}>Refresh</button>
    {query.isLoading && <p role="status">Loading patches…</p>}
    {query.isError && <p role="alert">Could not load patches. Check your session and Tenant access, then retry.</p>}
    {query.data?.items.length === 0 && <p>No patches to review.</p>}
    <ul className="space-y-3">{query.data?.items.map(patch => <li key={patch.id} className="rounded-xl border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><Link href={`/patches/${patch.id}`} className="font-semibold underline">{patch.reason}</Link><span className="rounded-full bg-muted px-3 py-1 text-sm">{patch.state}</span></div>
      <p className="mt-2 text-sm">{patch.affectedRecords} records · {patch.creator.kind} {patch.creator.id}</p>
      <p className="mt-1 break-all text-xs text-muted-foreground">Source {patch.sourceId} · {new Date(patch.createdAt).toLocaleString()}</p>
    </li>)}</ul>
    <div className="flex gap-3"><button className="rounded border px-4 py-2 disabled:opacity-40" disabled={cursors.length === 1} onClick={() => setCursors(c => c.slice(0, -1))}>Previous page</button>
      <button className="rounded border px-4 py-2 disabled:opacity-40" disabled={!query.data?.nextCursor} onClick={() => setCursors(c => [...c, query.data!.nextCursor])}>Next page</button></div>
  </section>;
}
