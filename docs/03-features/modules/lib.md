# LIB — Library

Code: `src/modules/lib`. The library uses **PLEJADES** (SRC-100); everything here depends on how we
can exchange data with it (Q-03, INT-03).

### LIB-01 — Library catalogue & online library users
- **Goal:** access to the book list / online library and the list of students using it (SRC-101, SRC-103).
- **Scope (likely):** link/embed PLEJADES OPAC from the portal; list of active library users from
  PLEJADES data.
- **Blocked by:** Q-03.

### LIB-02 — Online library card request
- **Goal:** students open a library card online (SRC-102).
- **Scope:** request form (PLT-15) prefilled from student data → librarian inbox → card number
  recorded (and pushed to PLEJADES if possible).
- **Blocked by:** Q-03.

### LIB-03 — Library obligations clearance
- **Goal:** know who has / hasn't closed obligations with the library (SRC-104); used in graduation
  clearance (GRD-01).
- **Scope:** import/sync of outstanding loans/fines from PLEJADES; clearance flag per student;
  manual override by librarian; list.
- **Blocked by:** Q-03.
