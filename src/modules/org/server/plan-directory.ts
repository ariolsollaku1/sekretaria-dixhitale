// ORG-04 needs facts about curriculum plans (CUR-02) without importing CUR, which already imports
// ORG: CUR registers a directory here.
export type PlanInfo = {
  id: string;
  programId: string;
  version: number;
  status: "DRAFT" | "APPROVED" | "ARCHIVED";
  /** code of the academic year the plan is valid from */
  validFrom: string;
};

export type PlanDirectory = {
  get(planId: string): Promise<PlanInfo | null>;
  listApproved(programId: string): Promise<PlanInfo[]>;
};

let directory: PlanDirectory | null = null;

export function registerPlanDirectory(d: PlanDirectory): void {
  directory = d;
}

export function getPlanDirectory(): PlanDirectory {
  if (!directory) throw new Error("No plan directory registered (the CUR module is not loaded)");
  return directory;
}
