// Removes the compose stack AND its named volumes (database, files). Asks for confirmation.
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";

const yes = process.argv.includes("--yes");
if (!yes) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(
    "This deletes ALL local data (pgdata, files volumes). Type 'reset' to continue: ",
  );
  rl.close();
  if (answer.trim() !== "reset") {
    console.log("Aborted.");
    process.exit(1);
  }
}

const profiles = ["dev", "full", "prod"].flatMap((p) => ["--profile", p]);
const res = spawnSync("docker", ["compose", ...profiles, "down", "--volumes", "--remove-orphans"], {
  stdio: "inherit",
});
process.exit(res.status ?? 1);
