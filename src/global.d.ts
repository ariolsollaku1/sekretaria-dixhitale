import type en from "../messages/en.json";

// Type-safe message keys for next-intl (the sq catalog must contain the same keys: i18n:check).
declare module "next-intl" {
  interface AppConfig {
    Messages: typeof en;
    Locale: "sq" | "en";
  }
}
