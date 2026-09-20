import { decryptSecret, encryptSecret, stableId } from "@/lib/crypto";
import { getDb } from "@/lib/runtime";
import { recordTrashResults } from "@/lib/repository";
import type { TrashResult, UnsubscribeMethod } from "@/lib/types";

const SESSION_URL = "https://api.fastmail.com/jmap/session";
const MAIL_CAPABILITY = "urn:ietf:params:jmap:mail";
const PAGE_SIZE = 500;
const DB_WRITE_CHUNK_SIZE = 250;

interface JmapSession {
  apiUrl: string;
  username: string;
  primaryAccounts: Record<string, string>;
}

interface Mailbox {
  id: string;
  role: string | null;
}

interface EmailAddress {
  name: string | null;
  email: string;
}

interface JmapEmail {
  id: string;
  messageId: string[] | null;
  from: EmailAddress[] | null;
  subject: string | null;
  receivedAt: string;
  "header:List-Unsubscribe:asURLs"?: string[] | null;
  "header:List-Unsubscribe-Post:asText"?: string | null;
  "header:List-Id:asText"?: string | null;
  "header:Precedence:asText"?: string | null;
  "header:X-ME-VSSU:asText"?: string | null;
}

interface CandidateGroup {
  key: string;
  displayName: string;
  senderAddress: string;
  senderDomain: string;
  listId: string | null;
  target: string | null;
  method: UnsubscribeMethod;
  oneClick: boolean;
  fastmailRecognized: boolean;
  confidence: "high" | "medium";
  reasons: string[];
  inboxCount: number;
  latestSubject: string | null;
  latestReceivedAt: string;
  latestMessageId: string | null;
}

interface ConnectionRow {
  encrypted_token: string;
  account_id: string;
  api_url: string;
}

interface StoredTrashMessageRow {
  id: string;
  subscription_id: string;
  jmap_email_id: string;
  display_name: string;
}

interface ScannedMessage {
  candidateKey: string;
  jmapEmailId: string;
  messageId: string | null;
  senderAddress: string;
  subject: string | null;
  receivedAt: string;
}

async function fetchSession(token: string): Promise<JmapSession> {
  const response = await fetch(SESSION_URL, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!response.ok) {
    throw new Error(
      response.status === 401
        ? "Fastmail rejected that API token."
        : `Fastmail connection failed (${response.status}).`,
    );
  }

  const session = (await response.json()) as JmapSession;
  if (!session.primaryAccounts[MAIL_CAPABILITY]) {
    throw new Error("This token does not include Fastmail Email access.");
  }
  return session;
}

async function jmapCall<T>(
  apiUrl: string,
  token: string,
  accountId: string,
  name: string,
  argumentsValue: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", MAIL_CAPABILITY],
      methodCalls: [[name, { accountId, ...argumentsValue }, "call"]],
    }),
  });

  if (!response.ok) {
    throw new Error(`Fastmail JMAP request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    methodResponses: [string, T | { type: string; description?: string }, string][];
  };
  const [responseName, result] = payload.methodResponses[0] ?? [];

  if (responseName === "error") {
    const error = result as { type: string; description?: string };
    throw new Error(error.description ?? `Fastmail JMAP error: ${error.type}`);
  }

  return result as T;
}

async function jmapQueryEmailPage(
  apiUrl: string,
  token: string,
  accountId: string,
  inboxId: string,
  position: number,
): Promise<{ ids: string[]; total: number; emails: JmapEmail[] }> {
  const properties = [
    "id",
    "messageId",
    "from",
    "subject",
    "receivedAt",
    "header:List-Unsubscribe:asURLs",
    "header:List-Unsubscribe-Post:asText",
    "header:List-Id:asText",
    "header:Precedence:asText",
    "header:X-ME-VSSU:asText",
  ];
  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      using: ["urn:ietf:params:jmap:core", MAIL_CAPABILITY],
      methodCalls: [
        [
          "Email/query",
          {
            accountId,
            filter: { inMailbox: inboxId },
            sort: [{ property: "receivedAt", isAscending: false }],
            collapseThreads: false,
            position,
            limit: PAGE_SIZE,
            calculateTotal: true,
          },
          "query",
        ],
        [
          "Email/get",
          {
            accountId,
            "#ids": {
              resultOf: "query",
              name: "Email/query",
              path: "/ids",
            },
            properties,
          },
          "get",
        ],
      ],
    }),
  });

  if (!response.ok) {
    throw new Error(`Fastmail JMAP request failed (${response.status}).`);
  }

  const payload = (await response.json()) as {
    methodResponses: [string, Record<string, unknown>, string][];
  };
  const queryResponse = payload.methodResponses.find((entry) => entry[2] === "query");
  const getResponse = payload.methodResponses.find((entry) => entry[2] === "get");
  if (!queryResponse || queryResponse[0] === "error") {
    throw new Error("Fastmail could not query the Inbox.");
  }
  if (!getResponse || getResponse[0] === "error") {
    throw new Error("Fastmail could not load the queried Inbox messages.");
  }

  const query = queryResponse[1] as unknown as { ids: string[]; total: number };
  const emailResult = getResponse[1] as unknown as { list: JmapEmail[] };
  return { ids: query.ids, total: query.total, emails: emailResult.list };
}

function chunksOf<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function senderDomain(address: string): string {
  return address.split("@").at(-1)?.toLowerCase() ?? address.toLowerCase();
}

function classifyEmail(email: JmapEmail): CandidateGroup | null {
  const sender = email.from?.[0];
  if (!sender?.email) return null;

  const listId = email["header:List-Id:asText"]?.trim() || null;
  const precedence = email["header:Precedence:asText"]?.trim().toLowerCase();
  const fastmailRecognized =
    email["header:X-ME-VSSU:asText"] !== undefined &&
    email["header:X-ME-VSSU:asText"] !== null;
  const urls = email["header:List-Unsubscribe:asURLs"] ?? [];
  const webUrl = urls.find((url) => url.toLowerCase().startsWith("https://"));
  const mailtoUrl = urls.find((url) => url.toLowerCase().startsWith("mailto:"));
  const postHeader = email["header:List-Unsubscribe-Post:asText"]
    ?.trim()
    .toLowerCase();
  const oneClick =
    Boolean(webUrl) && postHeader === "list-unsubscribe=one-click";

  if (
    !fastmailRecognized &&
    urls.length === 0 &&
    !listId &&
    precedence !== "bulk" &&
    precedence !== "list"
  ) {
    return null;
  }

  const reasons: string[] = [];
  if (fastmailRecognized) reasons.push("Fastmail recognized an unsubscribe option");
  if (oneClick) reasons.push("Standards-based one-click unsubscribe");
  else if (urls.length > 0) reasons.push("List-Unsubscribe header present");
  if (listId) reasons.push("Mailing-list identifier present");
  if (precedence === "bulk" || precedence === "list") {
    reasons.push(`Marked as ${precedence} mail`);
  }

  let target: string | null = null;
  let method: UnsubscribeMethod = "message";
  if (oneClick && webUrl) {
    target = webUrl;
    method = "one_click";
  } else if (webUrl) {
    target = webUrl;
    method = "web";
  } else if (mailtoUrl) {
    target = mailtoUrl;
    method = "mailto";
  }

  const address = sender.email.toLowerCase();
  return {
    key: listId?.toLowerCase() ?? address,
    displayName: sender.name?.trim() || senderDomain(address),
    senderAddress: address,
    senderDomain: senderDomain(address),
    listId,
    target,
    method,
    oneClick,
    fastmailRecognized,
    confidence: fastmailRecognized || urls.length > 0 ? "high" : "medium",
    reasons,
    inboxCount: 1,
    latestSubject: email.subject,
    latestReceivedAt: email.receivedAt,
    latestMessageId: email.messageId?.[0] ?? null,
  };
}

function mergeCandidate(
  groups: Map<string, CandidateGroup>,
  candidate: CandidateGroup,
): void {
  const current = groups.get(candidate.key);
  if (!current) {
    groups.set(candidate.key, candidate);
    return;
  }

  current.inboxCount += 1;
  current.fastmailRecognized ||= candidate.fastmailRecognized;
  current.reasons = [...new Set([...current.reasons, ...candidate.reasons])];

  if (candidate.oneClick && !current.oneClick) {
    current.oneClick = true;
    current.method = candidate.method;
    current.target = candidate.target;
  }
  if (candidate.latestReceivedAt > current.latestReceivedAt) {
    current.latestReceivedAt = candidate.latestReceivedAt;
    current.latestSubject = candidate.latestSubject;
    current.latestMessageId = candidate.latestMessageId;
    if (candidate.target) {
      current.target = candidate.target;
      current.method = candidate.method;
    }
  }
}

export async function connectFastmail(
  userEmail: string,
  token: string,
): Promise<{ username: string }> {
  const trimmedToken = token.trim();
  if (trimmedToken.length < 20 || trimmedToken.length > 500) {
    throw new Error("Enter a valid Fastmail JMAP API token.");
  }

  const session = await fetchSession(trimmedToken);
  const accountId = session.primaryAccounts[MAIL_CAPABILITY];
  const encryptedToken = await encryptSecret(trimmedToken, `${userEmail}:fastmail`);
  const now = new Date().toISOString();

  await getDb()
    .prepare(
      `INSERT INTO connections
        (user_email, username, account_id, api_url, encrypted_token, connected_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_email) DO UPDATE SET
        username = excluded.username,
        account_id = excluded.account_id,
        api_url = excluded.api_url,
        encrypted_token = excluded.encrypted_token,
        connected_at = excluded.connected_at`,
    )
    .bind(
      userEmail,
      session.username,
      accountId,
      session.apiUrl,
      encryptedToken,
      now,
    )
    .run();

  return { username: session.username };
}

export async function disconnectFastmail(userEmail: string): Promise<void> {
  const db = getDb();
  await db.batch([
    db.prepare("DELETE FROM activity_events WHERE user_email = ?").bind(userEmail),
    db.prepare("DELETE FROM actions WHERE user_email = ?").bind(userEmail),
    db.prepare("DELETE FROM messages WHERE user_email = ?").bind(userEmail),
    db.prepare("DELETE FROM subscriptions WHERE user_email = ?").bind(userEmail),
    db.prepare("DELETE FROM connections WHERE user_email = ?").bind(userEmail),
  ]);
}

export async function scanInbox(
  userEmail: string,
): Promise<{ inboxMessages: number; subscriptions: number }> {
  const db = getDb();
  const connection = await db
    .prepare(
      "SELECT encrypted_token, account_id, api_url FROM connections WHERE user_email = ?",
    )
    .bind(userEmail)
    .first<ConnectionRow>();

  if (!connection) throw new Error("Connect Fastmail before scanning.");
  const token = await decryptSecret(
    connection.encrypted_token,
    `${userEmail}:fastmail`,
  );

  const mailboxResult = await jmapCall<{ list: Mailbox[] }>(
    connection.api_url,
    token,
    connection.account_id,
    "Mailbox/get",
    { ids: null, properties: ["id", "role"] },
  );
  const inbox = mailboxResult.list.find((mailbox) => mailbox.role === "inbox");
  if (!inbox) throw new Error("Fastmail did not return an Inbox mailbox.");

  const groups = new Map<string, CandidateGroup>();
  const candidateMessages: ScannedMessage[] = [];
  let position = 0;
  let inboxMessages = 0;
  let total = Number.POSITIVE_INFINITY;

  while (position < total) {
    const page = await jmapQueryEmailPage(
      connection.api_url,
      token,
      connection.account_id,
      inbox.id,
      position,
    );

    total = page.total;
    if (page.ids.length === 0) break;
    inboxMessages += page.ids.length;

    for (const email of page.emails) {
      const candidate = classifyEmail(email);
      if (candidate) {
        mergeCandidate(groups, candidate);
        candidateMessages.push({
          candidateKey: candidate.key,
          jmapEmailId: email.id,
          messageId: email.messageId?.[0] ?? null,
          senderAddress: candidate.senderAddress,
          subject: email.subject,
          receivedAt: email.receivedAt,
        });
      }
    }
    position += page.ids.length;
  }

  await db
    .prepare("UPDATE subscriptions SET inbox_count = 0 WHERE user_email = ?")
    .bind(userEmail)
    .run();
  await db.prepare("DELETE FROM messages WHERE user_email = ?").bind(userEmail).run();

  const now = new Date().toISOString();
  const subscriptionRecords: Record<string, unknown>[] = [];
  for (const candidate of groups.values()) {
    const id = await stableId(`${userEmail}:${candidate.key}`);
    const encryptedTarget = candidate.target
      ? await encryptSecret(
          candidate.target,
          `${userEmail}:unsubscribe:${id}`,
        )
      : null;

    subscriptionRecords.push({
      id,
      key: candidate.key,
      displayName: candidate.displayName,
      senderAddress: candidate.senderAddress,
      senderDomain: candidate.senderDomain,
      listId: candidate.listId,
      encryptedTarget,
      method: candidate.method,
      oneClick: candidate.oneClick ? 1 : 0,
      fastmailRecognized: candidate.fastmailRecognized ? 1 : 0,
      confidence: candidate.confidence,
      reasonsJson: JSON.stringify(candidate.reasons),
      inboxCount: candidate.inboxCount,
      latestSubject: candidate.latestSubject,
      latestReceivedAt: candidate.latestReceivedAt,
      latestMessageId: candidate.latestMessageId,
    });
  }

  const messageRecords: Record<string, unknown>[] = [];
  for (const message of candidateMessages) {
    const subscriptionId = await stableId(`${userEmail}:${message.candidateKey}`);
    const messageId = await stableId(`${userEmail}:message:${message.jmapEmailId}`);
    messageRecords.push({
      id: messageId,
      subscriptionId,
      jmapEmailId: message.jmapEmailId,
      messageId: message.messageId,
      senderAddress: message.senderAddress,
      subject: message.subject,
      receivedAt: message.receivedAt,
    });
  }

  for (const records of chunksOf(subscriptionRecords, DB_WRITE_CHUNK_SIZE)) {
    await db
      .prepare(
        `INSERT INTO subscriptions (
          id, user_email, subscription_key, display_name, sender_address,
          sender_domain, list_id, encrypted_unsubscribe_target,
          unsubscribe_method, one_click, fastmail_recognized, confidence,
          reasons_json, inbox_count, latest_subject, latest_received_at,
          latest_message_id, status, created_at, updated_at
        )
        SELECT
          json_extract(value, '$.id'), ?, json_extract(value, '$.key'),
          json_extract(value, '$.displayName'), json_extract(value, '$.senderAddress'),
          json_extract(value, '$.senderDomain'), json_extract(value, '$.listId'),
          json_extract(value, '$.encryptedTarget'), json_extract(value, '$.method'),
          json_extract(value, '$.oneClick'), json_extract(value, '$.fastmailRecognized'),
          json_extract(value, '$.confidence'), json_extract(value, '$.reasonsJson'),
          json_extract(value, '$.inboxCount'), json_extract(value, '$.latestSubject'),
          json_extract(value, '$.latestReceivedAt'), json_extract(value, '$.latestMessageId'),
          'new', ?, ?
        FROM json_each(?) WHERE true
        ON CONFLICT(user_email, subscription_key) DO UPDATE SET
          display_name = excluded.display_name,
          sender_address = excluded.sender_address,
          sender_domain = excluded.sender_domain,
          list_id = excluded.list_id,
          encrypted_unsubscribe_target = excluded.encrypted_unsubscribe_target,
          unsubscribe_method = excluded.unsubscribe_method,
          one_click = excluded.one_click,
          fastmail_recognized = excluded.fastmail_recognized,
          confidence = excluded.confidence,
          reasons_json = excluded.reasons_json,
          inbox_count = excluded.inbox_count,
          latest_subject = excluded.latest_subject,
          latest_received_at = excluded.latest_received_at,
          latest_message_id = excluded.latest_message_id,
          updated_at = excluded.updated_at`,
      )
      .bind(userEmail, now, now, JSON.stringify(records))
      .run();
  }

  for (const records of chunksOf(messageRecords, DB_WRITE_CHUNK_SIZE)) {
    await db
      .prepare(
        `INSERT INTO messages (
          id, user_email, subscription_id, jmap_email_id, message_id,
          sender_address, subject, received_at, created_at, updated_at
        )
        SELECT
          json_extract(value, '$.id'), ?, json_extract(value, '$.subscriptionId'),
          json_extract(value, '$.jmapEmailId'), json_extract(value, '$.messageId'),
          json_extract(value, '$.senderAddress'), json_extract(value, '$.subject'),
          json_extract(value, '$.receivedAt'), ?, ?
        FROM json_each(?)`,
      )
      .bind(userEmail, now, now, JSON.stringify(records))
      .run();
  }

  await db
    .prepare(
      `UPDATE connections
       SET last_scanned_at = ?, last_scan_count = ?
       WHERE user_email = ?`,
    )
    .bind(now, inboxMessages, userEmail)
    .run();

  return { inboxMessages, subscriptions: groups.size };
}

export async function moveMessagesToTrash(
  userEmail: string,
  selection: { subscriptionIds?: string[]; messageIds?: string[] },
  correlationId?: string,
): Promise<TrashResult[]> {
  const subscriptionIds = [...new Set(selection.subscriptionIds ?? [])];
  const messageIds = [...new Set(selection.messageIds ?? [])];
  if (subscriptionIds.length === 0 && messageIds.length === 0) return [];

  const db = getDb();
  const connection = await db
    .prepare(
      "SELECT encrypted_token, account_id, api_url FROM connections WHERE user_email = ?",
    )
    .bind(userEmail)
    .first<ConnectionRow>();

  if (!connection) throw new Error("Connect Fastmail before moving messages.");

  const selectors: string[] = [];
  const selectorValues: string[] = [];
  if (subscriptionIds.length > 0) {
    selectors.push(
      `m.subscription_id IN (${subscriptionIds.map(() => "?").join(",")})`,
    );
    selectorValues.push(...subscriptionIds);
  }
  if (messageIds.length > 0) {
    selectors.push(`m.id IN (${messageIds.map(() => "?").join(",")})`);
    selectorValues.push(...messageIds);
  }

  const messageRows = await db
    .prepare(
      `SELECT m.id, m.subscription_id, m.jmap_email_id, s.display_name
       FROM messages m
       JOIN subscriptions s ON s.id = m.subscription_id
       WHERE m.user_email = ? AND (${selectors.join(" OR ")})`,
    )
    .bind(userEmail, ...selectorValues)
    .all<StoredTrashMessageRow>();

  if (messageRows.results.length === 0) return [];

  const token = await decryptSecret(
    connection.encrypted_token,
    `${userEmail}:fastmail`,
  );
  const mailboxResult = await jmapCall<{ list: Mailbox[] }>(
    connection.api_url,
    token,
    connection.account_id,
    "Mailbox/get",
    { ids: null, properties: ["id", "role"] },
  );
  const trash = mailboxResult.list.find((mailbox) => mailbox.role === "trash");
  if (!trash) {
    throw new Error("Fastmail did not return a Trash mailbox.");
  }

  const allEmailIds = [...new Set(messageRows.results.map((row) => row.jmap_email_id))];
  const failedEmailIds = new Set<string>();

  for (let index = 0; index < allEmailIds.length; index += 100) {
    const batch = allEmailIds.slice(index, index + 100);
    const update = Object.fromEntries(
      batch.map((emailId) => [
        emailId,
        { mailboxIds: { [trash.id]: true } },
      ]),
    );
    const response = await jmapCall<{
      updated?: Record<string, null> | null;
      notUpdated?: Record<string, { type: string; description?: string }> | null;
    }>(
      connection.api_url,
      token,
      connection.account_id,
      "Email/set",
      { update },
    );
    for (const emailId of Object.keys(response.notUpdated ?? {})) {
      failedEmailIds.add(emailId);
    }
  }

  const rowsBySubscription = new Map<string, StoredTrashMessageRow[]>();
  for (const row of messageRows.results) {
    const rows = rowsBySubscription.get(row.subscription_id) ?? [];
    rows.push(row);
    rowsBySubscription.set(row.subscription_id, rows);
  }

  const movedMessageIdsBySubscription = new Map<string, string[]>();
  const results = [...rowsBySubscription.entries()].map(
    ([subscriptionId, rows]): TrashResult => {
      const movedRows = rows.filter(
        (row) => !failedEmailIds.has(row.jmap_email_id),
      );
      const movedCount = movedRows.length;
      const failedCount = rows.length - movedCount;
      movedMessageIdsBySubscription.set(
        subscriptionId,
        movedRows.map((row) => row.id),
      );

      if (movedCount === 0) {
        return {
          subscriptionId,
          sender: rows[0].display_name,
          movedCount: 0,
          status: "failed",
          detail: `Fastmail could not move ${failedCount} matching message${failedCount === 1 ? "" : "s"} to Trash.`,
        };
      }
      return {
        subscriptionId,
        sender: rows[0].display_name,
        movedCount,
        status: failedCount > 0 ? "failed" : "moved",
        detail:
          failedCount > 0
            ? `Moved ${movedCount} message${movedCount === 1 ? "" : "s"} to Trash; ${failedCount} failed.`
            : `Moved ${movedCount} Inbox message${movedCount === 1 ? "" : "s"} to Trash.`,
      };
    },
  );

  await recordTrashResults(
    userEmail,
    results,
    movedMessageIdsBySubscription,
    correlationId,
  );
  return results;
}
