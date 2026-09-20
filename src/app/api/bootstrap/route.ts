import { apiError, requireUserEmail } from "@/lib/auth";
import { getBootstrap } from "@/lib/repository";

export async function GET(request: Request) {
  try {
    const data = await getBootstrap(await requireUserEmail(request));
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return apiError(error);
  }
}
