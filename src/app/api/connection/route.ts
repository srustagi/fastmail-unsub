import { apiError, requireUserEmail } from "@/lib/auth";
import { connectFastmail, disconnectFastmail } from "@/lib/fastmail";
import { completeActivity, startActivity } from "@/lib/repository";

export async function POST(request: Request) {
  let userEmail: string | null = null;
  let activityId: string | null = null;
  try {
    userEmail = await requireUserEmail(request);
    const body = (await request.json()) as { token?: unknown };
    if (typeof body.token !== "string") {
      return Response.json({ error: "A Fastmail API token is required." }, { status: 400 });
    }

    activityId = await startActivity({
      userEmail,
      eventType: "connection",
      subject: "Fastmail connection",
      detail: "Testing Fastmail credentials.",
    });
    const connection = await connectFastmail(userEmail, body.token);
    await completeActivity(activityId, userEmail, {
      status: "connected",
      subject: connection.username,
      detail: `Connected to Fastmail as ${connection.username}.`,
    });
    return Response.json({ connection });
  } catch (error) {
    if (userEmail && activityId) {
      await completeActivity(activityId, userEmail, {
        status: "failed",
        detail: error instanceof Error ? error.message : "Fastmail connection failed.",
      }).catch(() => undefined);
    }
    return apiError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    await disconnectFastmail(await requireUserEmail(request));
    return Response.json({ disconnected: true });
  } catch (error) {
    return apiError(error);
  }
}
