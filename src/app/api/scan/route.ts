import { apiError, requireUserEmail } from "@/lib/auth";
import { scanInbox } from "@/lib/fastmail";
import { completeActivity, startActivity } from "@/lib/repository";

export async function POST(request: Request) {
  let userEmail: string | null = null;
  let activityId: string | null = null;
  try {
    userEmail = await requireUserEmail(request);
    activityId = await startActivity({
      userEmail,
      eventType: "scan",
      subject: "Inbox scan",
      detail: "Scanning Inbox headers and metadata.",
    });
    const startedAt = Date.now();
    const result = await scanInbox(userEmail);
    await completeActivity(activityId, userEmail, {
      status: "completed",
      detail: `Scanned ${result.inboxMessages} Inbox message${result.inboxMessages === 1 ? "" : "s"} and found ${result.subscriptions} subscription${result.subscriptions === 1 ? "" : "s"}.`,
      metadata: { ...result, durationMs: Date.now() - startedAt },
    });
    return Response.json(result);
  } catch (error) {
    if (userEmail && activityId) {
      await completeActivity(activityId, userEmail, {
        status: "failed",
        detail: error instanceof Error ? error.message : "Inbox scan failed.",
      }).catch(() => undefined);
    }
    return apiError(error);
  }
}
