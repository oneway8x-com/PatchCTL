"use client";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { patchClient } from "../patches-api";
export function PatchHistory({
  id,
  tenantId,
  actorId,
  state,
}: {
  id: string;
  tenantId: string;
  actorId: string;
  state: string;
}) {
  const [cursors, setCursors] = useState<Array<string | null>>([null]);
  const cursor = cursors.at(-1);
  const query = useQuery({
    queryKey: ["patch-history", tenantId, actorId, id, state, cursor],
    queryFn: () => patchClient.history(id, cursor ? { after: cursor } : {}),
    retry: false,
  });
  return (
    <section className="space-y-3 rounded-xl border p-5">
      <h2 className="text-xl font-semibold">Audit history</h2>
      {query.isLoading && <p role="status">Loading history…</p>}
      {query.isError && (
        <p role="alert">
          Could not load history.{" "}
          <button className="underline" onClick={() => void query.refetch()}>
            Retry
          </button>
        </p>
      )}
      <ol className="space-y-3">
        {query.data?.events?.map((event) => (
          <li key={event.id} className="border-l-2 pl-4">
            <p className="font-medium">{event.action}</p>
            <p className="break-all text-sm">
              {event.actor?.kind} {event.actor?.id} ·{" "}
              {new Date(event.at).toLocaleString()}
            </p>
            <details className="text-sm">
              <summary className="cursor-pointer">Event details</summary>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words">
                {JSON.stringify(event.details, null, 2)}
              </pre>
            </details>
          </li>
        ))}
      </ol>
      <div className="flex gap-3">
        <button
          className="rounded border px-3 py-1 disabled:opacity-40"
          disabled={cursors.length === 1}
          onClick={() => setCursors((c) => c.slice(0, -1))}
        >
          Earlier events
        </button>
        <button
          className="rounded border px-3 py-1 disabled:opacity-40"
          disabled={!query.data?.nextCursor}
          onClick={() => setCursors((c) => [...c, query.data!.nextCursor])}
        >
          More events
        </button>
      </div>
    </section>
  );
}
