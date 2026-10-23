import type { Seeder } from "./types";

// Demo data for development: the dev lecturer gets a staff record so "my staff record" shows
// something. Idempotent by e-mail; the account is linked through User.personId.
export const hrStaffSeeder: Seeder = {
  name: "hr-staff",
  envs: ["dev", "demo"],
  async run(db) {
    const email = "lecturer@dev.logos.test";
    const user = await db.user.findUnique({ where: { email } });
    if (!user) return;
    const existing = await db.person.findUnique({ where: { email }, include: { staff: true } });
    if (existing?.staff) return;
    const department = await db.department.findUnique({ where: { code: "DEMO-A1" } });
    const person =
      existing ??
      (await db.person.create({
        data: {
          firstName: "Demo",
          lastName: "Lektor",
          gender: "FEMALE",
          birthDate: new Date("1985-03-15T00:00:00Z"),
          email,
        },
      }));
    await db.staff.create({
      data: {
        personId: person.id,
        kind: "ACADEMIC",
        category: "PAE",
        degree: "Doktoraturë",
        title: "Dr.",
        departmentId: department?.id ?? null,
        contractStart: new Date("2024-09-01T00:00:00Z"),
      },
    });
    await db.user.update({ where: { id: user.id }, data: { personId: person.id } });
  },
};
