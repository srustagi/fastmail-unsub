"use client";

import { CheckCircle2, ExternalLink, MailX, MoreHorizontal, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface OverflowActionMenuProps {
  label: string;
  fastmailUrl: string | null;
  onIgnore: () => void;
  ignoreLabel: string;
  onTrash: () => void;
  trashLabel: string;
  onCombined: () => void;
  triggerSize?: "icon" | "icon-sm";
  triggerClassName?: string;
  showCombinedIcon?: boolean;
}

export function OverflowActionMenu({
  label,
  fastmailUrl,
  onIgnore,
  ignoreLabel,
  onTrash,
  trashLabel,
  onCombined,
  triggerSize = "icon-sm",
  triggerClassName,
  showCombinedIcon = false,
}: OverflowActionMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size={triggerSize}
          className={triggerClassName}
          aria-label={`More actions for ${label}`}
        >
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {fastmailUrl ? (
          <DropdownMenuItem asChild>
            <a href={fastmailUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Open in Fastmail
            </a>
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={onIgnore}>
          <CheckCircle2 className="size-4" />
          {ignoreLabel}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onTrash}>
          <Trash2 className="size-4" />
          {trashLabel}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onCombined}>
          {showCombinedIcon ? <MailX className="size-4" /> : null}
          Unsubscribe and move to Trash
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
