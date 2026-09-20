import { apiError, requireUserEmail } from "@/lib/auth";
import { setIgnored } from "@/lib/repository";

export async function POST(request: Request) {
  try {
    const userEmail = await requireUserEmail(request);
    const body = (await request.json()) as {
      subscriptionId?: unknown;
      ignored?: unknown;
    };
    if (typeof body.subscriptionId !== "string" || typeof body.ignored !== "boolean") {
      return Response.json({ error: "Invalid ignore request." }, { status: 400 });
    }

    await setIgnored(userEmail, body.subscriptionId, body.ignored);
    return Response.json({ updated: true });
  } catch (error) {
    return apiError(error);
  }
}
