import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'FPL Transfer Engine',
  description: 'Autonomous FPL Transfer Decision Engine — MILP-powered squad optimiser',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="bg-surface-canvas text-text-primary antialiased min-h-screen">
        {children}
      </body>
    </html>
  )
}
