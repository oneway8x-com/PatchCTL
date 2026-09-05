/**
 * Canonical DI tokens for kernel-level services.
 *
 * These tokens are used across the application and background execution surfaces.
 * Use namespaced strings to avoid Symbol identity mismatches in monorepo setups.
 */

// Core kernel services
export const ID_GENERATOR_TOKEN = "kernel/id-generator";
export const CLOCK_PORT_TOKEN = "kernel/clock-port";
export const IDEMPOTENCY_STORAGE_PORT_TOKEN = "api/idempotency-storage-port";

// Infrastructure ports
export const AUDIT_PORT = "kernel/audit-port";
export const OUTBOX_PORT = "kernel/outbox-port";
export const IDEMPOTENCY_PORT = "kernel/idempotency-port";
export const UNIT_OF_WORK = "kernel/unit-of-work";

// Time services
export const TENANT_TIMEZONE_PORT = "api/tenant-timezone-port";

// Infrastructure
export const EMAIL_SENDER_PORT = "kernel/email-sender-port";
export const OBJECT_STORAGE_PORT = "kernel/object-storage-port";
