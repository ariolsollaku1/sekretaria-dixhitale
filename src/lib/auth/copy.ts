// Auth page copy. Moves into the next-intl catalogs when PLT-06 lands; `sq` is the default (Q-17).
const copy = {
  sq: {
    title: "Sekretari Dixhitale",
    institution: "Kolegji Universitar LOGOS",
    signIn: "Hyr",
    signOut: "Dil",
    reasons: {
      expired: "Sesioni juaj ka skaduar. Hyni përsëri.",
      "signed-out": "Keni dalë nga sistemi.",
      unavailable: "Shërbimi i hyrjes nuk është i disponueshëm. Provoni pak më vonë.",
      error: "Hyrja nuk u krye. Provoni përsëri.",
    },
    noAccess: {
      title: "Nuk keni qasje",
      body: "Llogaria juaj nuk është e aktivizuar në Sekretarin Dixhital. Kontaktoni zyrën e sekretarisë ose administratorin e sistemit.",
      action: "Dil nga llogaria",
    },
    hello: "Përshëndetje",
    forbidden: {
      title: "Nuk keni leje",
      body: "Roli juaj nuk e lejon këtë veprim. Kontaktoni administratorin nëse mendoni se është gabim.",
    },
  },
  en: {
    title: "Digital Secretariat",
    institution: "LOGOS University College",
    signIn: "Sign in",
    signOut: "Sign out",
    reasons: {
      expired: "Your session has expired. Please sign in again.",
      "signed-out": "You have been signed out.",
      unavailable: "The sign-in service is unavailable. Please try again shortly.",
      error: "Sign-in failed. Please try again.",
    },
    noAccess: {
      title: "No access",
      body: "Your account is not enabled in the Digital Secretariat. Contact the secretariat or the system administrator.",
      action: "Sign out of your account",
    },
    hello: "Hello",
    forbidden: {
      title: "Not allowed",
      body: "Your role does not allow this. Contact the administrator if you think this is a mistake.",
    },
  },
} as const;

export type Locale = keyof typeof copy;
export type Reason = keyof (typeof copy)["sq"]["reasons"];

export function getCopy(locale: Locale = "sq") {
  return copy[locale];
}

export function isReason(value: string | undefined): value is Reason {
  return value !== undefined && value in copy.sq.reasons;
}
