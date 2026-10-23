import { z } from "zod";

const isDay = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const optionalDay = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isDay(v), "invalidDate");

export const AUDIENCES = ["ALL", "STAFF", "STUDENTS", "CYCLE", "PROGRAM"] as const;
export type Audience = (typeof AUDIENCES)[number];

/**
 * AC-1/AC-2: the author works with days (shown in Europe/Tirane): "visible from" (blank = at once
 * when published) and "visible until" (inclusive). The service turns them into instants.
 * Messages are catalog keys (`ntf.errors.*`).
 */
export const announcementSchema = z
  .object({
    title: z.string().trim().min(1, "required").max(200, "tooLong"),
    body: z.string().trim().min(1, "required").max(10_000, "tooLong"),
    audience: z.enum(AUDIENCES),
    cycle: z
      .enum(["FIRST", "SECOND"])
      .nullish()
      .transform((v) => v ?? null),
    programId: z
      .string()
      .nullish()
      .transform((v) => (v ? v : null)),
    publishDate: optionalDay,
    expiresDate: optionalDay,
    pinned: z.boolean().default(false),
    emailPush: z.boolean().default(false),
  })
  .superRefine((v, ctx) => {
    if (v.audience === "CYCLE" && !v.cycle)
      ctx.addIssue({ code: "custom", path: ["cycle"], message: "cycleRequired" });
    if (v.audience === "PROGRAM" && !v.programId)
      ctx.addIssue({ code: "custom", path: ["programId"], message: "programRequired" });
    if (v.publishDate && v.expiresDate && v.expiresDate < v.publishDate)
      ctx.addIssue({ code: "custom", path: ["expiresDate"], message: "expiresBeforePublish" });
    if (v.emailPush && (v.audience === "CYCLE" || v.audience === "PROGRAM"))
      ctx.addIssue({ code: "custom", path: ["emailPush"], message: "pushNotForAudience" });
  })
  .transform((v) => ({
    ...v,
    cycle: v.audience === "CYCLE" ? v.cycle : null,
    programId: v.audience === "PROGRAM" ? v.programId : null,
  }));
export type AnnouncementFormInput = z.input<typeof announcementSchema>;
export type AnnouncementInput = z.output<typeof announcementSchema>;

export const idSchema = z.object({ announcementId: z.string().min(1) });
export const createAnnouncementSchema = announcementSchema.and(
  z.object({ fileIds: z.array(z.string().min(1)).max(5).default([]) }),
);
export const updateAnnouncementSchema = announcementSchema
  .and(idSchema)
  .and(z.object({ fileIds: z.array(z.string().min(1)).max(5).default([]) }));
export const publishSchema = idSchema;
export const removeFileSchema = idSchema.extend({ fileId: z.string().min(1) });

export const MAX_ATTACHMENTS = 5;
