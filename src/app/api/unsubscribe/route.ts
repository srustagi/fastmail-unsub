import { apiError, requireUserEmail } from "@/lib/auth";
import {
  completeActivity,
  getSubscriptionTargets,
  recordAction,
  startActivity,
} from "@/lib/repository";
import type { UnsubscribeResult } from "@/lib/types";
import { validateOneClickUrl } from "@/lib/url-safety";

const MAX_BATCH_SIZE = 50;

async function attemptOneClick(input: {
  userEmail: string;
  subscriptionId: string;
  sender: string;
  target: string;
  correlationId: string;
}): Promise<UnsubscribeResult> {
  try {
    const target = validateOneClickUrl(input.target);
    const response = await fetch(target, {
      method: "POST",
      redirect: "manual",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "text/plain, text/html;q=0.5, */*;q=0.1",
      },
      body: "List-Unsubscribe=One-Click",
      signal: AbortSignal.timeout(10_000),
    });

    if (response.status >= 200 && response.status < 300) {
      const detail = `The sender accepted the one-click request (${response.status}).`;
      await recordAction({
        userEmail: input.userEmail,
        subscriptionId: input.subscriptionId,
        method: "one_click",
        status: "request_accepted",
        responseStatus: response.status,
        detail,
        correlationId: input.correlationId,
      });
      return {
        subscriptionId: input.subscriptionId,
        sender: input.sender,
        status: "request_accepted",
        detail,
      };
    }

    const detail =
      response.status >= 300 && response.status < 400
        ? "The endpoint redirected, so it requires manual review."
        : `The endpoint returned HTTP ${response.status}.`;
    const status =
      response.status >= 300 && response.status < 400
        ? "manual_required"
        : "failed";
    await recordAction({
      userEmail: input.userEmail,
      subscriptionId: input.subscriptionId,
      method: "one_click",
      status,
      responseStatus: response.status,
      detail,
      correlationId: input.correlationId,
    });
    return {
      subscriptionId: input.subscriptionId,
      sender: input.sender,
      status,
      detail,
      manualUrl: input.target,
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unsubscribe request failed.";
    await recordAction({
      userEmail: input.userEmail,
      subscriptionId: input.subscriptionId,
      method: "one_click",
      status: "failed",
      detail,
      correlationId: input.correlationId,
    });
    return {
      subscriptionId: input.subscriptionId,
      sender: input.sender,
      status: "failed",
      detail,
    };
  }
}

export async function POST(request: Request) {
  let userEmail: string | null = null;
  let batchId: string | null = null;
  try {
    userEmail = await requireUserEmail(request);
    const body = (await request.json()) as {
      subscriptionIds?: unknown;
      operationId?: unknown;
    };
    if (
      !Array.isArray(body.subscriptionIds) ||
      body.subscriptionIds.length === 0 ||
      body.subscriptionIds.length > MAX_BATCH_SIZE ||
      body.subscriptionIds.some((id) => typeof id !== "string")
    ) {
      return Response.json(
        { error: `Select between 1 and ${MAX_BATCH_SIZE} subscriptions.` },
        { status: 400 },
      );
    }

    const uniqueIds = [...new Set(body.subscriptionIds as string[])];
    const correlationId =
      typeof body.operationId === "string" && body.operationId.length <= 100
        ? body.operationId
        : crypto.randomUUID();
    batchId = await startActivity({
      userEmail,
      eventType: "unsubscribe_batch",
      subject: `${uniqueIds.length} selected sender${uniqueIds.length === 1 ? "" : "s"}`,
      detail: "Processing unsubscribe selection.",
      correlationId,
      metadata: { requestedCount: uniqueIds.length },
    });
    const targets = await getSubscriptionTargets(userEmail, uniqueIds);
    const results: UnsubscribeResult[] = [];

    for (const target of targets) {
      if (target.method === "one_click" && target.target) {
        results.push(
          await attemptOneClick({
            userEmail,
            subscriptionId: target.id,
            sender: target.sender,
            target: target.target,
            correlationId,
          }),
        );
        continue;
      }

      const manualUrl = target.target ?? target.fastmailUrl ?? undefined;
      const detail =
        target.method === "web"
          ? "Open the sender's unsubscribe page to finish."
          : target.method === "mailto"
            ? "Open the prepared unsubscribe email to finish."
            : "Open the message in Fastmail and use its unsubscribe control.";
      await recordAction({
        userEmail,
        subscriptionId: target.id,
        method: target.method,
        status: "manual_required",
        detail,
        correlationId,
      });
      results.push({
        subscriptionId: target.id,
        sender: target.sender,
        status: "manual_required",
        detail,
        manualUrl,
      });
    }

    const failedCount = results.filter((result) => result.status === "failed").length;
    const missingCount = uniqueIds.length - targets.length;
    await completeActivity(batchId, userEmail, {
      status: failedCount > 0 || missingCount > 0 ? "partial" : "completed",
      detail: `Processed ${results.length} unsubscribe request${results.length === 1 ? "" : "s"}${missingCount > 0 ? `; ${missingCount} selection${missingCount === 1 ? " was" : "s were"} no longer available` : ""}.`,
      metadata: {
        requestedCount: uniqueIds.length,
        processedCount: results.length,
        failedCount,
        missingCount,
      },
    });

    return Response.json({ results });
  } catch (error) {
    if (userEmail && batchId) {
      await completeActivity(batchId, userEmail, {
        status: "failed",
        detail: error instanceof Error ? error.message : "Unsubscribe request failed.",
      }).catch(() => undefined);
    }
    return apiError(error);
  }
}
