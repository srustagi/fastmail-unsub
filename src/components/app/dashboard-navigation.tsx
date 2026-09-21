"use client";

import { Activity, Inbox, MailX, Settings } from "lucide-react";
import { AccountMenu } from "@/components/app/account-menu";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type DashboardNavItem = "review" | "activity" | "settings";

const navItems: { id: DashboardNavItem; label: string; icon: typeof Inbox }[] = [
  { id: "review", label: "Review", icon: Inbox },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

interface DashboardNavigationProps {
  activeNav: DashboardNavItem;
  userEmail: string;
  onNavigate: (item: DashboardNavItem) => void;
}

export function DashboardNavigation({
  activeNav,
  userEmail,
  onNavigate,
}: DashboardNavigationProps) {
  return (
    <>
      <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center border-e bg-sidebar py-4 md:flex">
        <div
          className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground"
          aria-label="Unsubscribe"
        >
          <MailX className="size-5" />
        </div>
        <nav
          className="mt-6 flex w-full flex-col items-center gap-1"
          aria-label="Primary navigation"
        >
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Tooltip key={item.id}>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={item.label}
                    className={cn(
                      "mx-auto rounded-md text-muted-foreground",
                      activeNav === item.id &&
                        "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs",
                    )}
                    onClick={() => onNavigate(item.id)}
                  >
                    <Icon className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>
        <div className="mt-auto flex flex-col items-center gap-1 border-t pt-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <ThemeToggle />
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              Change theme
            </TooltipContent>
          </Tooltip>
          <AccountMenu userEmail={userEmail} />
        </div>
      </aside>

      <header className="sticky top-0 z-20 border-b bg-background/95 px-4 py-3 backdrop-blur md:hidden">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <MailX className="size-4" />
            </div>
            <span className="font-semibold">Unsubscribe</span>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <AccountMenu userEmail={userEmail} />
          </div>
        </div>
      </header>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-background/95 p-2 backdrop-blur md:hidden"
        aria-label="Mobile navigation"
      >
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button
              key={item.id}
              variant="ghost"
              className={cn(
                "h-14 flex-col gap-1 rounded-xl text-xs",
                activeNav === item.id && "bg-primary/10 text-primary",
              )}
              onClick={() => onNavigate(item.id)}
            >
              <Icon className="size-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>
    </>
  );
}
