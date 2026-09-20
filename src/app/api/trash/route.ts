import { apiError, requireUserEmail } from "@/lib/auth";
import { moveMessagesToTrash } from "@/lib/fastmail";
import { completeActivity, startActivity } from "@/lib/repository";

const MAX_BATCH_SIZE = 50;

export async function POST(request: Request) {
  let userEmail: string | null = null;
  let batchId: string | null = null;
  try {
    userEmail = await requireUserEmail(request);
    const body = (await request.json()) as {
      subscriptionIds?: unknown;
      messageIds?: unknown;
      operationId?: unknown;
    };
    const subscriptionIds = Array.isArray(body.subscriptionIds)
      ? body.subscriptionIds
      : [];
    const messageIds = Array.isArray(body.messageIds) ? body.messageIds : [];
    if (
      subscriptionIds.length + messageIds.length === 0 ||
      subscriptionIds.length + messageIds.length > MAX_BATCH_SIZE ||
      subscriptionIds.some((id) => typeof id !== "string") ||
      messageIds.some((id) => typeof id !== "string")
    ) {
      return Response.json(
        { error: `Select between 1 and ${MAX_BATCH_SIZE} subscriptions.` },
        { status: 400 },
      );
    }

    const correlationId =
      typeof body.operationId === "string" && body.operationId.length <= 100
        ? body.operationId
        : crypto.randomUUID();
    batchId = await startActivity({
      userEmail,
      eventType: "trash_batch",
      subject: `${subscriptionIds.length + messageIds.length} selected item${subscriptionIds.length + messageIds.length === 1 ? "" : "s"}`,
      detail: "Moving selected Inbox mail to Trash.",
      correlationId,
      metadata: {
        subscriptionCount: subscriptionIds.length,
        messageCount: messageIds.length,
      },
    });
    const results = await moveMessagesToTrash(userEmail, {
      subscriptionIds: [...new Set(subscriptionIds as string[])],
      messageIds: [...new Set(messageIds as string[])],
    }, correlationId);
    const movedCount = results.reduce((sum, result) => sum + result.movedCount, 0);
    const failedCount = results.filter((result) => result.status === "failed").length;
    await completeActivity(batchId, userEmail, {
      status: results.length === 0 ? "no_messages" : failedCount > 0 ? "partial" : "completed",
      detail:
        results.length === 0
          ? "No matching Inbox messages remained to move."
          : `Moved ${movedCount} Inbox message${movedCount === 1 ? "" : "s"} to Trash.`,
      metadata: { movedCount, failedCount },
    });
    return Response.json({ results });
  } catch (error) {
    if (userEmail && batchId) {
      await completeActivity(batchId, userEmail, {
        status: "failed",
        detail: error instanceof Error ? error.message : "Could not move messages to Trash.",
      }).catch(() => undefined);
    }
    return apiError(error);
  }
}
