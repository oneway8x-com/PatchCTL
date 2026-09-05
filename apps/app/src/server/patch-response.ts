import { PatchError } from "@corely/modules-patches";
import { ZodError } from "zod";

export function patchProblem(error: unknown): Response {
  if (error instanceof PatchError)
    return Response.json(
      {
        code: error.code,
        detail: error.message,
        ...(error.details ? { details: error.details } : {}),
      },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return Response.json(
      { code: "VALIDATION", errors: error.flatten() },
      { status: 400 },
    );
  if (error instanceof SyntaxError)
    return Response.json({ code: "INVALID_JSON" }, { status: 400 });
  // Database and connection errors may contain credentials or private record values.
  return Response.json(
    {
      code: "INTERNAL",
      detail: "The operation failed. Retry or contact the operator.",
    },
    { status: 500 },
  );
}
