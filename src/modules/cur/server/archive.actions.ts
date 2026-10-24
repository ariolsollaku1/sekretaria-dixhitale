"use server";

import "../permissions";
import { action } from "@/lib/actions";
import {
  addDocumentSchema,
  updateDocumentSchema,
  withdrawDocumentSchema,
} from "../domain/archive-schemas";
import * as archive from "./archive.service";

// Role-based here; the service checks the permission against the document's program (scope).
const permission = "cur.archive.write";

export const addArchiveDocumentAction = action({
  permission,
  input: addDocumentSchema,
  handler: (input, ctx) => archive.addDocument(ctx, input),
});
export const updateArchiveDocumentAction = action({
  permission,
  input: updateDocumentSchema,
  handler: ({ documentId, ...input }, ctx) => archive.updateDocument(ctx, documentId, input),
});
export const withdrawArchiveDocumentAction = action({
  permission,
  input: withdrawDocumentSchema,
  handler: ({ documentId, reason }, ctx) => archive.withdrawDocument(ctx, documentId, reason),
});
