"use client";
import { createContext, useContext, type ReactNode } from "react";

const AcademicYearContext = createContext<string | null>(null);

export function AcademicYearProvider({
  value,
  children,
}: {
  value: string | null;
  children: ReactNode;
}) {
  return <AcademicYearContext.Provider value={value}>{children}</AcademicYearContext.Provider>;
}

/** The selected academic year id, or null until ORG-01 provides years (AC-7). */
export function useAcademicYear(): string | null {
  return useContext(AcademicYearContext);
}
