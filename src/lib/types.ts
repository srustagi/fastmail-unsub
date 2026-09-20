export type UnsubscribeMethod = "one_click" | "web" | "mailto" | "message";
export type SubscriptionStatus =
  | "new"
  | "ignored"
  | "request_accepted"
  | "manual_required"
  | "failed";

export interface Subscription {
  id: string;
  displayName: string;
  senderAddress: string;
  senderDomain: string;
  listId: string | null;
  method: UnsubscribeMethod;
  oneClick: boolean;
  fastmailRecognized: boolean;
  confidence: "high" | "medium";
  reasons: string[];
  inboxCount: number;
  latestSubject: string | null;
  latestReceivedAt: string | null;
  latestMessageId: string | null;
  fastmailUrl: string | null;
  status: SubscriptionStatus;
}

export interface InboxMessage {
  id: string;
  subscriptionId: string;
  senderAddress: string;
  subject: string | null;
  receivedAt: string;
  fastmailUrl: string | null;
}

export interface ActivityRecord {
  id: string;
  eventType: string;
  status: string;
  subjectId: string | null;
  subject: string | null;
  detail: string | null;
  correlationId: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ActivityPage {
  activities: ActivityRecord[];
  total: number;
  hasMore: boolean;
}

export interface BootstrapResponse {
  userEmail: string;
  connection: null | {
    username: string;
    connectedAt: string;
    lastScannedAt: string | null;
    lastScanCount: number;
  };
  subscriptions: Subscription[];
  messages: InboxMessage[];
  activities: ActivityRecord[];
  activityTotal: number;
  activityHasMore: boolean;
}

export interface UnsubscribeResult {
  subscriptionId: string;
  sender: string;
  status: "request_accepted" | "manual_required" | "failed";
  detail: string;
  manualUrl?: string;
}

export interface TrashResult {
  subscriptionId: string;
  sender: string;
  movedCount: number;
  status: "moved" | "no_messages" | "failed";
  detail: string;
}
