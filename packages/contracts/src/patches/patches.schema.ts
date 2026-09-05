import { z } from "zod";
const fieldName = z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,62}$/);
export const PatchProposalInputSchema = z.object({ sourceId: z.string().uuid(), schemaVersion: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(1).max(1000), agentRunLabel: z.string().max(120).optional(),
  mode: z.enum(["edit", "fill-missing"]).default("edit"),
  translation: z.object({ sourceField: fieldName, targetField: fieldName }).strict().optional(),
  records: z.array(z.object({ id: z.string().min(1).max(500), version: z.string().regex(/^[a-f0-9]{32}$/),
    changes: z.record(z.union([z.string().max(100000), z.number().finite(), z.null()])).refine(x => Object.keys(x).length > 0 && Object.keys(x).length <= 50),
  }).strict()).min(1).max(100),
}).strict();
export const ContentQueryInputSchema = z.object({
  fields: z.array(fieldName).min(1).max(50).optional(),
  filters: z.array(z.discriminatedUnion("op", [
    z.object({ field: fieldName, op: z.literal("missing") }).strict(),
    z.object({ field: fieldName, op: z.literal("eq"), value: z.string().max(100000).nullable() }).strict(),
  ])).max(10).default([]), after: z.string().max(500).optional(), limit: z.number().int().min(1).max(100).default(50),
}).strict();
