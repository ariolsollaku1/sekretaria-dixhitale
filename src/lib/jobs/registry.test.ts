import { beforeEach, describe, expect, it } from "vitest";
import { defineJob, getJob, listJobs, resetJobs, resolveJob } from "./registry";

const handler = async () => undefined;
beforeEach(resetJobs);

describe("job declarations (AC-1)", () => {
  it("applies the defaults", () => {
    expect(defineJob({ name: "plt.demo.run", handler })).toMatchObject({
      retryLimit: 3,
      retryDelaySeconds: 30,
      retryBackoff: true,
      expireInSeconds: 900,
      concurrency: 1,
      cron: undefined,
    });
  });

  it.each(["demo", "Plt.demo", "plt.", "plt..x", "plt.demo run", "1plt.demo", "plt.Demo", ""])(
    "rejects the name %j",
    (name) => {
      expect(() => resolveJob({ name, handler })).toThrow(/Invalid job name/);
    },
  );
  it.each(["plt.demo", "fin.reminders.send", "plt.files.cleanup-orphans"])(
    "accepts the name %j",
    (name) => {
      expect(resolveJob({ name, handler }).name).toBe(name);
    },
  );

  it.each([
    [{ retryLimit: -1 }, /retryLimit/],
    [{ retryLimit: 21 }, /retryLimit/],
    [{ retryLimit: 1.5 }, /retryLimit/],
    [{ retryDelaySeconds: 3601 }, /retryDelaySeconds/],
    [{ expireInSeconds: 0 }, /expireInSeconds/],
    [{ concurrency: 0 }, /concurrency/],
    [{ concurrency: 11 }, /concurrency/],
    [{ cron: "* * *" }, /cron/],
    [{ cron: "" }, /cron/],
  ])("rejects options %j", (opts, message) => {
    expect(() => resolveJob({ name: "plt.demo", handler, ...opts })).toThrow(message);
  });

  it("accepts a 5-field cron and zero retries", () => {
    expect(
      resolveJob({ name: "plt.demo", handler, cron: "0 3 * * *", retryLimit: 0 }),
    ).toMatchObject({ cron: "0 3 * * *", retryLimit: 0 });
  });

  it("lists jobs sorted, replaces a re-declared name, and finds by name", () => {
    defineJob({ name: "plt.b", handler });
    defineJob({ name: "plt.a", handler });
    defineJob({ name: "plt.a", handler, retryLimit: 1 });
    expect(listJobs().map((j) => j.name)).toEqual(["plt.a", "plt.b"]);
    expect(getJob("plt.a")?.retryLimit).toBe(1);
    expect(getJob("nope")).toBeUndefined();
  });
});
