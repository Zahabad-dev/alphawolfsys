import { auth } from "@/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoginPage = pathname === "/login";

  if (!req.auth && !isLoginPage) {
    const loginUrl = new URL("/login", req.nextUrl);
    return NextResponse.redirect(loginUrl);
  }

  if (req.auth && isLoginPage) {
    return NextResponse.redirect(new URL("/venta", req.nextUrl));
  }

  if (req.auth && pathname.startsWith("/admin") && req.auth.user.rol !== "admin") {
    return NextResponse.redirect(new URL("/venta", req.nextUrl));
  }
});

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|icons|brand).*)",
  ],
};
