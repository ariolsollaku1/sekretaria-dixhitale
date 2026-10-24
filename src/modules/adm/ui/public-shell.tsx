import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";

/** The frame of the public application pages (outside the app shell, no login). */
export async function PublicShell({ title, children }: { title: string; children: ReactNode }) {
  const t = await getTranslations("shell");
  return (
    <main
      id="main-content"
      className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-6 sm:p-8"
    >
      <header>
        <p className="text-muted-foreground text-sm">
          {t("appName")} · {t("institution")}
        </p>
        <h1 className="mt-2 text-[32px] leading-tight font-semibold">{title}</h1>
      </header>
      {children}
    </main>
  );
}
