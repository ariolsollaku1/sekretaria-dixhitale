// Deliberately violates the module boundary; must make eslint fail (see tests/lint-boundaries.test.ts).
import { secret } from "@/modules/org/server/org.service";
import { allowed } from "@/modules/org";

export const x = [secret, allowed];
