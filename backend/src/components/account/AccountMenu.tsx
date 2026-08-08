'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react'
import { signOut } from '@/lib/actions/account-auth'
import { createClient } from '@/lib/supabase/client'
import { SUPABASE_URL, accountsEnabled } from '@/lib/supabase/config'

/* ==========================================================================
   The account's own navigation. Two pieces, one client boundary:

     · AccountMenu — the avatar and dropdown in the site nav, on every page
     · AccountTabs — the tab strip inside the /account shell

   They live together because they are the same thing at two scales, and
   because a layout is a Server Component and cannot ask for the current path:
   the tabs need usePathname, so they need to be over here.

   WHY THIS READS THE SESSION ITSELF
   The nav is rendered by SiteChrome, which is shared by every page on the
   site, and threading an account through it would make every page — the
   catalogue, the store, a 404 — wait on a Supabase round trip it does not
   otherwise need. So the menu resolves its own session in the browser, and the
   nav's props do not change at all.

   WHY THAT CANNOT MISMATCH ON HYDRATION
   The server has no session to read from here, so it renders the signed-out
   state. The first client render must therefore render the same thing, and it
   does: `account` starts as `null` and nothing reads the browser until an
   effect runs, which is after hydration has finished. The signed-in menu is a
   second paint, never a contradiction of the first.
   ========================================================================== */

/** What the menu needs to draw itself. Resolved in the browser, or passed in. */
export type AccountMenuProps = {
  signedIn: boolean
  displayName: string
  username: string | null
  avatarUrl: string | null
}

type Resolved = Omit<AccountMenuProps, 'signedIn'>

/**
 * Public URL for an avatar object path.
 *
 * Deliberately a copy of avatarUrl() in @/lib/account/queries — that module is
 * `server-only` and importing it here would break the client build. The bucket
 * is public, so the shape of the URL is not a secret; it is nine characters of
 * duplication against a module boundary that exists for a good reason.
 */
function publicAvatarUrl(path: string | null | undefined): string | null {
  if (!path) return null
  if (path.startsWith('http://') || path.startsWith('https://')) return path
  if (!SUPABASE_URL) return null
  return `${SUPABASE_URL}/storage/v1/object/public/avatars/${path}`
}

/** Up to two letters. A name, then a handle, then the one thing we always have. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/^@/, '')
    .split(/[\s._-]+/)
    .filter(Boolean)

  const first = words[0]
  if (!first) return '?'

  const second = words[1]
  const letters = second ? `${first[0] ?? ''}${second[0] ?? ''}` : first.slice(0, 2)
  return letters.toUpperCase()
}

/* --------------------------------------------------------------------------
   The square: a picture, or initials. Never a stock silhouette.
   -------------------------------------------------------------------------- */

export function Avatar({
  url,
  name,
  size = 'md',
  className,
}: {
  url: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const classes = [
    'ac-avatar',
    size === 'sm' ? 'ac-avatar--sm' : null,
    size === 'lg' ? 'ac-avatar--lg' : null,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={classes} aria-hidden="true">
      {url ? (
        /* Not next/image: this URL comes from a Supabase project that is set in
           an env var, so it can never be in next.config's remotePatterns. The
           box is a fixed square, so there is no layout shift to protect
           against either. */
        // eslint-disable-next-line @next/next/no-img-element
        <img className="ac-avatar__img" src={url} alt="" width={96} height={96} />
      ) : (
        <span className="ac-avatar__initials">{initialsOf(name)}</span>
      )}
    </span>
  )
}

/* --------------------------------------------------------------------------
   The nav menu
   -------------------------------------------------------------------------- */

/** The items, in the order the arrow keys walk them. Sign out is last. */
const LINKS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/settings', label: 'Settings' },
] as const

export function AccountMenu() {
  const [account, setAccount] = useState<Resolved | null>(null)

  /* Supabase is not configured on a fresh checkout, and the whole site works
     without it. Nothing to sign in to means nothing to render. */
  const enabled = accountsEnabled()

  useEffect(() => {
    if (!enabled) return

    let live = true
    const supabase = createClient()

    async function load(userId: string | null) {
      if (!userId) {
        if (live) setAccount(null)
        return
      }

      // Both reads are the customer's own rows under row level security; the
      // anon key cannot reach anybody else's, whatever id were passed here.
      const [{ data: user }, { data: profile }] = await Promise.all([
        supabase.from('users').select('username, email').eq('id', userId).maybeSingle(),
        supabase
          .from('profiles')
          .select('full_name, profile_picture')
          .eq('user_id', userId)
          .maybeSingle(),
      ])

      if (!live) return

      const username = user?.username ?? null
      setAccount({
        displayName:
          profile?.full_name || (username ? `@${username}` : (user?.email ?? 'Account')),
        username,
        avatarUrl: publicAvatarUrl(profile?.profile_picture),
      })
    }

    supabase.auth.getSession().then(({ data }) => {
      void load(data.session?.user.id ?? null)
    })

    // Signing out in another tab, or a token expiring, changes the bar here.
    const watch = supabase.auth.onAuthStateChange((_event, session) => {
      void load(session?.user.id ?? null)
    })

    return () => {
      live = false
      watch.data.subscription.unsubscribe()
    }
  }, [enabled])

  if (!enabled) return null

  return (
    <AccountMenuView
      signedIn={account !== null}
      displayName={account?.displayName ?? ''}
      username={account?.username ?? null}
      avatarUrl={account?.avatarUrl ?? null}
    />
  )
}

/**
 * The menu itself, given everything it needs. Split out so the markup can be
 * reasoned about — and tested — without a Supabase session in the way.
 */
export function AccountMenuView({
  signedIn,
  displayName,
  username,
  avatarUrl,
}: AccountMenuProps) {
  const menuId = useId()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  const wrapRef = useRef<HTMLDivElement | null>(null)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])

  const close = useCallback((returnFocus: boolean) => {
    setOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  // A menu left hanging over the page you have just navigated to is a bug, and
  // on mobile it covers the thing you tapped through to.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return

    // pointerdown, not click: a mousedown outside should dismiss before the
    // thing under the cursor reacts, which is what every native menu does.
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Node && wrapRef.current?.contains(target)) return
      close(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, close])

  // Opening a menu puts you in it. Without this, the first arrow press after
  // opening does nothing, because focus is still on the button.
  useEffect(() => {
    if (open) itemRefs.current[0]?.focus()
  }, [open])

  function moveFocus(from: number, delta: number) {
    const items = itemRefs.current.filter((item): item is HTMLElement => item !== null)
    if (items.length === 0) return
    const next = (from + delta + items.length) % items.length
    items[next]?.focus()
  }

  function onItemKeyDown(index: number) {
    return (event: ReactKeyboardEvent) => {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        moveFocus(index, 1)
      } else if (event.key === 'ArrowUp') {
        event.preventDefault()
        moveFocus(index, -1)
      } else if (event.key === 'Home') {
        event.preventDefault()
        moveFocus(-1, 1)
      } else if (event.key === 'End') {
        event.preventDefault()
        moveFocus(0, -1)
      } else if (event.key === 'Tab') {
        // Tabbing out of a menu closes it, but does not steal the focus back.
        close(false)
      }
    }
  }

  /* Signed out, and the state the server renders. One link, no machinery. */
  if (!signedIn) {
    return (
      <div className="ac-menu">
        <Link className="label ac-menu__signin" href="/login">
          Sign in
        </Link>
      </div>
    )
  }

  const handle = username ? `@${username}` : null

  return (
    <div
      className="ac-menu"
      ref={wrapRef}
      /* Escape is handled here rather than on the document because the nav has
         its own document-level Escape listener for the mobile sheet. Stopping
         the React event stops the native one before it leaves the app root, so
         closing this menu does not also close the sheet it is sitting in. */
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return
        event.stopPropagation()
        close(true)
      }}
    >
      <button
        type="button"
        className="ac-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        ref={triggerRef}
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' && !open) {
            event.preventDefault()
            setOpen(true)
          }
        }}
      >
        <Avatar url={avatarUrl} name={displayName} size="sm" />
        <span className="label ac-menu__name">{handle ?? displayName}</span>
        <span className="vh">— your account</span>
      </button>

      {open ? (
        <div className="ac-menu__pop">
          {/* Outside the menu, because a menu's children are menu items and
              this is a caption. */}
          <div className="ac-menu__head">
            <p className="ac-menu__head-name">{displayName}</p>
            {handle ? <p className="mono ac-menu__head-handle">{handle}</p> : null}
          </div>

          <div id={menuId} role="menu" aria-label="Your account">
            {LINKS.map((link, index) => (
              <Link
                key={link.href}
                className="label ac-menu__item"
                href={link.href}
                role="menuitem"
                tabIndex={-1}
                ref={(element) => {
                  itemRefs.current[index] = element
                }}
                onKeyDown={onItemKeyDown(index)}
                onClick={() => setOpen(false)}
              >
                {link.label}
              </Link>
            ))}

            {/* A real form posting to the action, so signing out works with the
                keyboard, with a screen reader, and with JavaScript switched
                off. role="none" because the form is plumbing, not an item. */}
            <form className="ac-menu__out" action={signOut} role="none">
              <button
                type="submit"
                className="label ac-menu__item"
                role="menuitem"
                tabIndex={-1}
                ref={(element) => {
                  itemRefs.current[LINKS.length] = element
                }}
                onKeyDown={onItemKeyDown(LINKS.length)}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* --------------------------------------------------------------------------
   The tab strip inside the account shell
   -------------------------------------------------------------------------- */

const TABS = [
  { href: '/account', label: 'Profile' },
  /* Owned by another part of the site. Linked, not built, from here. */
  { href: '/account/orders', label: 'Orders' },
  { href: '/account/addresses', label: 'Addresses' },
  { href: '/account/activity', label: 'Activity' },
  { href: '/account/settings', label: 'Settings' },
] as const

export function AccountTabs() {
  const pathname = usePathname()

  return (
    <nav className="ac-tabs" aria-label="Account">
      <div className="ac-tabs__list">
        {TABS.map((tab) => {
          // /account matches only itself; every other tab owns its subtree.
          const active =
            tab.href === '/account'
              ? pathname === '/account'
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`)

          return (
            <Link
              key={tab.href}
              className="label ac-tab"
              href={tab.href}
              aria-current={active ? 'page' : undefined}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
