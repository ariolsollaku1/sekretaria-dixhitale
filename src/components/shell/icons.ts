import {
  BarChart3,
  Bell,
  BookOpen,
  Briefcase,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  GraduationCap,
  Home,
  Settings,
  ShieldCheck,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { NavIcon } from "@/lib/nav/registry";

// Curated set: importing lucide's full icon map would bloat the client bundle.
export const NAV_ICONS: Record<NavIcon, LucideIcon> = {
  home: Home,
  users: Users,
  graduation: GraduationCap,
  book: BookOpen,
  calendar: CalendarDays,
  clipboard: ClipboardList,
  wallet: Wallet,
  briefcase: Briefcase,
  building: Building2,
  chart: BarChart3,
  settings: Settings,
  shield: ShieldCheck,
  file: FileText,
  bell: Bell,
};
