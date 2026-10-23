import { signInAction } from "@/lib/auth/actions";
import { getCopy, isReason } from "@/lib/auth/copy";
import { safeCallbackUrl } from "@/lib/auth/policy";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; reason?: string }>;
}) {
  const { callbackUrl, reason } = await searchParams;
  const t = getCopy();
  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-6 p-8">
      <header>
        <h1 className="text-2xl font-semibold">{t.title}</h1>
        <p className="mt-1 text-sm">{t.institution}</p>
      </header>
      {isReason(reason) && (
        <p role="status" className="rounded border p-3 text-sm">
          {t.reasons[reason]}
        </p>
      )}
      <form action={signInAction}>
        <input type="hidden" name="callbackUrl" value={safeCallbackUrl(callbackUrl)} />
        <button type="submit" className="w-full rounded bg-black px-4 py-2 text-white">
          {t.signIn}
        </button>
      </form>
    </main>
  );
}
