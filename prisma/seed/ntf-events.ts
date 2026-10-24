import type { Seeder } from "./types";

// Demo data for development (NTF-02): one open workshop and one draft, so the events pages are not
// empty. Illustrative texts, not LOGOS's real programme. Only seeded while there are no events.
const DAY = 24 * 60 * 60 * 1000;

export const ntfEventsSeeder: Seeder = {
  name: "ntf-events",
  envs: ["dev", "demo"],
  async run(db) {
    if ((await db.event.count()) > 0) return;
    const start = new Date(Date.now() + 30 * DAY);
    start.setUTCHours(15, 0, 0, 0);
    await db.event.createMany({
      data: [
        {
          title: "Demo: workshop mbi shkrimin akademik",
          description: "Një workshop praktik për studentët. Vendet janë të kufizuara.",
          location: "Salla 3",
          startsAt: start,
          endsAt: new Date(start.getTime() + 2 * 60 * 60 * 1000),
          capacity: 30,
          status: "PUBLISHED",
          audience: "ALL",
        },
        {
          title: "Demo: konferencë (skicë)",
          description: "Ende në përgatitje.",
          location: "Auditori",
          startsAt: new Date(start.getTime() + 20 * DAY),
          status: "DRAFT",
          audience: "STUDENTS",
        },
      ],
    });
  },
};
