import "server-only";
import { registerFormHandler } from "@/lib/forms/handlers";
import { INTEREST_HANDLER, isEmail, matchProgram, normalizeEmail } from "../domain/lead-rules";

const text = (v: unknown, max: number) => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};

/**
 * SRC-030, AC-2: a stored interest-form submission becomes a lead in the same transaction. The
 * form's own validation already ran; the handler only maps the answers (and drops what does not fit
 * rather than refusing a prospect).
 */
registerFormHandler(INTEREST_HANDLER, {
  async onSubmitted({ db, audit }, submission) {
    const a = submission.answers;
    const email = text(a.email, 254);
    const programNote = text(a.program, 200);
    const programs = programNote
      ? await db.studyProgram.findMany({
          where: { active: true },
          select: { id: true, code: true, name: true, nameEn: true },
        })
      : [];
    const consent = a.consent === true;
    const lead = await db.lead.create({
      data: {
        firstName: text(a.firstName, 100) ?? "-",
        lastName: text(a.lastName, 100) ?? "-",
        email: email && isEmail(email) ? normalizeEmail(email) : null,
        phone: text(a.phone, 40),
        programId: matchProgram(programNote, programs),
        programNote,
        message: text(a.message, 2000),
        source: "WEBSITE",
        sourceNote: submission.formKey,
        consent,
        consentAt: consent ? new Date() : null,
        submissionId: submission.submissionId,
        events: { create: { kind: "CREATED" } },
      },
    });
    await audit({
      action: "adm.lead.create",
      entityType: "Lead",
      entityId: lead.id,
      before: null,
      after: { source: "WEBSITE", programId: lead.programId, status: "NEW" },
    });
  },
});
