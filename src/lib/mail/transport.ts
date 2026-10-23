// AC-7: the mail transport boundary. Adapters map provider errors to a small code set so nothing
// provider-specific (and nothing personal) reaches the outbox or the logs.
export type MailMessage = { to: string; subject: string; html: string; text: string };

export type MailErrorCode = "UNAVAILABLE" | "TIMEOUT" | "AUTH" | "REJECTED" | "UNKNOWN";

export class MailError extends Error {
  constructor(
    readonly code: MailErrorCode,
    /** Worth trying again later (transient), as opposed to fixing configuration or the address. */
    readonly retryable: boolean,
  ) {
    super(`mail ${code}`);
    this.name = "MailError";
  }
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}
