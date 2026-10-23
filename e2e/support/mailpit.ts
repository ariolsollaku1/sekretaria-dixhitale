import { expect } from "@playwright/test";

const MAILPIT = `http://127.0.0.1:${process.env.MAILPIT_UI_PORT ?? "8025"}`;

/** Waits for a mail to `to` and returns the first `href` that contains `linkPart` (HTML-decoded). */
export async function waitForMailLink(to: string, linkPart: string): Promise<string> {
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
        );
        const { messages = [] } = (await search.json()) as { messages?: { ID: string }[] };
        for (const m of messages) {
          const body = (await (await fetch(`${MAILPIT}/api/v1/message/${m.ID}`)).json()) as {
            HTML?: string;
            Text?: string;
          };
          const html = `${body.HTML ?? ""} ${body.Text ?? ""}`;
          const match = [...html.matchAll(/https?:\/\/[^\s"'<>]+/g)]
            .map((x) => x[0].replaceAll("&amp;", "&"))
            .find((u) => u.includes(linkPart));
          if (match) {
            link = match;
            return true;
          }
        }
        return false;
      },
      { timeout: 20_000, message: `no mail with link "${linkPart}" for ${to}` },
    )
    .toBe(true);
  return link!;
}
