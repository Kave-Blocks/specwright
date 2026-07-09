import { clerkMiddleware } from '@clerk/nextjs/server'

// NOTE: Bare `clerkMiddleware()` attaches Clerk's auth context to every matched
// request but does NOT protect anything — all routes stay public until you opt
// in. Protect routes by passing a callback that calls `auth.protect()`, e.g.:
//
//   const isPublic = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])
//   export default clerkMiddleware(async (auth, req) => {
//     if (!isPublic(req)) await auth.protect()
//   })
//
// If you exclude `/api/(.*)` so handlers can return JSON 401/403 instead of a
// redirect, each API route must run its own auth guard — the middleware is no
// longer a backstop.
export default clerkMiddleware()

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
