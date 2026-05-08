import { NextResponse } from "next/server"

const protectedRoutes = [
  "/dashboard",
  "/teacher",
  "/student",
  "/coordinator",
  "/settings",
  "/questions",
  "/create",
  "/subjects",
]

export function middleware(request) {
  const { pathname } = request.nextUrl
  const isProtectedRoute = protectedRoutes.some((route) =>
    pathname === route || pathname.startsWith(`${route}/`)
  )

  if (!isProtectedRoute) {
    return NextResponse.next()
  }

  const authToken = request.cookies.get("auth-token")

  if (authToken) {
    return NextResponse.next()
  }

  const loginUrl = new URL("/login", request.url)
  loginUrl.searchParams.set("next", pathname)
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/teacher/:path*",
    "/student/:path*",
    "/coordinator/:path*",
    "/settings/:path*",
    "/questions/:path*",
    "/create/:path*",
    "/subjects/:path*",
  ],
}
