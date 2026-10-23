// AC-1: notification types. A type decides whether a user may opt out of its e-mail.
export type NotificationType = {
  /** `<module>.<event>`; texts live at notifications.<type>.* and mail.<type>.* in the catalogs. */
  type: string;
  /** Always e-mailed (and cannot be switched off), e.g. a payment deadline notice. */
  mandatory?: boolean;
  /** false = in-app only. */
  emailable?: boolean;
};

const types = new Map<string, Required<NotificationType>>();
export const TYPE_PATTERN = /^[a-z]+(\.[a-z0-9-]+)+$/;

export function registerNotificationType(def: NotificationType): void {
  if (!TYPE_PATTERN.test(def.type)) throw new Error(`Invalid notification type "${def.type}"`);
  types.set(def.type, {
    type: def.type,
    mandatory: def.mandatory ?? false,
    emailable: def.emailable ?? true,
  });
}

export function getNotificationType(type: string): Required<NotificationType> | undefined {
  return types.get(type);
}

export function listNotificationTypes(): Required<NotificationType>[] {
  return [...types.values()].sort((a, b) => a.type.localeCompare(b.type));
}

export function resetNotificationTypes(): void {
  types.clear();
}

// Platform type: lets a sysadmin verify the whole path (AC-12).
registerNotificationType({ type: "plt.test" });
