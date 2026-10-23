// AC-3: which channels a recipient gets. Pure.
export type ChannelInput = {
  mandatory: boolean;
  emailable: boolean;
  userActive: boolean;
  hasEmail: boolean;
  /** The user's stored choice for this type; undefined = no row = on. */
  emailPreference: boolean | undefined;
};

export type Channels = { inApp: true; email: boolean };

export function decideChannels(input: ChannelInput): Channels {
  if (!input.emailable || !input.userActive || !input.hasEmail)
    return { inApp: true, email: false };
  if (input.mandatory) return { inApp: true, email: true };
  return { inApp: true, email: input.emailPreference ?? true };
}

/** Links must stay inside the app: a relative path or nothing (open-redirect guard). */
export function safeLink(link: string | null | undefined): string | null {
  if (
    !link ||
    !link.startsWith("/") ||
    link.startsWith("//") ||
    link.startsWith("/\\") ||
    /[\u0000-\u001f]/.test(link)
  )
    return null;
  return link.slice(0, 500);
}
