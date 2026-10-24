import "server-only";
// Modules that register form handlers (PLT-15 AC-10): the approval runs in the server action of the
// inbox, so their registrations must be loaded there. One import per module index.
import "@/modules/stu";
import "@/modules/off";
import "@/modules/adm";
