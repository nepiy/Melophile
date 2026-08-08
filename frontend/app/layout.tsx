import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Melophile Records' }

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>
}
