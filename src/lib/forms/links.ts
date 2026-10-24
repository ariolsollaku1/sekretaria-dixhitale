// INT-06 / AC-6: addresses the LOGOS website links to. Pure, no I/O.
const trim = (base: string) => base.replace(/\/+$/, "");

/** The public index of forms (Q-95: `/f`; `/forms` is the signed-in area). */
export const indexUrl = (base: string) => `${trim(base)}/f`;

/** The stable address of one public form (PLT-15 AC-4). */
export const formUrl = (base: string, key: string) => `${trim(base)}/f/${encodeURIComponent(key)}`;
