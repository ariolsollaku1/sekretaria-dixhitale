# OFF — Administration office

Code: `src/modules/off`.

### OFF-01 — Staff requests (leave, supplies, certificates, authorizations)
- **Goal:** staff submit administrative requests online (SRC-140).
- **Users:** any staff (submit), direct supervisor (approve where required), administration (process).
- **Scope:** form definitions per request type (PLT-15): leave (dates, type), office supplies
  (items, quantities), employment certificate, authorization; approval chain (supervisor →
  administration) configurable per type; status notifications; employment certificate generated via
  PLT-09 once a template exists; history per staff member.
- **Note:** staff performance evaluation by supervisor (SRC-141) is in HR-06.
