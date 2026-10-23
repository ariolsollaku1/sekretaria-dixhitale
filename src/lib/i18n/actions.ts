"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { LOCALE_COOKIE, isLocale } from "./config";

/** Stores the choice in the cookie and, when signed in, on User.locale (AC-4). */
export async function setLocaleAction(locale: string): Promise<void> {
  if (!isLocale(locale)) return;
  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  const user = await getCurrentUser();
  if (user) await db.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}
