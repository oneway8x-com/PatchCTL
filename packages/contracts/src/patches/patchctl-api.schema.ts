import { z } from "zod";
import {
  PatchContentSchemaInputSchema,
  PatchIdentifierSchema,
  PatchContentFieldSchema,
} from "./content-schema";
import {
  PatchProposalInputSchema,
  ContentQueryInputSchema,
} from "./patches.schema";

const id = z.string().min(1);
const revision = z.string().regex(/^[a-f0-9]{64}$/);
const version = z.string().regex(/^[a-f0-9]{32}$/);
const instant = z.string().datetime();
const value = z.union([z.string(), z.number().finite(), z.null()]);
const creator = z.object({
  id,
  kind: z.enum(["human", "agent"]),
  ownerUserId: id,
});

export const PatchActorSchema = creator.extend({
  tenantId: id,
  permissions: z.array(
    z.enum(["read", "propose", "review", "apply", "configure"]),
  ),
  connectionIds: z.array(id).nullable(),
});
export const PatchStateSchema = z.enum([
  "pending",
  "approved",
  "rejected",
  "applying",
  "applied",
  "conflict",
  "failed",
]);
export const PatchSourcesSchema = z.array(
  z.object({ id, name: z.string() }).strict(),
);
export const PatchContentSchemaResponseSchema = z
  .object({
    // Discovery is filtered to readable fields; configuration-only refinements do not apply.
    definition: PatchContentSchemaInputSchema.innerType().extend({
      fields: z.record(PatchIdentifierSchema, PatchContentFieldSchema),
    }),
    version: revision,
    versionStrategy: z.literal("postgres-xmin-and-whole-row"),
  })
  .strict();
export const PatchContentPageSchema = z.object({
  records: z.array(z.object({ id, version, values: z.record(value) })),
  nextCursor: z.string().nullable(),
  schemaVersion: revision,
});
export const PatchRelationTargetSchema = z.object({
  id,
  label: z.string(),
  version,
});
export const PatchRelationPageSchema = z.object({
  targets: z.array(PatchRelationTargetSchema),
  nextCursor: z.string().nullable(),
});
export const PatchResponseSchema = z.object({
  id,
  tenantId: id,
  revision,
  state: PatchStateSchema,
  payload: z.object({
    sourceId: id,
    schemaVersion: revision,
    sourceFingerprint: revision,
    reason: z.string(),
    agentRunLabel: z.string().optional(),
    mode: z.enum(["edit", "fill-missing"]).optional(),
    translation: z
      .object({ sourceField: z.string(), targetField: z.string() })
      .optional(),
    records: z.array(
      z.object({
        id,
        version,
        before: z.record(value),
        after: z.record(value),
        relations: z
          .record(
            z.object({
              before: PatchRelationTargetSchema.nullable(),
              after: PatchRelationTargetSchema.nullable(),
            }),
          )
          .optional(),
      }),
    ),
    creator,
    createdAt: instant,
  }),
  reviewerId: id.nullable(),
  reviewedAt: instant.nullable(),
  rejectionReason: z.string().nullable(),
  appliedAt: instant.nullable(),
  failureCode: z.string().nullable(),
});
export const PatchListSchema = z.object({
  items: z.array(
    z.object({
      id,
      state: PatchStateSchema,
      revision,
      sourceId: id,
      reason: z.string(),
      creator,
      createdAt: instant,
      affectedRecords: z.number().int().nonnegative(),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export const PatchPreparedSchema = z
  .object({
    id,
    revision,
    state: z.literal("pending"),
    affectedRecords: z.number().int().positive(),
    reviewPath: z.string(),
  })
  .refine((result) => result.reviewPath === `/patches/${result.id}`, {
    message: "Invalid review path",
  });
export const PatchHistorySchema = z.object({
  events: z.array(
    z.object({
      id,
      action: z.string(),
      at: instant,
      actor: z.object({ id, kind: z.string() }),
      details: z.record(z.unknown()),
    }),
  ),
  nextCursor: z.string().nullable(),
});
export const PatchDecisionInputSchema = z
  .object({
    revision,
    decision: z.enum(["approved", "rejected"]),
    reason: z.string().trim().max(1000).optional(),
  })
  .strict();
export const PatchApplyInputSchema = z.object({ revision }).strict();
export const PatchAppliedSchema = z.object({
  id,
  state: z.literal("applied"),
  appliedAt: instant.nullable(),
  affectedRecords: z.number().int().nonnegative(),
});

export type PatchDto = z.infer<typeof PatchResponseSchema>;
export type PatchActorDto = z.infer<typeof PatchActorSchema>;
export type PatchListDto = z.infer<typeof PatchListSchema>;
export type PatchHistoryDto = z.infer<typeof PatchHistorySchema>;
export type PatchProposalInput = z.input<typeof PatchProposalInputSchema>;
export type PatchContentQueryInput = z.input<typeof ContentQueryInputSchema>;
export type PatchDecisionInput = z.input<typeof PatchDecisionInputSchema>;
export type PatchApplyInput = z.input<typeof PatchApplyInputSchema>;
