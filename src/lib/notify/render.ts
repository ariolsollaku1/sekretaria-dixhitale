// AC-4: renders notification and e-mail texts from the catalogs, in the recipient's locale.
import { createTranslator } from "next-intl";
import type { Locale } from "@/lib/i18n/config";

export type Params = Record<string, string | number>;
export type Messages = Record<string, unknown>;

export const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export type RenderedMessage = {
  title: string;
  body: string;
  subject: string;
  /** plain text version of the e-mail */
  text: string;
  /** HTML version of the e-mail; every dynamic value is escaped */
  html: string;
};

function translator(locale: Locale, messages: Messages, namespace: string) {
  return createTranslator({
    locale,
    messages: messages as never,
    namespace: namespace as never,
    // A missing key is a programming error (AC-4): fail loudly instead of sending "notifications.x".
    onError: (error) => {
      throw error;
    },
  }) as unknown as (key: string, values?: Params) => string;
}

/** `appUrl` turns a relative link into the absolute one the e-mail needs. */
export function renderMessage(args: {
  type: string;
  params: Params;
  locale: Locale;
  messages: Messages;
  link?: string | null;
  appUrl: string;
  appName?: string;
  /** Sender-written text (NTF-03) used instead of the catalog texts of the type. */
  raw?: { title: string; body: string; subject: string };
}): RenderedMessage {
  const common = translator(args.locale, args.messages, "mail.common");

  let title: string, body: string, subject: string, mailBody: string;
  if (args.raw) {
    ({ title, body, subject } = args.raw);
    mailBody = args.raw.body;
  } else {
    const inApp = translator(args.locale, args.messages, `notifications.${args.type}`);
    const mail = translator(args.locale, args.messages, `mail.${args.type}`);
    title = inApp("title", args.params);
    body = inApp("body", args.params);
    subject = mail("subject", args.params);
    mailBody = mail("body", args.params);
  }
  const href = args.link ? new URL(args.link, args.appUrl).toString() : null;
  const footer = common("footer");
  const openLabel = common("open");

  const text = [mailBody, href ? `${openLabel}: ${href}` : null, "", footer]
    .filter((x) => x !== null)
    .join("\n");
  const html = `<!doctype html><html lang="${args.locale}"><body style="font-family:system-ui,sans-serif;color:#17202e;line-height:1.5">
<p>${escapeHtml(mailBody).replaceAll("\n", "<br>")}</p>
${href ? `<p><a href="${escapeHtml(href)}">${escapeHtml(openLabel)}</a></p>` : ""}
<hr style="border:none;border-top:1px solid #d5dbe4"><p style="font-size:13px;color:#4a5668">${escapeHtml(footer)}</p>
</body></html>`;
  return { title, body, subject, text, html };
}
