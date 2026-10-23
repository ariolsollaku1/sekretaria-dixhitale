// Q-66 working assumptions, in one place. Cron expressions are read in Europe/Tirane (PLT-12).
export const EXPORT_CRON = "30 2 * * *";
export const INTEGRITY_CRON = "0 4 * * 0";
/** AC-6: successful exports kept on disk. */
export const KEEP_EXPORTS = 7;
/** AC-8: a banner appears when no successful run is newer than this. */
export const EXPORT_STALE_HOURS = 36;
export const INTEGRITY_STALE_HOURS = 8 * 24;
/** Exports live under this folder of the files volume. */
export const EXPORTS_FOLDER = "exports";
export const FILE_NAME_PATTERN = /^export-[0-9]{8}-[0-9]{6}-[a-z0-9]{6,40}\.zip$/;
