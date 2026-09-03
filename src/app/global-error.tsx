"use client";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, which
 * src/app/error.tsx sits inside of and therefore cannot catch.
 *
 * It replaces the root layout when active, so it must render its own <html>
 * and <body> — and it does not get globals.css, the fonts or the nav. That is
 * why the styling here is inline rather than Tailwind classes: this file has
 * to look deliberate with no stylesheet loaded at all.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
          background: "#fafafa",
          color: "#18181b",
        }}
      >
        <main style={{ maxWidth: "28rem", textAlign: "center" }}>
          <p style={{ fontSize: "2rem", margin: 0 }} aria-hidden="true">
            🐷
          </p>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 600, margin: "0.75rem 0 0" }}>
            The app failed to start
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#52525b", margin: "0.5rem 0 0" }}>
            Something went wrong before the page could load. Try again, and if it keeps happening
            the farm records themselves are untouched — nothing is saved by a screen that never
            rendered.
          </p>
          {error.digest ? (
            <p style={{ fontSize: "0.75rem", color: "#a1a1aa", margin: "0.75rem 0 0" }}>
              Reference: <code>{error.digest}</code>
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: "1.25rem",
              padding: "0.5rem 1rem",
              fontSize: "0.875rem",
              fontWeight: 500,
              color: "#ffffff",
              background: "#18181b",
              border: "none",
              borderRadius: "0.375rem",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
