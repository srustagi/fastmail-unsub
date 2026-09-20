import { createRemoteJWKSet, jwtVerify } from "jose";
import { getEnv } from "@/lib/runtime";

let cachedKeySet:
  | {
      teamDomain: string;
      keySet: ReturnType<typeof createRemoteJWKSet>;
    }
  | undefined;

function accessKeySet(teamDomain: string) {
  if (cachedKeySet?.teamDomain !== teamDomain) {
    cachedKeySet = {
      teamDomain,
      keySet: createRemoteJWKSet(
        new URL("/cdn-cgi/access/certs", `${teamDomain}/`),
      ),
    };
  }

  return cachedKeySet.keySet;
}

export async function requireUserEmail(request: Request): Promise<string> {
  const requestUrl = new URL(request.url);
  const isLocal =
    requestUrl.hostname === "localhost" || requestUrl.hostname === "127.0.0.1";
  const appEnv = getEnv();
  const developmentEmail = appEnv.DEV_USER_EMAIL?.trim().toLowerCase();

  if (isLocal && developmentEmail) {
    return developmentEmail;
  }

  const teamDomainValue = appEnv.ACCESS_TEAM_DOMAIN?.trim();
  const audience = appEnv.ACCESS_AUD?.trim();
  const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim();

  if (!teamDomainValue || !audience || !token) {
    throw new Response("Cloudflare Access authentication is required.", {
      status: 401,
    });
  }

  try {
    const teamDomainUrl = new URL(teamDomainValue);
    if (
      teamDomainUrl.protocol !== "https:" ||
      teamDomainUrl.username ||
      teamDomainUrl.password ||
      !teamDomainUrl.hostname.endsWith(".cloudflareaccess.com") ||
      teamDomainUrl.pathname !== "/" ||
      teamDomainUrl.search ||
      teamDomainUrl.hash
    ) {
      throw new Error("Invalid Access team domain.");
    }

    const teamDomain = teamDomainUrl.origin;
    const { payload } = await jwtVerify(token, accessKeySet(teamDomain), {
      issuer: teamDomain,
      audience,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email.trim() : "";

    if (!email) {
      throw new Error("Access token does not contain an email address.");
    }

    return email.toLowerCase();
  } catch {
    throw new Response("Cloudflare Access authentication is required.", {
      status: 401,
    });
  }
}

export function apiError(error: unknown): Response {
  if (error instanceof Response) {
    return error;
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  return Response.json({ error: message }, { status: 500 });
}
