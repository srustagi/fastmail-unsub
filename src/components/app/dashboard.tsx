"use client";

import {
  Activity,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  EyeOff,
  ExternalLink,
  Inbox,
  LoaderCircle,
  Link2,
  LockKeyhole,
  MailX,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Trash2,
  XCircle,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AccountMenu } from "@/components/app/account-menu";
import { ConnectionPanel } from "@/components/app/connection-panel";
import { MessageCompactList } from "@/components/app/message-compact-list";
import { SubscriptionCard } from "@/components/app/subscription-card";
import { SubscriptionCompactList } from "@/components/app/subscription-compact-list";
import { ThemeToggle } from "@/components/app/theme-toggle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type {
  ActivityPage,
  BootstrapResponse,
  TrashResult,
  UnsubscribeResult,
} from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = "review" | "activity" | "settings";
type ReviewList = "review" | "ignored";
type MethodFilter = "all" | "automatic" | "manual";
type SortMode = "recent" | "count" | "name";
type ViewMode = "compact" | "cards";
type ActionSelection = { subscriptionIds: string[]; messageIds: string[] };

const emptyActionSelection: ActionSelection = { subscriptionIds: [], messageIds: [] };

class ApiRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

const navItems: { id: NavItem; label: string; icon: typeof Inbox }[] = [
  { id: "review", label: "Review", icon: Inbox },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "settings", label: "Settings", icon: Settings },
];

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new ApiRequestError(
      payload.error ?? `Request failed (${response.status}).`,
      response.status,
    );
  }
  return payload;
}

function DashboardLoading() {
  return (
    <div className="min-h-screen bg-background p-4 sm:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Skeleton className="h-12 w-56" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
    </div>
  );
}

function AuthenticationRequired({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/30 p-4">
      <Card className="w-full max-w-md text-center shadow-sm">
        <CardHeader className="items-center">
          <div className="mb-2 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <LockKeyhole className="size-6" />
          </div>
          <CardTitle>Authentication required</CardTitle>
          <CardDescription>
            Sign in through Cloudflare Access before connecting Fastmail.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button className="w-full" onClick={onRetry}>
            <RefreshCw className="size-4" />
            Try again
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function Dashboard() {
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [activeNav, setActiveNav] = useState<NavItem>("review");
  const [reviewList, setReviewList] = useState<ReviewList>("review");
  const [methodFilter, setMethodFilter] = useState<MethodFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("count");
  const [viewMode, setViewMode] = useState<ViewMode>("compact");
  const [groupBySender, setGroupBySender] = useState(true);
  const [highConfidenceOnly, setHighConfidenceOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const [pendingTrash, setPendingTrash] = useState<ActionSelection>(emptyActionSelection);
  const [pendingCombined, setPendingCombined] = useState<ActionSelection>(emptyActionSelection);
  const [results, setResults] = useState<UnsubscribeResult[]>([]);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [trashResults, setTrashResults] = useState<TrashResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loadingActivity, setLoadingActivity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authRequired, setAuthRequired] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const nextData = await api<BootstrapResponse>("/api/bootstrap");
      setData(nextData);
      setAuthRequired(false);
    } catch (loadError) {
      if (loadError instanceof ApiRequestError && loadError.status === 401) {
        setAuthRequired(true);
        return;
      }
      throw loadError;
    }
  }, []);

  useEffect(() => {
    // Initial data arrives from the authenticated API after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "Could not load the app.");
    });
  }, [refresh]);

  const filtered = useMemo(() => {
    if (!data) return [];
    const needle = search.trim().toLowerCase();
    const matches = data.subscriptions.filter((subscription) => {
      const isIgnored = subscription.status === "ignored";
      const isFinished = subscription.status === "request_accepted";
      if (reviewList === "ignored" ? !isIgnored : isIgnored || isFinished) return false;
      if (
        methodFilter === "automatic" &&
        subscription.method !== "one_click"
      ) {
        return false;
      }
      if (methodFilter === "manual" && subscription.method === "one_click") {
        return false;
      }
      if (highConfidenceOnly && subscription.confidence !== "high") return false;
      if (!needle) return true;
      return `${subscription.displayName} ${subscription.senderAddress} ${subscription.latestSubject ?? ""}`
        .toLowerCase()
        .includes(needle);
    });
    return matches.toSorted((a, b) => {
      if (sortMode === "count") return b.inboxCount - a.inboxCount;
      if (sortMode === "name") return a.displayName.localeCompare(b.displayName);
      return (b.latestReceivedAt ?? "").localeCompare(a.latestReceivedAt ?? "");
    });
  }, [data, highConfidenceOnly, methodFilter, reviewList, search, sortMode]);

  const subscriptionsById = useMemo(
    () => new Map(data?.subscriptions.map((subscription) => [subscription.id, subscription]) ?? []),
    [data],
  );

  const filteredMessages = useMemo(() => {
    if (!data) return [];
    const visibleSubscriptionIds = new Set(filtered.map((subscription) => subscription.id));
    return data.messages
      .filter((message) => visibleSubscriptionIds.has(message.subscriptionId))
      .toSorted((a, b) => {
        const aSubscription = subscriptionsById.get(a.subscriptionId);
        const bSubscription = subscriptionsById.get(b.subscriptionId);
        if (sortMode === "count") {
          const countDifference = (bSubscription?.inboxCount ?? 0) - (aSubscription?.inboxCount ?? 0);
          if (countDifference !== 0) return countDifference;
        }
        if (sortMode === "name") {
          return (aSubscription?.displayName ?? "").localeCompare(bSubscription?.displayName ?? "");
        }
        return b.receivedAt.localeCompare(a.receivedAt);
      });
  }, [data, filtered, sortMode, subscriptionsById]);

  const activeSubscriptions = data?.subscriptions.filter(
    (subscription) =>
      subscription.status !== "ignored" &&
      subscription.status !== "request_accepted",
  ) ?? [];
  const automaticCount = activeSubscriptions.filter(
    (subscription) => subscription.method === "one_click",
  ).length;
  const activeMessageCount = activeSubscriptions.reduce(
    (sum, subscription) => sum + subscription.inboxCount,
    0,
  );
  const visibleIds = groupBySender
    ? filtered.map((subscription) => subscription.id)
    : filteredMessages.map((message) => message.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const activeFilterCount =
    (methodFilter !== "all" ? 1 : 0) +
    (sortMode !== "count" ? 1 : 0) +
    (highConfidenceOnly ? 1 : 0) +
    (!groupBySender ? 1 : 0) +
    (viewMode !== "compact" ? 1 : 0);

  function toggleSelected(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function openConfirmation(ids: string[]) {
    setPendingIds(ids);
  }

  function openTrashConfirmation(selection: ActionSelection) {
    setPendingTrash(selection);
  }

  function openCombinedConfirmation(selection: ActionSelection) {
    setPendingCombined(selection);
  }

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      await api("/api/scan", { method: "POST", body: "{}" });
      await refresh();
      setSelected(new Set());
    } catch (scanError) {
      setError(scanError instanceof Error ? scanError.message : "Inbox scan failed.");
    } finally {
      setScanning(false);
    }
  }

  async function connect(token: string) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/connection", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      await refresh();
      setActiveNav("review");
    } catch (connectionError) {
      setError(
        connectionError instanceof Error
          ? connectionError.message
          : "Fastmail connection failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/connection", { method: "DELETE" });
      await refresh();
      setSelected(new Set());
    } catch (disconnectError) {
      setError(
        disconnectError instanceof Error
          ? disconnectError.message
          : "Could not disconnect Fastmail.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function ignore(id: string, ignored: boolean) {
    setBusy(true);
    setError(null);
    try {
      await api("/api/ignore", {
        method: "POST",
        body: JSON.stringify({ subscriptionId: id, ignored }),
      });
      await refresh();
      setSelected(new Set());
    } catch (ignoreError) {
      setError(ignoreError instanceof Error ? ignoreError.message : "Could not update sender.");
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribe() {
    const ids = pendingIds;
    setPendingIds([]);
    setBusy(true);
    setError(null);
    try {
      const payload = await api<{ results: UnsubscribeResult[] }>("/api/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ subscriptionIds: ids }),
      });
      setResults(payload.results);
      setTrashResults([]);
      setResultsOpen(true);
      setSelected(new Set());
      await refresh();
    } catch (unsubscribeError) {
      setError(
        unsubscribeError instanceof Error
          ? unsubscribeError.message
          : "Unsubscribe request failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function moveToTrash() {
    const selection = pendingTrash;
    setPendingTrash(emptyActionSelection);
    setBusy(true);
    setError(null);
    try {
      const payload = await api<{ results: TrashResult[] }>("/api/trash", {
        method: "POST",
        body: JSON.stringify(selection),
      });
      setResults([]);
      setTrashResults(payload.results);
      setResultsOpen(true);
      setSelected(new Set());
      await refresh();
    } catch (trashError) {
      setError(
        trashError instanceof Error
          ? trashError.message
          : "Could not move Inbox messages to Trash.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function unsubscribeAndDelete() {
    const selection = pendingCombined;
    setPendingCombined(emptyActionSelection);
    const subscriptionIds = [
      ...new Set([
        ...selection.subscriptionIds,
        ...selection.messageIds
          .map((messageId) => data?.messages.find((message) => message.id === messageId)?.subscriptionId)
          .filter((id): id is string => Boolean(id)),
      ]),
    ];
    setBusy(true);
    setError(null);
    try {
      const operationId = crypto.randomUUID();
      const unsubscribePayload = await api<{ results: UnsubscribeResult[] }>("/api/unsubscribe", {
        method: "POST",
        body: JSON.stringify({ subscriptionIds, operationId }),
      });
      const trashPayload = await api<{ results: TrashResult[] }>("/api/trash", {
        method: "POST",
        body: JSON.stringify({ ...selection, operationId }),
      });
      setResults(unsubscribePayload.results);
      setTrashResults(trashPayload.results);
      setResultsOpen(true);
      setSelected(new Set());
      await refresh();
    } catch (combinedError) {
      setError(combinedError instanceof Error ? combinedError.message : "Unsubscribe and delete failed.");
    } finally {
      setBusy(false);
    }
  }

  async function loadMoreActivity() {
    if (!data || loadingActivity || !data.activityHasMore) return;
    setLoadingActivity(true);
    setError(null);
    try {
      const page = await api<ActivityPage>(`/api/activity?offset=${data.activities.length}`);
      setData((current) => current ? {
        ...current,
        activities: [...current.activities, ...page.activities],
        activityTotal: page.total,
        activityHasMore: page.hasMore,
      } : current);
    } catch (activityError) {
      setError(activityError instanceof Error ? activityError.message : "Could not load older activity.");
    } finally {
      setLoadingActivity(false);
    }
  }

  function messageCountFor(selection: ActionSelection) {
    return selection.messageIds.length +
      (data?.subscriptions
        .filter((subscription) => selection.subscriptionIds.includes(subscription.id))
        .reduce((sum, subscription) => sum + subscription.inboxCount, 0) ?? 0);
  }

  const pendingTrashMessageCount = messageCountFor(pendingTrash);
  const pendingCombinedMessageCount = messageCountFor(pendingCombined);
  const selectedAction: ActionSelection = groupBySender
    ? { subscriptionIds: [...selected], messageIds: [] }
    : { subscriptionIds: [], messageIds: [...selected] };
  const selectedSubscriptionIds = groupBySender
    ? [...selected]
    : [
        ...new Set(
          [...selected]
            .map((messageId) => data?.messages.find((message) => message.id === messageId)?.subscriptionId)
            .filter((id): id is string => Boolean(id)),
        ),
      ];

  if (!data && authRequired) {
    return <AuthenticationRequired onRetry={() => window.location.reload()} />;
  }
  if (!data && !error) return <DashboardLoading />;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-0">
      <div className="mx-auto flex min-h-screen max-w-[1480px]">
        <aside className="sticky top-0 hidden h-screen w-16 shrink-0 flex-col items-center border-e bg-sidebar py-4 md:flex">
          <div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground" aria-label="Unsubscribe">
              <MailX className="size-5" />
          </div>
          <nav className="mt-6 flex w-full flex-col items-center gap-1" aria-label="Primary navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <Tooltip key={item.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={item.label}
                      className={cn("mx-auto rounded-md text-muted-foreground", activeNav === item.id && "bg-sidebar-accent text-sidebar-accent-foreground shadow-xs")}
                      onClick={() => setActiveNav(item.id)}
                    >
                      <Icon className="size-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side="right" sideOffset={8}>{item.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
          <div className="mt-auto flex flex-col items-center gap-1 border-t pt-3">
            <Tooltip>
              <TooltipTrigger asChild><ThemeToggle /></TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>Change theme</TooltipContent>
            </Tooltip>
            <AccountMenu userEmail={data?.userEmail ?? "Authentication required"} />
          </div>
        </aside>

        <main className="min-w-0 flex-1">
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
                <AccountMenu userEmail={data?.userEmail ?? "Authentication required"} />
              </div>
            </div>
          </header>

          <div className="mx-auto max-w-6xl px-4 py-5 sm:px-7 sm:py-7 lg:px-10 lg:py-8">
            {error ? (
              <div role="alert" className="mb-6 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">Something needs attention</p>
                  <p className="mt-1 text-muted-foreground">{error}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setError(null)}>Dismiss</Button>
              </div>
            ) : null}

            {activeNav === "review" ? (
              <section>
                <div className="flex items-center justify-between gap-4 border-b pb-4">
                  <div>
                    <h1 className="font-heading text-xl font-semibold tracking-tight">Review</h1>
                    {data?.connection ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {activeSubscriptions.length} sender{activeSubscriptions.length === 1 ? "" : "s"} · {activeMessageCount} message{activeMessageCount === 1 ? "" : "s"} · {automaticCount} one-click
                        {data.connection.lastScannedAt ? ` · Scanned ${formatTimestamp(data.connection.lastScannedAt)}` : ""}
                      </p>
                    ) : null}
                  </div>
                  {data?.connection ? (
                    <Button onClick={() => void scan()} disabled={scanning}>
                      {scanning ? <LoaderCircle className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                      {scanning ? "Scanning…" : "Scan"}
                    </Button>
                  ) : null}
                </div>

                {!data?.connection ? (
                  <div className="mt-8 max-w-2xl">
                    <ConnectionPanel busy={busy} onConnect={connect} onDisconnect={disconnect} />
                  </div>
                ) : (
                  <>
                    {scanning ? (
                      <Card className="mt-4 border-primary/25 bg-primary/5 py-3">
                        <CardContent className="space-y-3 px-4 sm:px-5">
                          <div className="flex items-center justify-between gap-3 text-sm">
                            <span className="font-medium">Scanning Inbox…</span>
                            <LoaderCircle className="size-4 animate-spin text-primary" />
                          </div>
                          <Progress value={68} className="h-1.5" />
                        </CardContent>
                      </Card>
                    ) : null}

                    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center">
                      <div className="relative flex-1">
                        <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                          value={search}
                          onChange={(event) => setSearch(event.target.value)}
                          placeholder="Search sender or subject"
                          className="bg-card ps-9"
                        />
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" className="justify-between bg-card sm:w-40">
                            <span className="flex items-center gap-2"><SlidersHorizontal className="size-4" /> View & filters</span>
                            {activeFilterCount > 0 ? <Badge variant="secondary">{activeFilterCount}</Badge> : null}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-64">
                          <DropdownMenuLabel>Display</DropdownMenuLabel>
                          <DropdownMenuCheckboxItem
                            checked={groupBySender}
                            onCheckedChange={(checked) => {
                              setGroupBySender(checked === true);
                              setSelected(new Set());
                              if (checked !== true) setViewMode("compact");
                            }}
                          >
                            Group by sender
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuCheckboxItem checked={highConfidenceOnly} onCheckedChange={(checked) => setHighConfidenceOnly(checked === true)}>
                            High confidence only
                          </DropdownMenuCheckboxItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Layout</DropdownMenuLabel>
                          <DropdownMenuRadioGroup value={viewMode} onValueChange={(value) => setViewMode(value as ViewMode)}>
                            <DropdownMenuRadioItem value="compact">Compact list</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="cards" disabled={!groupBySender}>Cards</DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Unsubscribe method</DropdownMenuLabel>
                          <DropdownMenuRadioGroup value={methodFilter} onValueChange={(value) => setMethodFilter(value as MethodFilter)}>
                            <DropdownMenuRadioItem value="all">All methods</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="automatic">One-click only</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="manual">Manual only</DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                          <DropdownMenuSeparator />
                          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
                          <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                            <DropdownMenuRadioItem value="count">Most Inbox mail</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="recent">Most recent</DropdownMenuRadioItem>
                            <DropdownMenuRadioItem value="name">Sender A–Z</DropdownMenuRadioItem>
                          </DropdownMenuRadioGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 border-b pb-3">
                      <Tabs value={reviewList} onValueChange={(value) => setReviewList(value as ReviewList)}>
                        <TabsList>
                          <TabsTrigger value="review">Needs review</TabsTrigger>
                          <TabsTrigger value="ignored">Kept</TabsTrigger>
                        </TabsList>
                      </Tabs>
                      <label className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Checkbox
                          checked={allVisibleSelected}
                          onCheckedChange={(checked) => {
                            const shouldSelect = checked === true;
                            setSelected((current) => {
                              const next = new Set(current);
                              for (const id of visibleIds) {
                                if (shouldSelect) next.add(id);
                                else next.delete(id);
                              }
                              return next;
                            });
                          }}
                        />
                        Select visible
                      </label>
                    </div>

                    <div className="mt-4 space-y-3">
                      {groupBySender && viewMode === "compact" && filtered.length > 0 ? (
                        <SubscriptionCompactList
                          subscriptions={filtered}
                          messages={data.messages}
                          selected={selected}
                          busy={busy}
                          onSelect={toggleSelected}
                          onIgnore={(id, ignored) => void ignore(id, ignored)}
                          onTrash={(id) => openTrashConfirmation({ subscriptionIds: [id], messageIds: [] })}
                          onTrashMessage={(id) => openTrashConfirmation({ subscriptionIds: [], messageIds: [id] })}
                          onUnsubscribe={(id) => openConfirmation([id])}
                          onCombined={(subscriptionId, messageId) => openCombinedConfirmation({
                            subscriptionIds: messageId ? [] : [subscriptionId],
                            messageIds: messageId ? [messageId] : [],
                          })}
                        />
                      ) : null}
                      {groupBySender && viewMode === "cards"
                        ? filtered.map((subscription) => (
                            <SubscriptionCard
                              key={subscription.id}
                              subscription={subscription}
                              selected={selected.has(subscription.id)}
                              busy={busy}
                              onSelect={toggleSelected}
                              onIgnore={(id, ignored) => void ignore(id, ignored)}
                              onTrash={(id) => openTrashConfirmation({ subscriptionIds: [id], messageIds: [] })}
                              onUnsubscribe={(id) => openConfirmation([id])}
                              onCombined={(id) => openCombinedConfirmation({ subscriptionIds: [id], messageIds: [] })}
                            />
                          ))
                        : null}
                      {!groupBySender && filteredMessages.length > 0 ? (
                        <MessageCompactList
                          messages={filteredMessages}
                          subscriptionsById={subscriptionsById}
                          selected={selected}
                          busy={busy}
                          onSelect={toggleSelected}
                          onIgnore={(id, ignored) => void ignore(id, ignored)}
                          onTrash={(id) => openTrashConfirmation({ subscriptionIds: [], messageIds: [id] })}
                          onUnsubscribe={(id) => openConfirmation([id])}
                          onCombined={(subscriptionId, messageId) => openCombinedConfirmation({ subscriptionIds: [], messageIds: [messageId] })}
                        />
                      ) : null}
                      {(groupBySender ? filtered.length === 0 : filteredMessages.length === 0) ? (
                        <Card className="border-dashed py-12 text-center">
                          <CardContent>
                            <CheckCircle2 className="mx-auto size-8 text-primary" />
                            <h2 className="mt-4 font-semibold">Nothing here</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {data.connection.lastScannedAt
                                ? (!groupBySender && data.messages.length === 0
                                  ? "Scan Inbox once more to load individual messages for the new ungrouped view."
                                  : "Try another filter or scan the Inbox again.")
                                : "Run the first Inbox scan to find subscriptions."}
                            </p>
                            {!data.connection.lastScannedAt ? (
                              <Button className="mt-5" onClick={() => void scan()} disabled={scanning}>
                                <RefreshCw className="size-4" />
                                Scan Inbox
                              </Button>
                            ) : null}
                          </CardContent>
                        </Card>
                      ) : null}
                    </div>
                  </>
                )}
              </section>
            ) : null}

            {activeNav === "activity" ? (
              <section>
                <div className="border-b pb-4">
                  <h1 className="font-heading text-xl font-semibold tracking-tight">Activity</h1>
                </div>
                <div className="mt-5 space-y-3">
                  {data?.activities.map((activity) => (
                    <Card key={activity.id} className="py-4 shadow-sm">
                      <CardContent className="flex items-start gap-3 px-4 sm:px-5">
                        <div className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", ["completed", "connected", "request_accepted", "moved"].includes(activity.status) ? "bg-primary/10 text-primary" : activity.status === "failed" ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground")}> 
                          {activity.eventType.startsWith("trash") ? <Trash2 className="size-4" /> : activity.eventType === "scan" ? <RefreshCw className="size-4" /> : activity.eventType === "connection" ? <Link2 className="size-4" /> : activity.eventType === "ignore" ? <EyeOff className="size-4" /> : activity.eventType === "restore" ? <CheckCircle2 className="size-4" /> : activity.status === "request_accepted" ? <Check className="size-4" /> : activity.status === "failed" ? <XCircle className="size-4" /> : <ExternalLink className="size-4" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <p className="truncate font-medium">{activity.subject ?? "Account activity"}</p>
                              <Badge variant="outline" className="font-normal capitalize">{activity.eventType.replaceAll("_", " ")}</Badge>
                            </div>
                            <span className="text-xs text-muted-foreground">{formatTimestamp(activity.createdAt)}</span>
                          </div>
                          <p className="mt-1 text-sm text-muted-foreground">{activity.detail}</p>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {data?.activities.length === 0 ? (
                    <Card className="border-dashed py-12 text-center">
                      <CardContent>
                        <Activity className="mx-auto size-8 text-muted-foreground" />
                        <p className="mt-3 font-medium">No activity yet</p>
                      </CardContent>
                    </Card>
                  ) : null}
                  {data?.activityHasMore ? (
                    <div className="flex justify-center pt-2">
                      <Button variant="outline" disabled={loadingActivity} onClick={() => void loadMoreActivity()}>
                        {loadingActivity ? <LoaderCircle className="size-4 animate-spin" /> : null}
                        Load older activity ({data.activities.length} of {data.activityTotal})
                      </Button>
                    </div>
                  ) : data && data.activityTotal > 0 ? (
                    <p className="pt-2 text-center text-xs text-muted-foreground">All {data.activityTotal} events shown</p>
                  ) : null}
                </div>
              </section>
            ) : null}

            {activeNav === "settings" ? (
              <section className="max-w-2xl">
                <div className="border-b pb-4">
                  <h1 className="font-heading text-xl font-semibold tracking-tight">Settings</h1>
                </div>
                <div className="mt-5 space-y-5">
                  <ConnectionPanel connectedUsername={data?.connection?.username} busy={busy} onConnect={connect} onDisconnect={disconnect} />
                  <Card className="shadow-sm">
                    <CardHeader>
                      <CardTitle>Mailbox scope</CardTitle>
                      <CardDescription>The scanner deliberately stays narrow.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4 text-sm">
                      {[
                        "All messages currently in Inbox",
                        "Read and unread mail",
                        "Headers and basic metadata only during scans",
                        "Only selected matches can be moved to recoverable Trash",
                      ].map((label) => (
                        <div key={label} className="flex items-center gap-3">
                          <CheckCircle2 className="size-4 text-primary" />
                          <span>{label}</span>
                        </div>
                      ))}
                      <Separator />
                      <div className="flex items-start gap-3 text-muted-foreground">
                        <XCircle className="mt-0.5 size-4 shrink-0" />
                        <span>Archive, folders, Sent, Drafts, Spam, and Trash are never included.</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </section>
            ) : null}
          </div>
        </main>
      </div>

      {selected.size > 0 ? (
        <div className="fixed inset-x-3 bottom-20 z-40 mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-3 rounded-2xl border bg-foreground p-3 text-background shadow-2xl md:bottom-5">
          <div className="min-w-0 ps-1">
            <p className="font-medium">{selected.size} selected</p>
            <p className="truncate text-xs text-background/65">Choose an action; both require confirmation.</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" size="sm" className="text-background hover:bg-background/10 hover:text-background" onClick={() => setSelected(new Set())}>Clear</Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-background hover:bg-background/10 hover:text-background"
              onClick={() => openTrashConfirmation(selectedAction)}
            >
              <Trash2 className="size-4" />
              Move to Trash
            </Button>
            <Button size="sm" variant="secondary" onClick={() => openConfirmation(selectedSubscriptionIds)}>
              Unsubscribe
              <ChevronRight className="size-4" />
            </Button>
            <Button size="sm" variant="destructive" onClick={() => openCombinedConfirmation(selectedAction)}>
              Unsub + Delete
            </Button>
          </div>
        </div>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-3 border-t bg-background/95 p-2 backdrop-blur md:hidden" aria-label="Mobile navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Button key={item.id} variant="ghost" className={cn("h-14 flex-col gap-1 rounded-xl text-xs", activeNav === item.id && "bg-primary/10 text-primary")} onClick={() => setActiveNav(item.id)}>
              <Icon className="size-4" />
              {item.label}
            </Button>
          );
        })}
      </nav>

      <AlertDialog open={pendingIds.length > 0} onOpenChange={(open) => !open && setPendingIds([])}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsubscribe from {pendingIds.length} sender{pendingIds.length === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Standards-based one-click requests will be sent automatically. Everything else will be returned as a manual link for you to open. No ordinary unsubscribe page is fetched in the background.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void unsubscribe()}>
              Confirm unsubscribe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingTrash.subscriptionIds.length + pendingTrash.messageIds.length > 0}
        onOpenChange={(open) => !open && setPendingTrash(emptyActionSelection)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Move {pendingTrashMessageCount} Inbox message
              {pendingTrashMessageCount === 1 ? "" : "s"} to Trash?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This moves the selected Inbox mail into Fastmail Trash.
              It does not permanently delete anything, and messages can be restored in Fastmail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void moveToTrash()}>
              <Trash2 className="size-4" />
              Move to Trash
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={pendingCombined.subscriptionIds.length + pendingCombined.messageIds.length > 0}
        onOpenChange={(open) => !open && setPendingCombined(emptyActionSelection)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Unsubscribe and delete {pendingCombinedMessageCount} Inbox message
              {pendingCombinedMessageCount === 1 ? "" : "s"}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              First, the app will submit any standards-based one-click requests (or give you a manual link). Then it will move the selected Inbox mail to recoverable Fastmail Trash.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void unsubscribeAndDelete()}>
              Unsub + Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Sheet open={resultsOpen} onOpenChange={setResultsOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{results.length > 0 && trashResults.length > 0 ? "Unsubscribe + delete results" : results.length > 0 ? "Unsubscribe results" : "Inbox cleanup results"}</SheetTitle>
            <SheetDescription>{trashResults.length > 0 ? "Deleted messages were moved to recoverable Fastmail Trash." : "Automatic requests and manual handoffs are shown separately."}</SheetDescription>
          </SheetHeader>
          <div className="space-y-3 px-4 pb-6">
            {results.map((result) => (
              <Card key={result.subscriptionId} className="py-4">
                <CardContent className="px-4">
                  <div className="flex items-start gap-3">
                    {result.status === "request_accepted" ? <CheckCircle2 className="mt-0.5 size-5 text-primary" /> : result.status === "failed" ? <XCircle className="mt-0.5 size-5 text-destructive" /> : <ExternalLink className="mt-0.5 size-5 text-muted-foreground" />}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{result.sender}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{result.detail}</p>
                      {result.manualUrl ? (
                        <Button size="sm" variant="outline" className="mt-3" asChild>
                          <a href={result.manualUrl} target="_blank" rel="noreferrer">
                            Continue manually
                            <ExternalLink className="size-3.5" />
                          </a>
                        </Button>
                      ) : null}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            {results.length > 0 && trashResults.length > 0 ? <Separator /> : null}
            {trashResults.map((result) => (
              <Card key={`trash-${result.subscriptionId}`} className="py-4">
                <CardContent className="px-4">
                  <div className="flex items-start gap-3">
                    {result.status === "moved" ? (
                      <Trash2 className="mt-0.5 size-5 text-primary" />
                    ) : result.status === "failed" ? (
                      <XCircle className="mt-0.5 size-5 text-destructive" />
                    ) : (
                      <CheckCircle2 className="mt-0.5 size-5 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{result.sender}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{result.detail}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
