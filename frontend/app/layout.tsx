import type { Metadata } from 'next'
import { Inter, IBM_Plex_Mono, JetBrains_Mono } from 'next/font/google'
import { ErrorBoundary } from '@/components/atoms/ErrorBoundary'
import 'maplibre-gl/dist/maplibre-gl.css'
import './globals.css'

const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-inter' })
const mono = IBM_Plex_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500'], variable: '--font-mono' })
const jetbrains = JetBrains_Mono({ subsets: ['latin', 'latin-ext'], weight: ['400', '500', '600'], variable: '--font-jetbrains' })

export const metadata: Metadata = {
  title: 'SewerScan',
  description: 'KI-gestützte Auswertung von Drohnen-Inspektionsvideos',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" className={`${inter.variable} ${mono.variable} ${jetbrains.variable}`}>
      <body style={{ fontFamily: 'var(--font-inter), Inter, sans-serif' }}>
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  )
}
