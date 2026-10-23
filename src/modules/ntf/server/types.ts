import { registerNotificationType } from "@/lib/notify/types";

// AC-7: the e-mail push of an announcement. Optional for the recipient (not mandatory).
registerNotificationType({ type: "ntf.announcement" });
