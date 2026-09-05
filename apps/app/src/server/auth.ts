/**
 * Auth server helpers — OTP, JWT, sessions.
 *
 * In local dev (NODE_ENV !== "production"):
 *  - OTP codes are printed to the server console instead of emailed.
 *  - No Resend API call is made.
 */
import { getPrisma } from "./prisma";
import crypto from "node:crypto";
import { createHash, randomInt } from "node:crypto";

// ── Constants ──────────────────────────────────────────────────────────────

const IS_DEV = process.env.NODE_ENV !== "production";
const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-in-prod";
const ACCESS_TOKEN_TTL_SEC = 60 * 60; // 1 h
const REFRESH_TOKEN_TTL_SEC = 60 * 60 * 24 * 30; // 30 days
const OTP_TTL_MINUTES = 15;
const OTP_COOLDOWN_SEC = 60;
const OTP_MAX_ATTEMPTS = 5;

// ── OTP helpers ────────────────────────────────────────────────────────────

function generateOtpCode(): string {
  return String(randomInt(100_000, 999_999));
}

function hashCode(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// ── JWT (simple HS256 via Web Crypto) ──────────────────────────────────────

function base64url(buf: Buffer | string): string {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return b.toString("base64url");
}

async function signJwt(
  payload: Record<string, unknown>,
  expiresInSec: number
): Promise<string> {
  const header = base64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = base64url(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + expiresInSec })
  );
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey(
    "raw",
    Buffer.from(JWT_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, Buffer.from(data));
  return `${data}.${base64url(Buffer.from(sig))}`;
}

export async function verifyJwt(
  token: string
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      Buffer.from(JWT_SECRET),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"]
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      Buffer.from(sig, "base64url"),
      Buffer.from(`${header}.${body}`)
    );
    if (!valid) return null;
    const decoded = JSON.parse(Buffer.from(body, "base64url").toString()) as Record<string, unknown>;
    if (typeof decoded.exp === "number" && decoded.exp < Math.floor(Date.now() / 1000)) return null;
    return decoded;
  } catch {
    return null;
  }
}

// ── Problem helpers ────────────────────────────────────────────────────────

function problem(status: number, title: string, detail?: string): Response {
  return Response.json(
    { type: "about:blank", title, detail: detail ?? title, status, code: `Auth:${title.replace(/\s+/g, "")}` },
    { status }
  );
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * POST /auth/request-code
 * Generates a 6-digit OTP, stores it hashed, and:
 *  - In DEV: logs the plain code to the console
 *  - In PROD: sends the code by email (Resend)
 */
export async function handleRequestCode(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as {
    email?: string;
    mode?: "login" | "signup";
    tenantId?: string | null;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    return problem(400, "Bad Request", "email is required");
  }

  const prisma = getPrisma();

  // Check existing unexpired code for cooldown
  const existing = await prisma.portalOtpCode.findFirst({
    where: {
      emailNormalized: email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (existing) {
    const cooldownEnd = new Date(existing.lastSentAt.getTime() + OTP_COOLDOWN_SEC * 1000);
    if (new Date() < cooldownEnd) {
      const secondsLeft = Math.ceil((cooldownEnd.getTime() - Date.now()) / 1000);
      return Response.json({
        message: "Code already sent. Please wait before requesting again.",
        status: "cooldown",
        canProceed: false,
        cooldownSeconds: secondsLeft,
      });
    }
    // Update lastSentAt and reuse same code entry
    const code = generateOtpCode();
    await prisma.portalOtpCode.update({
      where: { id: existing.id },
      data: {
        codeHash: hashCode(code),
        lastSentAt: new Date(),
        expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
        attemptCount: 0,
      },
    });
    await deliverOtp(email, code);
    return Response.json({ message: "Verification code sent.", status: "code_sent", canProceed: true, nextAction: "enter_code" });
  }

  // Create new OTP
  const code = generateOtpCode();
  await prisma.portalOtpCode.create({
    data: {
      emailNormalized: email,
      tenantId: body.tenantId ?? "demo",
      codeHash: hashCode(code),
      expiresAt: new Date(Date.now() + OTP_TTL_MINUTES * 60_000),
    },
  });

  await deliverOtp(email, code);

  return Response.json({
    message: "Verification code sent.",
    status: "code_sent",
    canProceed: true,
    nextAction: "enter_code",
  });
}

/**
 * POST /auth/verify-code
 */
export async function handleVerifyCode(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as {
    email?: string;
    code?: string;
    mode?: "login" | "signup";
    tenantId?: string | null;
    tenantName?: string;
    userName?: string;
  };

  const email = (body.email ?? "").trim().toLowerCase();
  const code = (body.code ?? "").trim();

  if (!email || !code) {
    return problem(400, "Bad Request", "email and code are required");
  }

  const prisma = getPrisma();

  const otpRecord = await prisma.portalOtpCode.findFirst({
    where: {
      emailNormalized: email,
      consumedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otpRecord) {
    return problem(400, "InvalidCode", "No active code found. Please request a new one.");
  }

  if (otpRecord.attemptCount >= OTP_MAX_ATTEMPTS) {
    return problem(400, "TooManyAttempts", "Too many failed attempts. Please request a new code.");
  }

  if (otpRecord.codeHash !== hashCode(code)) {
    await prisma.portalOtpCode.update({
      where: { id: otpRecord.id },
      data: { attemptCount: { increment: 1 } },
    });
    return problem(400, "InvalidCode", "Invalid verification code.");
  }

  // Mark consumed
  await prisma.portalOtpCode.update({
    where: { id: otpRecord.id },
    data: { consumedAt: new Date() },
  });

  // Find or create user
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    // Auto-create on first login (passwordless signup flow)
    user = await prisma.user.create({
      data: {
        email,
        name: body.userName ?? email.split("@")[0],
        passwordHash: "",
        status: "ACTIVE",
      },
    });
  }

  // Find tenant membership
  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    include: { tenant: true },
  });

  const tenantId = membership?.tenantId ?? null;
  const tenantName = membership?.tenant?.name ?? null;

  // Issue tokens
  const accessToken = await signJwt(
    { sub: user.id, email: user.email, tenantId },
    ACCESS_TOKEN_TTL_SEC
  );
  const rawRefresh = crypto.randomBytes(40).toString("hex");
  const refreshToken = rawRefresh;

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tenantId,
      tokenHash: hashCode(rawRefresh),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_SEC * 1000),
    },
  });

  return Response.json({
    accessToken,
    refreshToken,
    userId: user.id,
    email: user.email,
    tenantId,
    tenantName,
  });
}

/**
 * GET /auth/me
 */
export async function handleGetMe(request: Request): Promise<Response> {
  const token = extractBearer(request);
  if (!token) return problem(401, "Unauthorized");

  const payload = await verifyJwt(token);
  if (!payload) return problem(401, "Unauthorized");

  const prisma = getPrisma();
  const user = await prisma.user.findUnique({
    where: { id: payload.sub as string },
    include: {
      memberships: { include: { tenant: true, role: true } },
    },
  });

  if (!user) return problem(401, "Unauthorized");

  return Response.json({
    userId: user.id,
    email: user.email,
    name: user.name,
    isSuperAdmin: false,
    activeTenantId: (payload.tenantId as string | null) ?? null,
    memberships: user.memberships.map((m) => ({
      tenantId: m.tenantId,
      tenantName: m.tenant?.name,
      roleId: m.roleId,
    })),
  });
}

/**
 * POST /auth/refresh
 */
export async function handleRefresh(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { refreshToken?: string };
  const rawToken = body.refreshToken ?? "";
  if (!rawToken) return problem(401, "Unauthorized");

  const prisma = getPrisma();
  const record = await prisma.refreshToken.findFirst({
    where: {
      tokenHash: hashCode(rawToken),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: { user: true },
  });

  if (!record) return problem(401, "Unauthorized", "Refresh token invalid or expired");

  const accessToken = await signJwt(
    { sub: record.userId, email: record.user.email, tenantId: record.tenantId },
    ACCESS_TOKEN_TTL_SEC
  );

  return Response.json({ accessToken });
}

/**
 * POST /auth/logout
 */
export async function handleLogout(request: Request): Promise<Response> {
  const body = await request.json().catch(() => ({})) as { refreshToken?: string };
  const rawToken = body.refreshToken ?? "";

  if (rawToken) {
    const prisma = getPrisma();
    await prisma.refreshToken.updateMany({
      where: { tokenHash: hashCode(rawToken) },
      data: { revokedAt: new Date() },
    });
  }

  return new Response(null, { status: 204 });
}

// ── Helpers ────────────────────────────────────────────────────────────────

function extractBearer(request: Request): string | null {
  const auth = request.headers.get("authorization") ?? "";
  if (!auth.startsWith("Bearer ")) return null;
  return auth.slice(7);
}

/** Dev: console.log the plain code. Prod: send email via Resend. */
async function deliverOtp(email: string, code: string): Promise<void> {
  if (IS_DEV) {
    console.log("\n┌─────────────────────────────────────────┐");
    console.log(`│  🔑 OTP for ${email.padEnd(28)}│`);
    console.log(`│      Code: ${code.padEnd(30)}│`);
    console.log(`│      (expires in ${OTP_TTL_MINUTES} minutes)           │`);
    console.log("└─────────────────────────────────────────┘\n");
    return;
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[auth] RESEND_API_KEY not set — skipping email");
    return;
  }

  const fromAddress = process.env.EMAIL_FROM ?? "noreply@specpilot.app";
  await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: fromAddress,
      to: email,
      subject: `Your SpecPilot verification code: ${code}`,
      html: `<p>Your verification code is: <strong>${code}</strong></p><p>It expires in ${OTP_TTL_MINUTES} minutes.</p>`,
      text: `Your verification code is: ${code}\n\nIt expires in ${OTP_TTL_MINUTES} minutes.`,
    }),
  });
}
