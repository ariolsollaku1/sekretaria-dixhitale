import { describe, expect, it } from "vitest";
import { SmtpTransport } from "./smtp";

// Runs against the Mailpit of the dev stack when it is reachable; skipped in CI (Postgres only).
const ui = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? "8025"}`;
const reachable = await fetch(`${ui}/api/v1/info`, { signal: AbortSignal.timeout(1500) })
  .then((r) => r.ok)
  .catch(() => false);

describe.skipIf(!reachable)("SmtpTransport against Mailpit", () => {
  const transport = new SmtpTransport({
    host: "127.0.0.1",
    port: Number(process.env.MAILPIT_SMTP_PORT ?? 1025),
    secure: false,
    from: "no-reply@logos.local",
  });

  it("delivers a multipart message with Albanian characters", async () => {
    const to = `smtp-${Date.now()}@logos.test`;
    await transport.send({
      to,
      subject: "Përshëndetje ë ç",
      html: "<p>Mirë se vini</p>",
      text: "Mirë se vini",
    });
    const found = await fetch(`${ui}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`).then(
      (r) => r.json(),
    );
    expect(found.messages_count).toBe(1);
    const mail = await fetch(`${ui}/api/v1/message/${found.messages[0].ID}`).then((r) => r.json());
    expect(mail.Subject).toBe("Përshëndetje ë ç");
    expect(mail.From.Address).toBe("no-reply@logos.local");
    expect(mail.HTML).toContain("Mirë se vini");
  });

  it("reports an unreachable server as a retryable error", async () => {
    const bad = new SmtpTransport({
      host: "127.0.0.1",
      port: 1,
      secure: false,
      from: "x@logos.test",
    });
    await expect(
      bad.send({ to: "a@b.test", subject: "s", html: "h", text: "t" }),
    ).rejects.toMatchObject({ code: "UNAVAILABLE", retryable: true });
  });
});
