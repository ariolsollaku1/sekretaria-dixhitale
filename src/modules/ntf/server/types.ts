import { registerNotificationType } from "@/lib/notify/types";

// AC-7: the e-mail push of an announcement. Optional for the recipient (not mandatory).
registerNotificationType({ type: "ntf.announcement" });

// NTF-03: a message to the people of a list (texts are written by the sender; the catalog texts
// are only the fallback and the label on the preferences page). Optional for the recipient (Q-50).
registerNotificationType({ type: "ntf.message" });

// NTF-02 (Q-120): confirmation, one reminder the day before, and the cancellation of an event.
// Optional for the recipient.
registerNotificationType({ type: "ntf.event-registered" });
registerNotificationType({ type: "ntf.event-reminder" });
registerNotificationType({ type: "ntf.event-cancelled" });
