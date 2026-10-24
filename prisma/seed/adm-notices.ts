import type { Seeder } from "./types";

// Demo data for development: one published registration notice for the current demo year. The
// deadline and the document lines are an illustration, not LOGOS's real campaign (Q-98, Q-99).
// Fees are never seeded: the notice reads whatever the FIN-01 fee schedule holds. Only seeded
// while no registration notice exists.
export const admNoticesSeeder: Seeder = {
  name: "adm-notices",
  envs: ["dev", "demo"],
  async run(db) {
    const year = await db.academicYear.findUnique({ where: { code: "2026-2027" } });
    if (!year || (await db.registrationNotice.count()) > 0) return;
    const announcement = await db.announcement.create({
      data: {
        title: "Demo: regjistrimet për vitin akademik 2026-2027",
        body: "Hapen regjistrimet për vitin e ri akademik. Shiko më poshtë afatin dhe dokumentet e nevojshme.",
        status: "PUBLISHED",
        audience: "ALL",
        publishAt: new Date("2026-07-01T00:00:00Z"),
      },
    });
    await db.registrationNotice.create({
      data: {
        announcementId: announcement.id,
        academicYearId: year.id,
        registrationDeadline: new Date("2026-10-09T00:00:00Z"),
        documents: ["Demo: diploma e shkollës së mesme", "Demo: fotokopje e letërnjoftimit"],
        contractExcerpt: "Demo: pjesë e kontratës së studentit.",
      },
    });
  },
};
