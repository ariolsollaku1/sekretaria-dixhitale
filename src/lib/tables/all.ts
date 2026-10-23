import "server-only";
// Every module's tables register here (importing them registers them) so the export route can find
// a table by id. Add one import per table.
import "@/modules/iam";
import "@/lib/audit/table";
