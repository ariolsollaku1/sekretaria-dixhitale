import "server-only";
import { zonedDay } from "@/lib/i18n/zone";
import { db } from "@/lib/db";
import { resolveHorizonDays } from "../domain/contract-rules";

export async function getHorizonDays(): Promise<number> {
  const row = await db.systemSetting.findUnique({ where: { key: "hr.contractHorizonDays" } });
  return resolveHorizonDays(row?.value);
}

/** Today in Europe/Tirane as a day string. */
export const today = (now = new Date()): string => zonedDay(now);
