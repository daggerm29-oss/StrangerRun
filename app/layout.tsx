import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import { Libre_Baskerville, Oswald } from 'next/font/google'
import './globals.css'

const serif = Libre_Baskerville({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-display' })
const sans = Oswald({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-hud' })

export const metadata: Metadata = {
  title: 'Stranger Run — Escape the Upside Down',
  description:
    'An endless runner set in the Upside Down. Swipe to dodge vines, rifts and Demodogs while the Demogorgon hunts you. Built for Telegram Mini Apps.',
  generator: 'v0.app',
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  colorScheme: 'dark',
  themeColor: '#0a0203',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${serif.variable} ${sans.variable} bg-background`}>
      <head>
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body className="antialiased font-sans">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
