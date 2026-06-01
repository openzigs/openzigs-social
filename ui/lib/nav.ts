import {
  BarChart3,
  CalendarDays,
  Inbox,
  PenSquare,
  Rocket,
  Send,
  Settings,
  Users,
  type LucideIcon
} from "lucide-react";

export interface NavRoute {
  href: string;
  label: string;
  icon: LucideIcon;
}

/** Primary navigation destinations rendered in the top-nav. */
export const NAV_ROUTES: readonly NavRoute[] = [
  { href: "/inbox", label: "Inbox", icon: Inbox },
  { href: "/compose", label: "Compose", icon: PenSquare },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/outbox", label: "Outbox", icon: Send },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/onboarding", label: "Onboarding", icon: Rocket },
  { href: "/settings", label: "Settings", icon: Settings }
];

/** True when `pathname` is within the section rooted at `href`. */
export function isActiveRoute(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
