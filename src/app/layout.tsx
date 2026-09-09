import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Serif } from 'next/font/google';
import Link from 'next/link';
import './globals.css';

const sans = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
});

const display = IBM_Plex_Serif({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-display',
});

export const metadata: Metadata = {
  title: 'Declassified — Public Release Feed',
  description:
    'Continuous visual feed of U.S. declassified and public-release records. Draft for X with human approval only.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${sans.variable} ${display.variable}`}>
      <body className="font-sans antialiased">
        <header className="border-b border-ink-800/80 bg-ink-950/70 backdrop-blur sticky top-0 z-40">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
            <Link href="/" className="group">
              <div className="font-display text-xl font-bold tracking-tight text-ink-50">
                Declassified
              </div>
              <div className="stamp text-ink-400 group-hover:text-ink-300">
                U.S. public release feed
              </div>
            </Link>
            <nav className="flex items-center gap-3 text-sm">
              <Link
                href="/"
                className="rounded-md px-3 py-1.5 text-ink-200 hover:bg-ink-800 hover:text-white"
              >
                Feed
              </Link>
              <Link
                href="/drafts"
                className="rounded-md px-3 py-1.5 text-ink-200 hover:bg-ink-800 hover:text-white"
              >
                Draft queue
              </Link>
              <a
                href="https://github.com/TkFlux/declassified"
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-ink-700 px-3 py-1.5 text-ink-300 hover:border-ink-500 hover:text-white"
              >
                GitHub
              </a>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 pt-4 text-xs text-ink-400">
          Metadata and links only — no bulk PDF downloads. Drafts for X require
          human approval; nothing is auto-posted. State/NSA sources disabled in
          MVP.
        </footer>
      </body>
    </html>
  );
}
