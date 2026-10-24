import "server-only";
import { db } from "@/lib/db";
import { emailKey, studentIdentityMatches, type ApplicantKind } from "../domain/rules";

export type KnownApplicant =
  { kind: "student"; id: string; label: string } | { kind: "staff"; id: string; label: string };

type Candidate = {
  submissionId: string;
  kind: ApplicantKind;
  submitterId: string | null;
  answers: Record<string, unknown>;
};

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * AC-5 (Q-96): the student or staff record an application is about, when known. Signed-in
 * applications use the submitter's person; public ones the student number plus date of birth
 * (students) or the e-mail of the staff member's person (staff). A partial match is no match and
 * says nothing about which part was wrong. Returns a map by submission id (unknown ones absent).
 */
export async function knownApplicants(rows: Candidate[]): Promise<Map<string, KnownApplicant>> {
  const out = new Map<string, KnownApplicant>();
  if (rows.length === 0) return out;

  const submitterIds = [...new Set(rows.map((r) => r.submitterId).filter((x): x is string => !!x))];
  const users = await db.user.findMany({
    where: { id: { in: submitterIds } },
    select: { id: true, personId: true },
  });
  const personOf = new Map(users.map((u) => [u.id, u.personId]));

  const numbers = rows
    .filter((r) => !r.submitterId && r.kind === "student")
    .map((r) => (typeof r.answers.studentNumber === "string" ? r.answers.studentNumber.trim() : ""))
    .filter(Boolean);
  const emails = rows
    .filter((r) => !r.submitterId && r.kind !== "student")
    .map((r) => emailKey(r.answers.email))
    .filter(Boolean);
  const personIds = [...new Set([...personOf.values()].filter((x): x is string => !!x))];

  const [students, staff] = await Promise.all([
    db.student.findMany({
      where: { OR: [{ personId: { in: personIds } }, { studentNumber: { in: numbers } }] },
      select: {
        id: true,
        personId: true,
        studentNumber: true,
        person: { select: { birthDate: true } },
      },
    }),
    db.staff.findMany({
      where: {
        OR: [
          { personId: { in: personIds } },
          ...emails.map((e) => ({
            person: { email: { equals: e, mode: "insensitive" as const } },
          })),
        ],
      },
      select: { id: true, personId: true, person: { select: { email: true } } },
    }),
  ]);

  for (const r of rows) {
    const personId = r.submitterId ? (personOf.get(r.submitterId) ?? null) : null;
    if (r.kind === "student") {
      const s = r.submitterId
        ? students.find((x) => x.personId === personId)
        : students.find((x) =>
            studentIdentityMatches(r.answers, {
              studentNumber: x.studentNumber,
              birthDate: day(x.person.birthDate),
            }),
          );
      if (s) out.set(r.submissionId, { kind: "student", id: s.id, label: s.studentNumber });
    } else {
      const s = r.submitterId
        ? staff.find((x) => x.personId === personId)
        : staff.find(
            (x) => x.person.email && emailKey(x.person.email) === emailKey(r.answers.email),
          );
      if (s) out.set(r.submissionId, { kind: "staff", id: s.id, label: "" });
    }
  }
  return out;
}
