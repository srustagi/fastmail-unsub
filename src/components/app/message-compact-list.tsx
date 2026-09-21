"use client";

import { OverflowActionMenu } from "@/components/app/overflow-action-menu";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { InboxMessage, Subscription } from "@/lib/types";
import { cn } from "@/lib/utils";

interface MessageCompactListProps {
  messages: InboxMessage[];
  subscriptionsById: Map<string, Subscription>;
  selected: Set<string>;
  busy: boolean;
  onSelect: (id: string, selected: boolean) => void;
  onIgnore: (id: string, ignored: boolean) => void;
  onTrash: (messageId: string) => void;
  onUnsubscribe: (subscriptionId: string) => void;
  onCombined: (subscriptionId: string, messageId: string) => void;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(value));
}

export function MessageCompactList({
  messages,
  subscriptionsById,
  selected,
  busy,
  onSelect,
  onIgnore,
  onTrash,
  onUnsubscribe,
  onCombined,
}: MessageCompactListProps) {
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      {messages.map((message) => {
        const subscription = subscriptionsById.get(message.subscriptionId);
        if (!subscription) return null;
        const isSelected = selected.has(message.id);
        const isAutomatic = subscription.method === "one_click";

        return (
          <div
            key={message.id}
            className={cn(
              "grid gap-3 border-b p-3 transition last:border-b-0 hover:bg-muted/25 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)_8.5rem] sm:items-center sm:px-4",
              isSelected && "bg-primary/5",
            )}
          >
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onSelect(message.id, checked === true)}
              aria-label={`Select ${message.subject || "message"}`}
              className="mt-1 size-5 sm:mt-0"
            />
            <div className="min-w-0">
              <p className="truncate font-semibold">{subscription.displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{message.senderAddress}</p>
            </div>
            <div className="min-w-0 ps-8 sm:ps-0">
              <p className="truncate text-sm">{message.subject || "No subject"}</p>
              <p className="text-xs text-muted-foreground">{formatDate(message.receivedAt)}</p>
            </div>
            <div className="flex items-center gap-1 ps-8 sm:justify-end sm:ps-0">
              <Button size="sm" variant={isAutomatic ? "default" : "outline"} disabled={busy} onClick={() => onUnsubscribe(subscription.id)}>{isAutomatic ? "Unsubscribe" : "Review"}</Button>
              <OverflowActionMenu
                label={message.subject || "message"}
                fastmailUrl={message.fastmailUrl}
                onIgnore={() =>
                  onIgnore(subscription.id, subscription.status !== "ignored")
                }
                ignoreLabel="Keep sender"
                onTrash={() => onTrash(message.id)}
                trashLabel="Move to Trash"
                onCombined={() => onCombined(subscription.id, message.id)}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
