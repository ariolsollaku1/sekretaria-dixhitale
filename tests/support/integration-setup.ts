import { beforeAll } from "vitest";
import { resetDatabase } from "@/lib/db/testing";

// Every integration test file starts from empty tables (AC-7).
beforeAll(async () => {
  await resetDatabase();
});
