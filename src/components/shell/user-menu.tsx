"use client";
import { ChevronDown, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Profile summary + sign-out. The sign-out form lives outside the portal (`signOutFormId`). */
export function UserMenu({
  name,
  email,
  roles,
  signOutFormId,
}: {
  name: string;
  email: string;
  roles: string[];
  signOutFormId: string;
}) {
  const t = useTranslations("shell");
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={t("userMenu")}
        className="rounded-control hover:bg-accent flex min-h-11 items-center gap-2 px-1.5 text-sm sm:pr-3"
      >
        <span
          aria-hidden
          className="bg-brand-gradient grid size-9 place-items-center rounded-full text-[13px] font-semibold text-white"
        >
          {initials(name)}
        </span>
        <span className="hidden max-w-40 truncate sm:inline">{name}</span>
        <ChevronDown className="size-4" aria-hidden />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          <span className="text-muted-foreground block text-[13px]">{t("signedInAs")}</span>
          <span className="block font-semibold">{name}</span>
          <span className="text-muted-foreground block text-[13px]">{email}</span>
          {roles.length > 0 && <span className="mt-1 block text-[13px]">{roles.join(", ")}</span>}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() =>
            (document.getElementById(signOutFormId) as HTMLFormElement | null)?.requestSubmit()
          }
        >
          <LogOut className="size-4" aria-hidden />
          {t("signOut")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
