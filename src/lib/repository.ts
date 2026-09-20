import { decryptSecret } from "@/lib/crypto";
import { getDb } from "@/lib/runtime";
import type {
  ActivityPage,
  ActivityRecord,
  BootstrapResponse,
  InboxMessage,
  Subscription,
  TrashResult,
  UnsubscribeMethod,
} from "@/lib/types";

interface ConnectionViewRow {
  username: string;
  connected_at: string;
  last_scanned_at: string | null;
  last_scan_count: number;
}

interface SubscriptionRow {
  id: string;
  display_name: string;
  sender_address: string;
  sender_domain: string;
  list_id: string | null;
  unsubscribe_method: UnsubscribeMethod;
  one_click: number;
  fastmail_recognized: number;
  confidence: "high" | "medium";
  reasons_json: string;
  inbox_count: number;
  latest_subject: string | null;
  latest_received_at: string | null;
  latest_message_id: string | null;
  status: Subscription["status"];
}

interface ActivityRow {
  id: string;
  event_type: string;
  status: string;
  subject_id: string | null;
  subject_label: string | null;
  detail: string | null;
  correlation_id: string | null;
  created_at: string;
  completed_at: string | null;
}

const ACTIVITY_PAGE_SIZE = 50;
const D1_MAX_BOUND_PARAMETERS = 100;
const MESSAGE_DELETE_CHUNK_SIZE = D1_MAX_BOUND_PARAMETERS - 1;

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function toActivityRecord(row: ActivityRow): ActivityRecord {
  return {
    id: row.id,
    eventType: row.event_type,
    status: row.status,
    subjectId: row.subject_id,
    subject: row.subject_label,
    detail: row.detail,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
    completedAt: row.completed_at,
  };
}

export async function getActivityPage(
  userEmail: string,
  offset = 0,
  limit = ACTIVITY_PAGE_SIZE,
): Promise<ActivityPage> {
  const db = getDb();
  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const safeOffset = Math.max(offset, 0);
  const [rows, count] = await Promise.all([
    db
      .prepare(
        `SELECT id, event_type, status, subject_id, subject_label, detail,
                correlation_id, created_at, completed_at
         FROM activity_events
         WHERE user_email = ?
         ORDER BY created_at DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .bind(userEmail, safeLimit, safeOffset)
      .all<ActivityRow>(),
    db
      .prepare("SELECT COUNT(*) AS total FROM activity_events WHERE user_email = ?")
      .bind(userEmail)
      .first<{ total: number }>(),
  ]);
  const total = count?.total ?? 0;
  return {
    activities: rows.results.map(toActivityRecord),
    total,
    hasMore: safeOffset + rows.results.length < total,
  };
}

export async function startActivity(input: {
  userEmail: string;
  eventType: string;
  subjectId?: string;
  subject?: string;
  detail: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const id = crypto.randomUUID();
  await getDb()
    .prepare(
      `INSERT INTO activity_events
        (id, user_email, event_type, status, subject_id, subject_label, detail,
         metadata_json, correlation_id, created_at, completed_at)
       VALUES (?, ?, ?, 'started', ?, ?, ?, ?, ?, ?, NULL)`,
    )
    .bind(
      id,
      input.userEmail,
      input.eventType,
      input.subjectId ?? null,
      input.subject ?? null,
      input.detail,
      JSON.stringify(input.metadata ?? {}),
      input.correlationId ?? null,
      new Date().toISOString(),
    )
    .run();
  return id;
}

export async function completeActivity(
  id: string,
  userEmail: string,
  input: {
    status: string;
    detail: string;
    subject?: string;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  await getDb()
    .prepare(
      `UPDATE activity_events
       SET status = ?, detail = ?, subject_label = COALESCE(?, subject_label),
           metadata_json = ?, completed_at = ?
       WHERE id = ? AND user_email = ?`,
    )
    .bind(
      input.status,
      input.detail,
      input.subject ?? null,
      JSON.stringify(input.metadata ?? {}),
      new Date().toISOString(),
      id,
      userEmail,
    )
    .run();
}

export async function recordActivity(input: {
  userEmail: string;
  eventType: string;
  status: string;
  subjectId?: string;
  subject?: string;
  detail: string;
  correlationId?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const now = new Date().toISOString();
  await getDb()
    .prepare(
      `INSERT INTO activity_events
        (id, user_email, event_type, status, subject_id, subject_label, detail,
         metadata_json, correlation_id, created_at, completed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      crypto.randomUUID(),
      input.userEmail,
      input.eventType,
      input.status,
      input.subjectId ?? null,
      input.subject ?? null,
      input.detail,
      JSON.stringify(input.metadata ?? {}),
      input.correlationId ?? null,
      now,
      now,
    )
    .run();
}

interface MessageRow {
  id: string;
  subscription_id: string;
  sender_address: string;
  subject: string | null;
  received_at: string;
  message_id: string | null;
}

export async function getBootstrap(
  userEmail: string,
): Promise<BootstrapResponse> {
  const db = getDb();
  const [connection, subscriptionRows, messageRows, activityPage] = await Promise.all([
    db
      .prepare(
        `SELECT username, connected_at, last_scanned_at, last_scan_count
         FROM connections WHERE user_email = ?`,
      )
      .bind(userEmail)
      .first<ConnectionViewRow>(),
    db
      .prepare(
        `SELECT id, display_name, sender_address, sender_domain, list_id,
                unsubscribe_method, one_click, fastmail_recognized, confidence,
                reasons_json, inbox_count, latest_subject, latest_received_at,
                latest_message_id, status
         FROM subscriptions
         WHERE user_email = ? AND inbox_count > 0
         ORDER BY latest_received_at DESC`,
      )
      .bind(userEmail)
      .all<SubscriptionRow>(),
    db
      .prepare(
        `SELECT id, subscription_id, sender_address, subject, received_at, message_id
         FROM messages
         WHERE user_email = ?
         ORDER BY received_at DESC`,
      )
      .bind(userEmail)
      .all<MessageRow>(),
    getActivityPage(userEmail),
  ]);

  return {
    userEmail,
    connection: connection
      ? {
          username: connection.username,
          connectedAt: connection.connected_at,
          lastScannedAt: connection.last_scanned_at,
          lastScanCount: connection.last_scan_count,
        }
      : null,
    subscriptions: subscriptionRows.results.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      senderAddress: row.sender_address,
      senderDomain: row.sender_domain,
      listId: row.list_id,
      method: row.unsubscribe_method,
      oneClick: Boolean(row.one_click),
      fastmailRecognized: Boolean(row.fastmail_recognized),
      confidence: row.confidence,
      reasons: JSON.parse(row.reasons_json) as string[],
      inboxCount: row.inbox_count,
      latestSubject: row.latest_subject,
      latestReceivedAt: row.latest_received_at,
      latestMessageId: row.latest_message_id,
      fastmailUrl: row.latest_message_id
        ? `https://app.fastmail.com/mail/search:msgid:${encodeURIComponent(row.latest_message_id)}`
        : null,
      status: row.status,
    })),
    messages: messageRows.results.map((row) => ({
      id: row.id,
      subscriptionId: row.subscription_id,
      senderAddress: row.sender_address,
      subject: row.subject,
      receivedAt: row.received_at,
      fastmailUrl: row.message_id
        ? `https://app.fastmail.com/mail/search:msgid:${encodeURIComponent(row.message_id)}`
        : null,
    } satisfies InboxMessage)),
    activities: activityPage.activities,
    activityTotal: activityPage.total,
    activityHasMore: activityPage.hasMore,
  };
}

export async function setIgnored(
  userEmail: string,
  subscriptionId: string,
  ignored: boolean,
): Promise<void> {
  const db = getDb();
  const subscription = await db
    .prepare("SELECT display_name FROM subscriptions WHERE id = ? AND user_email = ?")
    .bind(subscriptionId, userEmail)
    .first<{ display_name: string }>();
  if (!subscription) throw new Error("That subscription is no longer available.");

  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        "UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ? AND user_email = ?",
      )
      .bind(ignored ? "ignored" : "new", now, subscriptionId, userEmail),
    db
      .prepare(
        `INSERT INTO activity_events
          (id, user_email, event_type, status, subject_id, subject_label, detail,
           metadata_json, correlation_id, created_at, completed_at)
         VALUES (?, ?, ?, 'completed', ?, ?, ?, '{}', NULL, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        userEmail,
        ignored ? "ignore" : "restore",
        subscriptionId,
        subscription.display_name,
        ignored ? "Sender moved to Ignored." : "Sender restored to Review.",
        now,
        now,
      ),
  ]);
}

export async function getSubscriptionTargets(
  userEmail: string,
  ids: string[],
): Promise<
  {
    id: string;
    sender: string;
    method: UnsubscribeMethod;
    target: string | null;
    fastmailUrl: string | null;
  }[]
> {
  if (ids.length === 0) return [];
  const placeholders = ids.map(() => "?").join(",");
  const rows = await getDb()
    .prepare(
      `SELECT id, display_name, unsubscribe_method,
              encrypted_unsubscribe_target, latest_message_id
       FROM subscriptions
       WHERE user_email = ? AND id IN (${placeholders})`,
    )
    .bind(userEmail, ...ids)
    .all<{
      id: string;
      display_name: string;
      unsubscribe_method: UnsubscribeMethod;
      encrypted_unsubscribe_target: string | null;
      latest_message_id: string | null;
    }>();

  return Promise.all(
    rows.results.map(async (row) => ({
      id: row.id,
      sender: row.display_name,
      method: row.unsubscribe_method,
      target: row.encrypted_unsubscribe_target
        ? await decryptSecret(
            row.encrypted_unsubscribe_target,
            `${userEmail}:unsubscribe:${row.id}`,
          )
        : null,
      fastmailUrl: row.latest_message_id
        ? `https://app.fastmail.com/mail/search:msgid:${encodeURIComponent(row.latest_message_id)}`
        : null,
    })),
  );
}

export async function recordAction(input: {
  userEmail: string;
  subscriptionId: string;
  method: string;
  status: string;
  responseStatus?: number;
  detail: string;
  correlationId?: string;
}): Promise<void> {
  const now = new Date().toISOString();
  const db = getDb();
  await db.batch([
    db
      .prepare(
        `INSERT INTO activity_events
          (id, user_email, event_type, status, subject_id, subject_label, detail,
           metadata_json, correlation_id, created_at, completed_at)
         SELECT ?, ?, 'unsubscribe', ?, s.id, s.display_name, ?, ?, ?, ?, ?
         FROM subscriptions s WHERE s.id = ? AND s.user_email = ?`,
      )
      .bind(
        crypto.randomUUID(),
        input.userEmail,
        input.status,
        input.detail,
        JSON.stringify({
          method: input.method,
          responseStatus: input.responseStatus ?? null,
        }),
        input.correlationId ?? null,
        now,
        now,
        input.subscriptionId,
        input.userEmail,
      ),
    db
      .prepare(
        "UPDATE subscriptions SET status = ?, updated_at = ? WHERE id = ? AND user_email = ?",
      )
      .bind(input.status, now, input.subscriptionId, input.userEmail),
  ]);
}

export async function recordTrashResults(
  userEmail: string,
  results: TrashResult[],
  movedMessageIdsBySubscription: Map<string, string[]> = new Map(),
  correlationId?: string,
): Promise<void> {
  if (results.length === 0) return;

  const now = new Date().toISOString();
  const db = getDb();
  const statements: D1PreparedStatement[] = [];

  for (const result of results) {
    statements.push(
      db
        .prepare(
          `INSERT INTO activity_events
            (id, user_email, event_type, status, subject_id, subject_label, detail,
             metadata_json, correlation_id, created_at, completed_at)
           SELECT ?, ?, 'trash', ?, s.id, s.display_name, ?, ?, ?, ?, ?
           FROM subscriptions s WHERE s.id = ? AND s.user_email = ?`,
        )
        .bind(
          crypto.randomUUID(),
          userEmail,
          result.status,
          result.detail,
          JSON.stringify({ movedCount: result.movedCount }),
          correlationId ?? null,
          now,
          now,
          result.subscriptionId,
          userEmail,
        ),
    );

    if (result.movedCount > 0) {
      statements.push(
        db
          .prepare(
            `UPDATE subscriptions
             SET inbox_count = MAX(0, inbox_count - ?), updated_at = ?
             WHERE id = ? AND user_email = ?`,
          )
          .bind(result.movedCount, now, result.subscriptionId, userEmail),
      );

      const movedMessageIds = movedMessageIdsBySubscription.get(
        result.subscriptionId,
      ) ?? [];
      for (const messageIdChunk of chunksOf(
        movedMessageIds,
        MESSAGE_DELETE_CHUNK_SIZE,
      )) {
        const placeholders = messageIdChunk.map(() => "?").join(",");
        statements.push(
          db
            .prepare(
              `DELETE FROM messages
               WHERE user_email = ? AND id IN (${placeholders})`,
            )
            .bind(userEmail, ...messageIdChunk),
        );
      }
    }
  }

  await db.batch(statements);
}
