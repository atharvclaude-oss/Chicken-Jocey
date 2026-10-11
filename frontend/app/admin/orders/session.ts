import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// Admin session helpers. Not a "use server" file on purpose: nothing here can be called from the
// browser. The admin key and password never leave the server; the session cookie holds a hash of
// the password, so changing ADMIN_PASSWORD signs everyone out.

const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:4000";
export const ADMIN_COOKIE = "room8_admin";
export const ORDERS_PAGE = "/admin/orders";

export function sessionToken(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  const key = process.env.ADMIN_API_KEY;
  if (!password || !key) return null;
  return createHash("sha256").update(`${password}:${key}`).digest("hex");
}

export const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function isSignedIn(): Promise<boolean> {
  const token = sessionToken();
  const cookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  return !!token && !!cookie && same(cookie, token);
}

/** Calls a key-protected backend admin route, only for a signed-in browser. */
export async function adminFetch(path: string, init: RequestInit = {}) {
  if (!(await isSignedIn())) redirect(ORDERS_PAGE);
  return fetch(`${BACKEND_URL}/admin${path}`, {
    ...init,
    headers: { authorization: `Bearer ${process.env.ADMIN_API_KEY}`, "content-type": "application/json", ...init.headers },
    cache: "no-store",
  });
}
