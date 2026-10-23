import type { Dimension } from "../domain/stat-rules";

/** Dimensions whose values are enums with catalog labels. */
export const TRANSLATED: Partial<Record<Dimension, string>> = {
  cycle: "stu.cycle",
  gender: "stu.gender",
  status: "stu.status",
  registrationType: "stu.registrationType",
};
