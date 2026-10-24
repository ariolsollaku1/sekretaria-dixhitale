import "server-only";
import { db } from "@/lib/db";
import type { LeadSource, LeadStatus } from "../domain/lead-rules";

/** Roles that hold `adm.lead.write` (the assignee candidates, AC-7). */
const WRITER_ROLES = ["secretary", "student_affairs"] as const;

export async function listAssigneeOptions() {
  const now = new Date();
  return db.user.findMany({
    where: {
      active: true,
      roles: {
        some: {
          role: { in: [...WRITER_ROLES] },
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
      },
    },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });
}

export async function listLeadProgramOptions() {
  const programs = await db.studyProgram.findMany({
    where: { active: true },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true },
  });
  return programs.map((p) => ({ id: p.id, label: `${p.code} · ${p.name}` }));
}

export type LeadView = {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  programId: string | null;
  programLabel: string | null;
  programNote: string | null;
  message: string | null;
  source: LeadSource;
  sourceNote: string | null;
  consent: boolean;
  consentAt: Date | null;
  status: LeadStatus;
  lostReason: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  invitedAt: Date | null;
  submissionReference: string | null;
  createdAt: Date;
  events: {
    id: string;
    kind: string;
    fromStatus: LeadStatus | null;
    toStatus: LeadStatus | null;
    body: string | null;
    actorName: string | null;
    createdAt: Date;
  }[];
};

/** AC-5: one lead with its history; null when it does not exist. */
export async function getLead(id: string): Promise<LeadView | null> {
  const lead = await db.lead.findUnique({
    where: { id },
    include: {
      program: { select: { code: true, name: true } },
      events: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!lead) return null;
  const userIds = [
    ...new Set([
      ...lead.events.flatMap((e) => (e.actorId ? [e.actorId] : [])),
      ...(lead.assigneeId ? [lead.assigneeId] : []),
    ]),
  ];
  const [users, submission] = await Promise.all([
    db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }),
    lead.submissionId
      ? db.formSubmission.findUnique({
          where: { id: lead.submissionId },
          select: { reference: true },
        })
      : null,
  ]);
  const names = new Map(users.map((u) => [u.id, u.name]));
  return {
    id: lead.id,
    firstName: lead.firstName,
    lastName: lead.lastName,
    email: lead.email,
    phone: lead.phone,
    programId: lead.programId,
    programLabel: lead.program ? `${lead.program.code} · ${lead.program.name}` : null,
    programNote: lead.programNote,
    message: lead.message,
    source: lead.source,
    sourceNote: lead.sourceNote,
    consent: lead.consent,
    consentAt: lead.consentAt,
    status: lead.status,
    lostReason: lead.lostReason,
    assigneeId: lead.assigneeId,
    assigneeName: lead.assigneeId ? (names.get(lead.assigneeId) ?? null) : null,
    invitedAt: lead.invitedAt,
    submissionReference: submission?.reference ?? null,
    createdAt: lead.createdAt,
    events: lead.events.map((e) => ({
      id: e.id,
      kind: e.kind,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      body: e.kind === "ASSIGNED" ? (names.get(e.body ?? "") ?? null) : e.body,
      actorName: e.actorId ? (names.get(e.actorId) ?? null) : null,
      createdAt: e.createdAt,
    })),
  };
}
