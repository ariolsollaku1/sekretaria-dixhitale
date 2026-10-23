import { getSessionCookie } from "better-auth/cookies";
import { NextResponse, type NextRequest } from "next/server";

// AC-1: optimistic redirect only. A cookie's presence proves nothing; requireUser() does the real
// check in every page, action and route handler.
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  const { pathname, search } = request.nextUrl;
  const login = new URL("/login", request.url);
  login.searchParams.set("callbackUrl", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything except the public pages, the API (own checks), and Next internals / static files.
  matcher: ["/((?!api|login|no-access|_next/static|_next/image|favicon.ico).*)"],
};
