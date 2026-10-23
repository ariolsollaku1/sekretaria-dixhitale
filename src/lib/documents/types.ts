import type { Permission } from "@/lib/authz/types";

// PLT-09 AC-5/AC-7/AC-10: modules register the document types they issue.
export const TYPE_PATTERN = /^[a-z]+\.[a-z0-9-]+$/;

export type DocumentType = {
  /** `<module>.<name>`, e.g. "stu.enrollment-certificate". */
  type: string;
  /** `PREFIX` of the number (`PREFIX-YYYY-NNNNN`). */
  prefix: string;
  /** Data for the preview and the test document in the admin pages. */
  sampleData: Record<string, unknown>;
  /** Who besides the sysadmin may read a reprint; `subjectType/subjectId` say what it is about. */
  canRead?: (
    user: { id: string },
    doc: { type: string; subjectType: string | null; subjectId: string | null },
  ) => Promise<boolean>;
  /** Who may cancel besides the sysadmin; defaults to the sysadmin only. */
  cancelPermission?: Permission;
};

const types = new Map<string, DocumentType>();

export function registerDocumentType(def: DocumentType): void {
  if (!TYPE_PATTERN.test(def.type)) throw new Error(`Invalid document type "${def.type}"`);
  if (types.has(def.type)) throw new Error(`Duplicate document type "${def.type}"`);
  types.set(def.type, def);
}
export const getDocumentType = (type: string): DocumentType | undefined => types.get(type);
export const listDocumentTypes = (): DocumentType[] => [...types.values()];
export const resetDocumentTypes = (): void => types.clear();

/** Catalog key (no dots allowed in keys) of a type's label: `documents.types.<module>_<name>`. */
export const typeLabelKey = (type: string): string => `documents.types.${type.replace(".", "_")}`;

export const SAMPLE_TYPE = "plt.sample";
export function registerSampleType(): void {
  if (types.has(SAMPLE_TYPE)) return;
  registerDocumentType({
    type: SAMPLE_TYPE,
    prefix: "TEST",
    sampleData: {
      title: "Dokument provë",
      name: "Emër Mbiemër",
      items: ["Njëra", "Tjetra"],
    },
  });
}
