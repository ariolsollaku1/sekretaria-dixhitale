import { getCopy } from "@/lib/auth/copy";

/** AC-6: what a page renders when `can()` is false. Next's `forbidden()` is still experimental. */
export function ForbiddenView() {
  const t = getCopy().forbidden;
  return (
    <main className="mx-auto max-w-sm p-8" role="alert">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="mt-2 text-sm">{t.body}</p>
    </main>
  );
}
