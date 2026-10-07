"use client";

// Last-resort fallback when the root layout itself fails. It replaces the whole
// document, so it can't use globals.css or the navbar: styles are inline and
// follow the OS color scheme like the rest of the site.
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <title>Something went wrong | roomcommerce</title>
        <style>{`
          :root { color-scheme: light dark; --bg: #f3f4f5; --fg: #131416; --muted: #5b5e66; --accent: #c2410c; }
          @media (prefers-color-scheme: dark) { :root { --bg: #0d0e10; --fg: #ecedee; --muted: #9c9fa6; --accent: #ec7a4b; } }
          body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: var(--bg); color: var(--fg);
                 font-family: ui-sans-serif, system-ui, sans-serif; }
          main { max-width: 34rem; padding: 2rem 1rem; }
          p.code { font-family: ui-monospace, monospace; font-size: .875rem; color: var(--accent); margin: 0; }
          h1 { font-size: 2.25rem; letter-spacing: -.04em; margin: .75rem 0 0; }
          p { color: var(--muted); font-size: 1.125rem; line-height: 1.5; }
          .row { display: flex; gap: .5rem; margin-top: 2rem; flex-wrap: wrap; }
          button, a { height: 3rem; padding: 0 1.5rem; border-radius: 999px; font: 500 15px ui-sans-serif, system-ui, sans-serif;
                      display: inline-flex; align-items: center; cursor: pointer; text-decoration: none; }
          button { background: var(--fg); color: var(--bg); border: 0; }
          a { border: 1px solid color-mix(in srgb, var(--fg) 20%, transparent); color: var(--fg); }
        `}</style>
        <main>
          <p className="code">Error</p>
          <h1>Something went wrong.</h1>
          <p>The site hit a problem loading. Try again, or head back to the rooms. Your cart is saved.</p>
          {error.digest && <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>Reference: {error.digest}</p>}
          <div className="row">
            <button type="button" onClick={() => retry()}>Try again</button>
            {/* Plain <a>: a full reload is the point when the app shell itself failed. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/">Back to rooms</a>
          </div>
        </main>
      </body>
    </html>
  );
}
