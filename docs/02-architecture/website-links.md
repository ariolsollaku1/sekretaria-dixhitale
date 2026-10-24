# Linking the LOGOS website to the public forms (INT-06)

Decision (Q-06, answered): **link only, no embedding.** The LOGOS website
(`http://www.kulogos.edu.al`, a custom Express/AngularJS static site) only adds links; the forms
stay on the system's own domain. Address changes on the website side are the only work needed.

## Addresses

`<APP>` is the public base URL of the system (`APP_URL`).

| What | Address | Notes |
|---|---|---|
| List of all public forms | `<APP>/f` | one link on the website is enough; the list updates itself |
| One public form | `<APP>/f/<form-key>` | stable across versions; e.g. `<APP>/f/interesim` |

The sysadmin sees the exact, current addresses at **Administration → Form definitions → Website
links** (`/admin/forms/links`) and can copy them to whoever maintains the website.

Only forms that are *published* and have the audience *public* appear. Forms for signed-in users
(`/forms/<key>`) are not for the website; alumni and applicants use the public ones (SRC-037).

## What the website maintainer does

1. Add a link "Forms" pointing to `<APP>/f` in the relevant section, or one link per form pointing
   to `<APP>/f/<form-key>` (for example "Scholarship application" under Scholarships).
2. Nothing else: no script, no iframe, no styling. The page language follows the visitor's
   preference (Albanian by default, English when available).

## What happens with the data

A submission gets a reference code shown to the visitor, lands in the inbox of the office named in
the form definition (e.g. the Secretariat), and is handled there (SRC-030, SRC-133). Public forms
are protected by a hidden honeypot field and a rate limit (PLT-15, Q-37).

## Not covered (see Q-95)

Public notices on the website: announcements require a login today. The index address `/f` is a
working assumption (`/forms` is the signed-in area); it can change in one route if the client
prefers another.
