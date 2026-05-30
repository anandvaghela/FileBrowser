import type { Metadata } from 'next'
import { Toaster } from 'react-hot-toast'
import './globals.css'

export const metadata: Metadata = {
  title: 'FileBrowser',
  description: 'Modern file browser',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: 'var(--base-fm)' }}>
        <Toaster
          position="top-right"
          toastOptions={{
            style: {
              fontFamily: 'var(--base-fm)',
              borderRadius: '8px',
              fontSize: '14px',
              background: '#fff',
              color: '#1a1d26',
              boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
            },
            success: { iconTheme: { primary: '#4a6cf7', secondary: '#fff' } },
          }}
        />
        {children}
      </body>
    </html>
  )
}
