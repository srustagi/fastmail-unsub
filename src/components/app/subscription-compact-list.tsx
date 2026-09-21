"use client";

import { ChevronDown, ChevronRight, ExternalLink, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { OverflowActionMenu } from "@/components/app/overflow-action-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { InboxMessage, Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";

interface SubscriptionCompactListProps {
  subscriptions: Subscription[];
  messages: InboxMessage[];
  selected: Set<string>;
  busy: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onIgnore: (id: string, ignored: boolean) => void;
  onTrash: (id: string) => void;
  onTrashMessage: (messageId: string) => void;
  onUnsubscribe: (id: string) => void;
  onCombined: (subscriptionId: string, messageId?: string) => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(value));
}

export function SubscriptionCompactList({ subscriptions, messages, selected, busy, onSelect, onIgnore, onTrash, onTrashMessage, onUnsubscribe, onCombined }: SubscriptionCompactListProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const messagesBySubscription = useMemo(() => {
    const grouped = new Map<string, InboxMessage[]>();
    for (const message of messages) {
      const bucket = grouped.get(message.subscriptionId) ?? [];
      bucket.push(message);
      grouped.set(message.subscriptionId, bucket);
    }
    return grouped;
  }, [messages]);

  function toggleExpanded(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="hidden grid-cols-[2rem_minmax(0,1.05fr)_minmax(0,1fr)_6.5rem_8.5rem] gap-4 border-b bg-muted/35 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
        <span /><span>Sender</span><span>Latest message</span><span>Method</span><span className="text-end">Action</span>
      </div>
      {subscriptions.map((subscription) => {
        const isAutomatic = subscription.method === "one_click";
        const isSelected = selected.has(subscription.id);
        const isExpanded = expanded.has(subscription.id);
        const groupMessages = messagesBySubscription.get(subscription.id) ?? [];
        const messagesRegionId = `subscription-messages-${subscription.id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

        return (
          <div key={subscription.id} className="border-b last:border-b-0">
            <div className={cn("grid gap-3 px-3 py-3 transition-colors hover:bg-muted/25 md:grid-cols-[2rem_minmax(0,1.05fr)_minmax(0,1fr)_6.5rem_8.5rem] md:items-center md:gap-4 md:px-4", isSelected && "bg-primary/[0.055]")}>
              <Checkbox checked={isSelected} onCheckedChange={(checked) => onSelect(subscription.id, checked === true)} aria-label={`Select ${subscription.displayName}`} className="mt-0.5 size-4 md:mt-0" />
              <button type="button" className="min-w-0 text-start outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring md:col-start-2" aria-expanded={isExpanded} aria-controls={messagesRegionId} onClick={() => toggleExpanded(subscription.id)}>
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{subscription.displayName}</span>
                  {isExpanded ? <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" /> : <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />}
                </span>
                <span className="block truncate text-xs text-muted-foreground">{subscription.senderAddress}</span>
              </button>
              <button type="button" className="min-w-0 ps-7 text-start outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-ring md:ps-0" onClick={() => toggleExpanded(subscription.id)}>
                <span className="block truncate text-sm">{subscription.latestSubject || "No subject"}</span>
                <span className="block text-xs text-muted-foreground">{subscription.inboxCount} message{subscription.inboxCount === 1 ? "" : "s"}</span>
              </button>
              <div className="ps-7 md:ps-0">
                <span className={cn("inline-flex items-center rounded-full px-2 py-1 text-xs font-medium", isAutomatic ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground")}>{isAutomatic ? "One-click" : "Manual"}</span>
              </div>
              <div className="flex items-center gap-1 ps-7 md:justify-end md:ps-0">
                <Button size="sm" variant={isAutomatic ? "default" : "outline"} disabled={busy} onClick={() => onUnsubscribe(subscription.id)}>{isAutomatic ? "Unsubscribe" : "Review"}</Button>
                <OverflowActionMenu
                  label={subscription.displayName}
                  fastmailUrl={subscription.fastmailUrl}
                  onIgnore={() =>
                    onIgnore(subscription.id, subscription.status !== "ignored")
                  }
                  ignoreLabel={
                    subscription.status === "ignored" ? "Return to review" : "Keep sender"
                  }
                  onTrash={() => onTrash(subscription.id)}
                  trashLabel="Move messages to Trash"
                  onCombined={() => onCombined(subscription.id)}
                  showCombinedIcon
                />
              </div>
            </div>
            {isExpanded ? (
              <div id={messagesRegionId} className="border-t bg-muted/20 px-3 py-2 md:px-12">
                {groupMessages.length > 0 ? (
                  <div className="divide-y">
                    {groupMessages.map((message) => (
                      <div key={message.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                        <div className="min-w-0"><p className="truncate text-sm font-medium">{message.subject || "No subject"}</p><p className="text-xs text-muted-foreground">{formatDate(message.receivedAt)} · {message.senderAddress}</p></div>
                        <div className="flex shrink-0 items-center gap-1">
                          {message.fastmailUrl ? <Button size="sm" variant="ghost" asChild><a href={message.fastmailUrl} target="_blank" rel="noreferrer">Open <ExternalLink className="size-3.5" /></a></Button> : null}
                          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onTrashMessage(message.id)}><Trash2 className="size-3.5" /> Trash</Button>
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => onCombined(subscription.id, message.id)}>Unsubscribe + trash</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : <p className="py-3 text-sm text-muted-foreground">Scan again to load the messages in this group.</p>}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
