import { signOutAction } from "@/lib/auth/actions";
import { getCopy } from "@/lib/auth/copy";
import { requireUser } from "@/lib/auth";

// Placeholder until PLT-06 (app shell & i18n) replaces it.
export default async function HomePage() {
  const user = await requireUser("/");
  const t = getCopy();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">{t.title}</h1>
      <p className="mt-2 text-sm">{t.institution}</p>
      <p className="mt-6 text-sm" data-testid="current-user">
        {t.hello}, {user.name}
      </p>
      <form action={signOutAction} className="mt-4">
        <button type="submit" className="rounded border px-3 py-1 text-sm">
          {t.signOut}
        </button>
      </form>
    </main>
  );
}
