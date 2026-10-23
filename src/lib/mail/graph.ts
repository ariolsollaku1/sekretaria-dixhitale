import { MailError, type MailMessage, type MailTransport } from "./transport";

export type GraphConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  from: string;
};

const SCOPE = "https://graph.microsoft.com/.default";

/**
 * Microsoft Graph adapter (Q-20, preferred): client-credentials token (cached until shortly before it
 * expires) and `POST /users/{from}/sendMail`. The app registration needs the `Mail.Send` application
 * permission, ideally restricted to the sender mailbox by an application access policy.
 */
export class GraphTransport implements MailTransport {
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    private readonly config: GraphConfig,
    private readonly fetchFn: typeof fetch = fetch,
    private readonly now: () => number = Date.now,
  ) {}

  private async accessToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > this.now() + 60_000) return this.token.value;
    let res: Response;
    try {
      res = await this.fetchFn(
        `https://login.microsoftonline.com/${encodeURIComponent(this.config.tenantId)}/oauth2/v2.0/token`,
        {
          method: "POST",
          headers: { "content-type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            scope: SCOPE,
          }),
        },
      );
    } catch {
      throw new MailError("UNAVAILABLE", true);
    }
    if (res.status === 400 || res.status === 401 || res.status === 403)
      throw new MailError("AUTH", false);
    if (!res.ok) throw new MailError("UNAVAILABLE", true);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    this.token = { value: body.access_token, expiresAt: this.now() + body.expires_in * 1000 };
    return body.access_token;
  }

  async send(message: MailMessage): Promise<void> {
    const payload = JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: "HTML", content: message.html },
        toRecipients: [{ emailAddress: { address: message.to } }],
      },
      saveToSentItems: false,
    });
    const url = `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(this.config.from)}/sendMail`;

    for (const attempt of [0, 1]) {
      const token = await this.accessToken(attempt === 1);
      let res: Response;
      try {
        res = await this.fetchFn(url, {
          method: "POST",
          headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
          body: payload,
        });
      } catch {
        throw new MailError("UNAVAILABLE", true);
      }
      if (res.status === 202 || res.ok) return;
      if (res.status === 401 && attempt === 0) continue; // expired or revoked token: fetch a new one once
      if (res.status === 401 || res.status === 403) throw new MailError("AUTH", false);
      if (res.status === 429 || res.status >= 500)
        throw new MailError(res.status === 429 ? "UNAVAILABLE" : "UNAVAILABLE", true);
      throw new MailError("REJECTED", false); // 400/404/…: bad request or unknown mailbox
    }
    throw new MailError("UNKNOWN", true);
  }
}
