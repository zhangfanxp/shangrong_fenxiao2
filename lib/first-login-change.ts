import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sessionCookieSecure } from "@/lib/session-cookie";

export type FirstLoginChannel = "lead_pc" | "lead_h5" | "store_h5";
export type FirstLoginChangePayload = { userId: string; channel: FirstLoginChannel };

const cookieName = "canyin_first_login_change";
const audience = "first_login_password_change";
const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "development-secret-change-me");

export async function createFirstLoginChangeToken(payload: FirstLoginChangePayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setAudience(audience)
    .setExpirationTime("15m")
    .sign(secret);
}

export async function getFirstLoginChangePayload(): Promise<FirstLoginChangePayload | null> {
  const token = (await cookies()).get(cookieName)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret, { audience });
    const value = payload as unknown as FirstLoginChangePayload;
    if (!value.userId || !["lead_pc", "lead_h5", "store_h5"].includes(value.channel)) return null;
    return value;
  } catch {
    return null;
  }
}

export const firstLoginChangeCookie = {
  name: cookieName,
  options: {
    httpOnly: true,
    secure: sessionCookieSecure(),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 15,
  },
};

export async function firstLoginChangeResponse(payload: FirstLoginChangePayload, realName: string) {
  const token = await createFirstLoginChangeToken(payload);
  const response = NextResponse.json({ realName, redirectTo: "/first-login-password-change" });
  response.cookies.set(firstLoginChangeCookie.name, token, firstLoginChangeCookie.options);
  for (const name of ["canyin_session", "canyin_lead_h5_session", "canyin_store_h5_session"]) {
    response.cookies.set(name, "", { httpOnly: true, secure: sessionCookieSecure(), sameSite: "lax", path: "/", maxAge: 0 });
  }
  return response;
}
