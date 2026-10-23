"use client";
import { useId, type ReactNode } from "react";
import {
  Controller,
  type Control,
  type ControllerRenderProps,
  type FieldPath,
  type FieldValues,
} from "react-hook-form";
import { Label } from "./label";

/**
 * React Hook Form + Zod field wrapper: label, hint and error are tied to the control through
 * aria attributes (design-system.md: labels on every field, errors tied to their field). The form
 * uses the same Zod schema as the server action (conventions.md).
 */
export function FormField<T extends FieldValues, N extends FieldPath<T>>({
  control,
  name,
  label,
  description,
  render,
}: {
  control: Control<T>;
  name: N;
  label: string;
  description?: string;
  render: (args: {
    field: ControllerRenderProps<T, N>;
    id: string;
    "aria-describedby": string | undefined;
    "aria-invalid": boolean;
  }) => ReactNode;
}) {
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const hintId = `${id}-hint`;
        const errorId = `${id}-error`;
        const describedBy =
          [description ? hintId : null, fieldState.error ? errorId : null]
            .filter(Boolean)
            .join(" ") || undefined;
        return (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={id}>{label}</Label>
            {description && (
              <p id={hintId} className="text-muted-foreground text-[13px]">
                {description}
              </p>
            )}
            {render({
              field,
              id,
              "aria-describedby": describedBy,
              "aria-invalid": !!fieldState.error,
            })}
            {fieldState.error && (
              <p id={errorId} role="alert" className="text-danger text-[13px] font-semibold">
                {fieldState.error.message}
              </p>
            )}
          </div>
        );
      }}
    />
  );
}
