// NTF-03 AC-3 / Q-52: the only placeholders a message may contain. Pure.
export const PLACEHOLDERS = ["firstName", "lastName", "fullName"] as const;
export type Placeholder = (typeof PLACEHOLDERS)[number];
export type PlaceholderValues = Record<Placeholder, string>;

const TOKEN = /\{([^{}]*)\}/g;
const isAllowed = (name: string) => (PLACEHOLDERS as readonly string[]).includes(name);

/** Every `{name}` in the text that is not an allowed placeholder (unique, in order of appearance). */
export function unknownPlaceholders(text: string): string[] {
  const seen = new Set<string>();
  for (const m of text.matchAll(TOKEN)) if (!isAllowed(m[1]!)) seen.add(`{${m[1]}}`);
  return [...seen];
}

/** Replaces the allowed placeholders; values go in verbatim (HTML escaping happens when rendering). */
export function fillPlaceholders(text: string, values: PlaceholderValues): string {
  return text.replace(TOKEN, (whole, name: string) =>
    isAllowed(name) ? values[name as Placeholder] : whole,
  );
}

export function valuesForPerson(person: {
  firstName: string;
  lastName: string;
}): PlaceholderValues {
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    fullName: `${person.firstName} ${person.lastName}`,
  };
}
