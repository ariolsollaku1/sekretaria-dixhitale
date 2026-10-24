import "server-only";
// Every module's job declarations: one import each, so the worker knows what exists.
import "@/lib/files/jobs";
import "@/lib/notify/jobs";
import "@/modules/ntf";
import "@/lib/ratelimit/jobs";
import "@/modules/hr";
import "@/lib/backup/jobs";
