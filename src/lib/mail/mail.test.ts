import { describe, expect, it, vi } from "vitest";
import { GraphTransport } from "./graph";
import { mapSmtpError } from "./smtp";
import { MailError } from "./transport";

const message = { to: "ana@logos.test", subject: "Subject ë", html: "<p>Hi</p>", text: "Hi" };
const cfg = {
  tenantId: "tenant-1",
  clientId: "client-1",
  clientSecret: "s3cret",
  from: "no-reply@logos.edu.al",
};

const json = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function graph(responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit }[] = [];
  const queue = [...responses];
  const fetchFn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("unexpected extra request");
    if (next instanceof Error) throw next;
    return next;
  });
  let now = 1_000_000;
  const transport = new GraphTransport(cfg, fetchFn as unknown as typeof fetch, () => now);
  return { transport, calls, advance: (ms: number) => (now += ms) };
}
const TOKEN = (expiresIn = 3600) => json(200, { access_token: "tok", expires_in: expiresIn });

describe("GraphTransport (AC-7)", () => {
  it("fetches a token with the client credentials and posts sendMail from the configured mailbox", async () => {
    const { transport, calls } = graph([TOKEN(), json(202)]);
    await transport.send(message);

    expect(calls[0]!.url).toBe("https://login.microsoftonline.com/tenant-1/oauth2/v2.0/token");
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(Object.fromEntries(form)).toEqual({
      grant_type: "client_credentials",
      client_id: "client-1",
      client_secret: "s3cret",
      scope: "https://graph.microsoft.com/.default",
    });

    expect(calls[1]!.url).toBe(
      "https://graph.microsoft.com/v1.0/users/no-reply%40logos.edu.al/sendMail",
    );
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    expect(JSON.parse(String(calls[1]!.init.body))).toEqual({
      message: {
        subject: "Subject ë",
        body: { contentType: "HTML", content: "<p>Hi</p>" },
        toRecipients: [{ emailAddress: { address: "ana@logos.test" } }],
      },
      saveToSentItems: false,
    });
  });

  it("caches the token until shortly before it expires", async () => {
    const { transport, calls, advance } = graph([
      TOKEN(3600),
      json(202),
      json(202),
      TOKEN(3600),
      json(202),
    ]);
    await transport.send(message);
    await transport.send(message);
    expect(calls.filter((c) => c.url.includes("oauth2")).length).toBe(1);
    advance(3600 * 1000 - 30_000); // inside the 60 s safety margin
    await transport.send(message);
    expect(calls.filter((c) => c.url.includes("oauth2")).length).toBe(2);
  });

  it("refreshes the token once after a 401 and then succeeds", async () => {
    const { transport, calls } = graph([TOKEN(), json(401), TOKEN(), json(202)]);
    await transport.send(message);
    expect(calls.map((c) => (c.url.includes("oauth2") ? "token" : "send"))).toEqual([
      "token",
      "send",
      "token",
      "send",
    ]);
  });

  it.each([
    ["a second 401", [TOKEN(), json(401), TOKEN(), json(401)], "AUTH", false],
    ["403 (no permission)", [TOKEN(), json(403)], "AUTH", false],
    ["token request refused", [json(401)], "AUTH", false],
    ["429 throttled", [TOKEN(), json(429)], "UNAVAILABLE", true],
    ["503", [TOKEN(), json(503)], "UNAVAILABLE", true],
    ["token endpoint down", [json(500)], "UNAVAILABLE", true],
    ["400 bad request / unknown mailbox", [TOKEN(), json(400)], "REJECTED", false],
    ["404", [TOKEN(), json(404)], "REJECTED", false],
    ["network failure on send", [TOKEN(), new Error("socket hang up")], "UNAVAILABLE", true],
    ["network failure on token", [new Error("ENOTFOUND")], "UNAVAILABLE", true],
  ] as const)("maps %s", async (_n, responses, code, retryable) => {
    const { transport } = graph([...responses]);
    const error = await transport.send(message).catch((e) => e);
    expect(error).toBeInstanceOf(MailError);
    expect(error).toMatchObject({ code, retryable });
    expect(String(error.message)).not.toContain("ana@logos.test");
  });
});

describe("mapSmtpError", () => {
  it.each([
    [{ code: "EAUTH" }, "AUTH", false],
    [{ code: "ETIMEDOUT" }, "TIMEOUT", true],
    [{ code: "ECONNECTION" }, "UNAVAILABLE", true],
    [{ code: "ESOCKET" }, "UNAVAILABLE", true],
    [{ responseCode: 550 }, "REJECTED", false],
    [{ responseCode: 451 }, "UNAVAILABLE", true],
    [{ message: "who knows" }, "UNKNOWN", true],
  ])("%j -> %s (retryable %s)", (input, code, retryable) => {
    expect(mapSmtpError(input)).toMatchObject({ code, retryable });
  });
});
