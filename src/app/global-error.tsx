"use client";

// Last-resort boundary: replaces the root layout, so no providers or catalogs are available.
// Both languages are shown on purpose.
export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="sq">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <main role="alert">
          <h1>Diçka shkoi keq / Something went wrong</h1>
          <button type="button" onClick={reset} style={{ minHeight: 44, padding: "0 16px" }}>
            Provo përsëri / Try again
          </button>
        </main>
      </body>
    </html>
  );
}
