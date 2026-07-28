import { signInWithGoogle } from '@/lib/actions/account-auth'

/* ==========================================================================
   Continue with Google.

   A plain form posting to a server action, so it works before any JavaScript
   has loaded and there is no OAuth state held in the browser. The action
   builds the provider URL and redirects; `next` travels with it and is
   re-validated on the way back in /auth/callback.
   ========================================================================== */

export function GoogleButton({
  /** Where to land after the round trip. Validated again on return. */
  next = '/account',
}: {
  next?: string
}) {
  return (
    <form action={signInWithGoogle} className="au-oauth">
      <input type="hidden" name="next" value={next} />

      <button type="submit" className="btn au-oauth__btn">
        <GoogleMark />
        Continue with Google
      </button>
    </form>
  )
}

/**
 * The Google "G".
 *
 * THE ONE PLACE ON THIS SITE WHERE A NON-TOKEN COLOUR IS ALLOWED. Google's
 * brand guidelines require the mark in its official four colours — recolouring
 * it to --lamp, or flattening it to a single fill, is not permitted use. Every
 * other pixel on every auth screen comes from tokens.css.
 *
 * `fill` is set on each path explicitly because base.css defaults svg to
 * `fill: none`.
 */
function GoogleMark() {
  return (
    <svg
      className="au-oauth__mark"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.52 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.63v3h3.88c2.27-2.09 3.57-5.17 3.57-8.87z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.15-4.07 1.15-3.13 0-5.78-2.11-6.72-4.95H1.28v3.09A11.99 11.99 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76l4-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0 7.31 0 3.25 2.7 1.28 6.62l4 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  )
}
