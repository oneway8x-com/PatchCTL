"use client";
import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-context";
import { fetchActor, fetchPatch, patchRequest } from "../patches-api";
import { PatchHistory } from "./PatchHistory";

function Value({ value }: { value: unknown }) {
  if (value === null) return <span className="italic text-muted-foreground">Null (no value)</span>;
  if (value === "") return <span className="italic text-muted-foreground">Empty string</span>;
  return <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words font-sans text-sm">{String(value)}</pre>;
}
export function PatchDetail({ id }: { id: string }) {
  const auth = useAuth();
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const scope = [auth.user?.userId, auth.user?.activeTenantId];
  const query = useQuery({ queryKey: ["patch", ...scope, id], queryFn: () => fetchPatch(id), enabled: !auth.isLoading && auth.isAuthenticated, retry: false });
  const actorQuery = useQuery({ queryKey: ["patch-actor", ...scope], queryFn: fetchActor, enabled: !auth.isLoading && auth.isAuthenticated, retry: false });
  const schemaQuery = useQuery({ queryKey: ["patch-schema", ...scope, query.data?.payload.sourceId],
    queryFn: () => patchRequest<{ definition: { table: string; fields: Record<string, { locale?: string }> } }>(`/sources/${query.data!.payload.sourceId}/schema`),
    enabled: !!query.data, retry: false });
  if (auth.isLoading || query.isLoading) return <p role="status">Loading patch…</p>;
  if (!auth.isAuthenticated) return <p><Link className="underline" href="/login">Sign in</Link> to review this patch.</p>;
  if (!query.data || query.isError) return <div role="alert">This patch is unavailable. Check your access. <button className="underline" onClick={() => void query.refetch()}>Retry</button></div>;
  const patch = query.data;
  const count = patch.payload.records.length;
  async function decide(decision: "approved" | "rejected") {
    setBusy(true); setActionError(null);
    try {
      await patchRequest(`/patches/${id}/decision`, "POST", { revision: patch.revision, decision, ...(decision === "rejected" ? { reason: rejectionReason } : {}) });
      if (decision === "approved" && actorQuery.data?.permissions.includes("apply"))
        await patchRequest(`/patches/${id}/apply`, "POST", { revision: patch.revision });
    } catch { setActionError("The decision could not be saved. The patch may have changed or your access may have expired. Review its current state before retrying."); }
    finally { await query.refetch(); setBusy(false); }
  }
  async function apply() {
    setBusy(true); setActionError(null);
    try { await patchRequest(`/patches/${id}/apply`, "POST", { revision: patch.revision }); }
    catch { setActionError("Apply did not complete. Review the current state below. For an applying patch, retry to recover its result safely."); }
    finally { await query.refetch(); setBusy(false); }
  }
  return <section className="mx-auto max-w-6xl space-y-6">
    <Link className="text-sm underline" href="/patches">← All patches</Link>
    <header className="space-y-3"><div className="flex flex-wrap items-center gap-3"><h1 className="text-3xl font-semibold">Review content changes</h1><span className="rounded-full bg-muted px-3 py-1" data-testid="patch-state">{patch.state}</span></div>
      <p className="text-lg">{patch.payload.reason}</p><p className="font-medium" data-testid="affected-count">{count} records affected · {schemaQuery.data?.definition.table ?? "Content source"}</p>
      {patch.payload.mode === "fill-missing" && <p>Fill missing content · existing populated values are preserved.</p>}
      {patch.payload.translation && <p>Translation: {patch.payload.translation.sourceField} → {patch.payload.translation.targetField}</p>}
      <p className="break-all text-sm text-muted-foreground">Created by {patch.payload.creator.kind} {patch.payload.creator.id} · {new Date(patch.payload.createdAt).toLocaleString()}</p>
      <details className="text-sm"><summary className="cursor-pointer">Patch details</summary><p className="break-all">ID: {patch.id}<br/>Source: {patch.payload.sourceId}<br/>Revision: {patch.revision}</p></details>
    </header>
    {patch.state === "pending" && <p className="rounded-lg bg-muted p-4">These are proposed changes. Source content has not been updated.</p>}
    {patch.state === "conflict" && <p role="alert" className="rounded-lg border p-4">A record changed after this patch was prepared. Prepare a new patch and review it again. No records were applied.</p>}
    {patch.failureCode && <p role="alert">Apply result: {patch.failureCode}</p>}
    {patch.reviewerId && <p>Reviewed by {patch.reviewerId} · {patch.reviewedAt ? new Date(patch.reviewedAt).toLocaleString() : ""}{patch.rejectionReason ? ` · ${patch.rejectionReason}` : ""}</p>}
    {patch.appliedAt && <p>Applied {new Date(patch.appliedAt).toLocaleString()}</p>}
    {actionError && <p role="alert">{actionError}</p>}
    {patch.state === "pending" && actorQuery.data?.kind === "human" && actorQuery.data.permissions.includes("review") && <div className="space-y-3 rounded-xl border p-4">
      <label className="block text-sm">Rejection reason (optional)<input className="mt-1 block w-full rounded border bg-background p-2" value={rejectionReason} maxLength={1000} onChange={event => setRejectionReason(event.target.value)}/></label>
      <div className="flex gap-3"><button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-40" disabled={busy} onClick={() => void decide("approved")}>{actorQuery.data.permissions.includes("apply") ? "Approve and apply" : "Approve patch"}</button>
        <button className="rounded border px-4 py-2 disabled:opacity-40" disabled={busy} onClick={() => void decide("rejected")}>Reject patch</button></div>
    </div>}
    {["approved", "applying"].includes(patch.state) && actorQuery.data?.kind === "human" && actorQuery.data.permissions.includes("apply") && <button className="rounded bg-primary px-4 py-2 text-primary-foreground disabled:opacity-40" disabled={busy} onClick={() => void apply()}>{patch.state === "applying" ? "Recover apply result" : "Apply approved patch"}</button>}
    <div className="space-y-5">{patch.payload.records.slice(page * 10, page * 10 + 10).map(record => <article key={record.id} className="overflow-hidden rounded-xl border" data-testid="record-diff">
      <h2 className="border-b bg-muted/50 p-4 font-semibold">Record {record.id}</h2>
      {Object.keys(record.after).map(field => <div key={field} className="border-b last:border-0">
        <h3 className="px-4 pt-4 font-medium">{field}{schemaQuery.data?.definition.fields[field]?.locale ? ` (${schemaQuery.data.definition.fields[field].locale})` : ""}</h3>
        <div className="grid gap-4 p-4 md:grid-cols-2"><div className="rounded-lg bg-red-50 p-4 text-slate-900"><p className="mb-2 text-xs font-bold uppercase">Before</p><Value value={record.before[field]}/></div>
          <div className="rounded-lg bg-emerald-50 p-4 text-slate-900"><p className="mb-2 text-xs font-bold uppercase">After</p><Value value={record.after[field]}/></div></div>
      </div>)}
    </article>)}</div>
    <div className="flex flex-wrap items-center gap-4"><button className="rounded border px-4 py-2 disabled:opacity-40" disabled={page === 0} onClick={() => setPage(p => p - 1)}>Previous records</button>
      <p aria-live="polite">Records {page * 10 + 1}–{Math.min(count, page * 10 + 10)} of {count}</p>
      <button className="rounded border px-4 py-2 disabled:opacity-40" disabled={(page + 1) * 10 >= count} onClick={() => setPage(p => p + 1)}>Next records</button></div>
    {actorQuery.data?.kind === "agent" && <p>Human review is required. Agent credentials cannot approve or apply patches.</p>}
    <PatchHistory id={id} tenantId={patch.tenantId} actorId={actorQuery.data?.id ?? ""} state={patch.state}/>
  </section>;
}
