"use client";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { sendTestMessageAction, setPreferenceAction } from "@/lib/notify/notify.actions";

export type PreferenceRow = { type: string; label: string; mandatory: boolean; email: boolean };

/** AC-11/AC-12: per-type e-mail switches and (for sysadmins) the test message. */
export function PreferencesForm({ rows, canTest }: { rows: PreferenceRow[]; canTest: boolean }) {
  const t = useTranslations("notifications.prefs");
  const router = useRouter();
  const [state, setState] = useState(() => Object.fromEntries(rows.map((r) => [r.type, r.email])));
  const [testing, setTesting] = useState(false);

  async function toggle(type: string, email: boolean) {
    setState((s) => ({ ...s, [type]: email }));
    const result = await setPreferenceAction({ type, email });
    if (result.ok) toast.success(t("saved"));
    else {
      setState((s) => ({ ...s, [type]: !email }));
      toast.error(t("testFailed"));
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <p className="text-muted-foreground text-sm">{t("intro")}</p>
      <ul className="flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.type}
            className="rounded-control border-border bg-card flex min-h-11 items-center justify-between gap-3 border px-3 py-2"
          >
            <span className="font-semibold">{r.label}</span>
            {r.mandatory ? (
              <span className="text-muted-foreground text-sm">{t("always")}</span>
            ) : (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={state[r.type]}
                  onChange={(e) => void toggle(r.type, e.target.checked)}
                  className="size-4"
                />
                {t("email")}
                <span className="sr-only">: {r.label}</span>
              </label>
            )}
          </li>
        ))}
      </ul>
      {canTest && (
        <section
          aria-labelledby="test-title"
          className="rounded-card border-border bg-card border p-4"
        >
          <h2 id="test-title" className="font-semibold">
            {t("testTitle")}
          </h2>
          <p className="text-muted-foreground mb-3 text-sm">{t("testHint")}</p>
          <Button
            type="button"
            disabled={testing}
            onClick={async () => {
              setTesting(true);
              const result = await sendTestMessageAction({});
              setTesting(false);
              if (result.ok) {
                toast.success(t("testSent"));
                router.refresh();
              } else toast.error(t("testFailed"));
            }}
          >
            {t("testButton")}
          </Button>
        </section>
      )}
    </div>
  );
}
