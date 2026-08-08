import Image from 'next/image'
import type { ImageRow } from '@/db'

/* ==========================================================================
   Every image on the site goes through here.

   Two rules it enforces so no page has to remember them:
     · a missing image renders a designed empty frame, never a broken icon and
       never a gaping grey box — and on /about, nothing at all
     · intrinsic width/height come from the database row, so nothing ever
       causes layout shift
   ========================================================================== */

export type SmartImageProps = {
  image: ImageRow | null | undefined
  /** Falls back to the stored alt. Pass '' only for genuinely decorative art. */
  alt?: string
  sizes: string
  className?: string
  priority?: boolean
  /** What to draw when there is no image. 'none' renders nothing. */
  empty?: 'frame' | 'none'
  /** Shown inside the empty frame. An invitation, not an error. */
  emptyLabel?: string
  /** Crops to the container. Off for /about, where the shape is the photo's. */
  fill?: boolean
}

export function SmartImage({
  image,
  alt,
  sizes,
  className,
  priority = false,
  empty = 'frame',
  emptyLabel = 'No image yet',
  fill = true,
}: SmartImageProps) {
  if (!image) {
    if (empty === 'none') return null
    return (
      <span className={['img img--empty', className].filter(Boolean).join(' ')}>
        <span className="label img__empty-label">{emptyLabel}</span>
      </span>
    )
  }

  const resolvedAlt = alt ?? image.alt ?? ''

  if (fill) {
    return (
      <span className={['img', className].filter(Boolean).join(' ')}>
        <Image
          src={image.path}
          alt={resolvedAlt}
          fill
          sizes={sizes}
          priority={priority}
          className="img__el"
        />
      </span>
    )
  }

  return (
    <Image
      src={image.path}
      alt={resolvedAlt}
      width={image.width}
      height={image.height}
      sizes={sizes}
      priority={priority}
      className={['img__el', className].filter(Boolean).join(' ')}
    />
  )
}
