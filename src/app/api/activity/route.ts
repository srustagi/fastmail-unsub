import { apiError, requireUserEmail } from "@/lib/auth";
import { getActivityPage } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    const offsetValue = new URL(request.url).searchParams.get("offset");
    const offset = offsetValue ? Number.parseInt(offsetValue, 10) : 0;
    if (!Number.isFinite(offset) || offset < 0) {
      return Response.json({ error: "Invalid activity offset." }, { status: 400 });
    }
    return Response.json(await getActivityPage(await requireUserEmail(request), offset), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
