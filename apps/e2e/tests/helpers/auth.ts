import { expect, type APIRequestContext, type Page } from "@playwright/test";

const API_URL = process.env.API_URL || "http://127.0.0.1:3000";
const TEST_PASSWORD = "E2ETestPassword123!";

export interface SeededSession {
  accessToken: string;
  refreshToken: string;
  email: string;
  password: string;
  tenantId: string;
  tenantName: string;
  workspaceId: string;
  workspaceName: string;
}

function uniqueSuffix() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function jsonHeaders(headers: Record<string, string> = {}) {
  return {
    "Content-Type": "application/json",
    ...headers,
  };
}

export async function seedUserWorkspace(request: APIRequestContext): Promise<SeededSession> {
  const suffix = uniqueSuffix();
  const email = `todo-e2e-${suffix}@corely.local`;
  const tenantName = `Todo E2E Tenant ${suffix}`;
  const workspaceName = `Todo E2E Workspace ${suffix}`;

  const signup = await request.post(`${API_URL}/auth/signup`, {
    headers: jsonHeaders({
      "x-idempotency-key": `todo-e2e-signup-${suffix}`,
    }),
    data: {
      email,
      password: TEST_PASSWORD,
      tenantName,
      userName: "Todo E2E User",
    },
  });

  expect(signup.status(), "signup should succeed").toBe(201);
  const signupBody = (await signup.json()) as {
    accessToken: string;
    refreshToken: string;
    tenantId: string;
    tenantName: string;
  };

  const createWorkspace = await request.post(`${API_URL}/workspaces`, {
    headers: jsonHeaders({
      Authorization: `Bearer ${signupBody.accessToken}`,
      "x-idempotency-key": `todo-e2e-workspace-${suffix}`,
    }),
    data: {
      name: workspaceName,
      kind: "COMPANY",
      legalName: workspaceName,
      countryCode: "US",
      currency: "USD",
    },
  });

  expect(createWorkspace.status(), "workspace creation should succeed").toBe(201);
  const workspaceBody = (await createWorkspace.json()) as {
    workspace: {
      id: string;
      name: string;
    };
  };

  return {
    accessToken: signupBody.accessToken,
    refreshToken: signupBody.refreshToken,
    email,
    password: TEST_PASSWORD,
    tenantId: signupBody.tenantId,
    tenantName: signupBody.tenantName,
    workspaceId: workspaceBody.workspace.id,
    workspaceName: workspaceBody.workspace.name,
  };
}

export async function hydrateSession(page: Page, session: SeededSession): Promise<void> {
  await page.addInitScript((data: SeededSession) => {
    window.localStorage.setItem("accessToken", data.accessToken);
    window.localStorage.setItem("refreshToken", data.refreshToken);
    window.localStorage.setItem("corely-active-workspace", data.workspaceId);
  }, session);
}

export async function gotoTodos(page: Page, session: SeededSession): Promise<void> {
  await hydrateSession(page, session);
  await page.goto("/todos");
  await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
}

export function authHeaders(session: SeededSession): Record<string, string> {
  return {
    Authorization: `Bearer ${session.accessToken}`,
    "X-Workspace-Id": session.workspaceId,
  };
}
