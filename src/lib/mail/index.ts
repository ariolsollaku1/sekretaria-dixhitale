import "server-only";
import { env } from "@/lib/env";
import { GraphTransport } from "./graph";
import { SmtpTransport } from "./smtp";
import type { MailTransport } from "./transport";

export { MailError, type MailMessage, type MailTransport } from "./transport";

let instance: MailTransport | undefined;

/** The configured transport (`MAIL_TRANSPORT`); `setMailTransport` swaps it in tests. */
export function getMailTransport(): MailTransport {
  instance ??=
    env.MAIL_TRANSPORT === "graph"
      ? new GraphTransport({
          tenantId: env.MS_TENANT_ID!,
          clientId: env.MS_CLIENT_ID!,
          clientSecret: env.MS_CLIENT_SECRET!,
          from: env.MAIL_FROM,
        })
      : new SmtpTransport({
          host: env.SMTP_HOST,
          port: env.SMTP_PORT,
          secure: env.SMTP_SECURE === "true",
          user: env.SMTP_USER,
          password: env.SMTP_PASSWORD,
          from: env.MAIL_FROM,
        });
  return instance;
}

export function setMailTransport(transport: MailTransport | undefined): void {
  instance = transport;
}
