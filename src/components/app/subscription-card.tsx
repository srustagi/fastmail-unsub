"use client";

import {
  Building2,
  CheckCircle2,
  ExternalLink,
  MailX,
  MoreHorizontal,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SubscriptionCardProps {
  subscription: Subscription;
  selected: boolean;
  busy: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onIgnore: (id: string, ignored: boolean) => void;
  onTrash: (id: string) => void;
  onUnsubscribe: (id: string) => void;
  onCombined: (id: string) => void;
}

function relativeDate(value: string | null): string {
  if (!value) return "Unknown date";
  const days = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000),
  );
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(value));
}

export function SubscriptionCard({
  subscription,
  selected,
  busy,
  onSelect,
  onIgnore,
  onTrash,
  onUnsubscribe,
  onCombined,
}: SubscriptionCardProps) {
  const initial = subscription.displayName.charAt(0).toUpperCase();
  const isAutomatic = subscription.method === "one_click";

  return (
    <Card
      className={cn(
        "group overflow-hidden border-border/80 py-0 shadow-none transition hover:border-primary/35",
        selected && "border-primary/60 ring-2 ring-primary/15",
      )}
    >
      <CardContent className="p-4 sm:p-5">
        <div className="flex gap-3 sm:gap-4">
          <Checkbox
            checked={selected}
            onCheckedChange={(checked) => onSelect(subscription.id, checked === true)}
            aria-label={`Select ${subscription.displayName}`}
            className="mt-1 size-5"
          />
          <div className="flex min-w-0 flex-1 gap-3 sm:gap-4">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-sm font-semibold text-primary sm:size-11">
              {initial || <Building2 className="size-4" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold tracking-tight">
                    {subscription.displayName}
                  </h3>
                  <p className="truncate text-xs text-muted-foreground sm:text-sm">
                    {subscription.senderAddress}
                  </p>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="-me-2 -mt-2 shrink-0"
                      aria-label={`More actions for ${subscription.displayName}`}
                    >
                      <MoreHorizontal className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {subscription.fastmailUrl ? (
                      <DropdownMenuItem asChild>
                        <a
                          href={subscription.fastmailUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <ExternalLink className="size-4" />
                          Open in Fastmail
                        </a>
                      </DropdownMenuItem>
                    ) : null}
                    <DropdownMenuItem
                      onSelect={() =>
                        onIgnore(subscription.id, subscription.status !== "ignored")
                      }
                    >
                      <CheckCircle2 className="size-4" />
                      {subscription.status === "ignored" ? "Return to review" : "Keep sender"}
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => onTrash(subscription.id)}>
                      <Trash2 className="size-4" />
                      Move Inbox mail to Trash
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="destructive" onSelect={() => onCombined(subscription.id)}>
                      <MailX className="size-4" />
                      Unsubscribe and move to Trash
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <Badge variant={isAutomatic ? "default" : "secondary"}>
                  {isAutomatic ? (
                    <ShieldCheck data-icon="inline-start" />
                  ) : (
                    <ExternalLink data-icon="inline-start" />
                  )}
                  {isAutomatic ? "One-click" : "Manual"}
                </Badge>
                <Badge variant="outline">
                  {subscription.inboxCount} inbox message
                  {subscription.inboxCount === 1 ? "" : "s"}
                </Badge>
                {subscription.fastmailRecognized ? (
                  <Badge variant="outline" className="hidden sm:inline-flex">
                    Fastmail recognized
                  </Badge>
                ) : null}
              </div>

              <p className="mt-3 line-clamp-1 text-sm font-medium">
                {subscription.latestSubject || "No subject"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Latest {relativeDate(subscription.latestReceivedAt)} · {subscription.reasons[0]}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                <div>
                  <Button
                  size="sm"
                  variant={isAutomatic ? "default" : "outline"}
                  disabled={busy}
                  onClick={() => onUnsubscribe(subscription.id)}
                  className="min-w-32"
                  >
                    <MailX className="size-4" />
                    {isAutomatic ? "Unsubscribe" : "Open unsubscribe"}
                  </Button>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {subscription.fastmailUrl ? (
                    <Button variant="ghost" size="sm" asChild>
                    <a
                      href={subscription.fastmailUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open email
                      <ExternalLink className="size-3.5" />
                    </a>
                    </Button>
                  ) : null}
                  <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => onTrash(subscription.id)}
                    className="text-muted-foreground"
                  >
                    <Trash2 className="size-3.5" />
                    Trash {subscription.inboxCount}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
