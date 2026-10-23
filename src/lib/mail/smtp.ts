import nodemailer from "nodemailer";
import { MailError, type MailMessage, type MailTransport } from "./transport";

export type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
};

type SmtpFailure = { code?: string; responseCode?: number };

/** Maps nodemailer failures to MailError: 5xx replies reject the message, 4xx and network errors retry. */
export function mapSmtpError(error: unknown): MailError {
  const e = error as SmtpFailure;
  if (e.code === "EAUTH") return new MailError("AUTH", false);
  if (e.code === "ETIMEDOUT" || e.code === "ESOCKETTIMEDOUT") return new MailError("TIMEOUT", true);
  if (typeof e.responseCode === "number")
    return e.responseCode >= 500
      ? new MailError("REJECTED", false)
      : new MailError("UNAVAILABLE", true);
  if (
    e.code === "ECONNECTION" ||
    e.code === "ESOCKET" ||
    e.code === "ECONNREFUSED" ||
    e.code === "EDNS"
  )
    return new MailError("UNAVAILABLE", true);
  return new MailError("UNKNOWN", true);
}

/** SMTP adapter (Mailpit in development; a relay with credentials elsewhere). */
export class SmtpTransport implements MailTransport {
  private readonly transporter;

  constructor(private readonly config: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user ? { user: config.user, pass: config.password ?? "" } : undefined,
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.config.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
      });
    } catch (error) {
      throw mapSmtpError(error);
    }
  }
}
