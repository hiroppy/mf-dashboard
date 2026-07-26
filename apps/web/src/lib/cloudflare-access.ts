import { createRemoteJWKSet, jwtVerify } from "jose";

let cachedTeamDomain: string | null = null;
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | null = null;

function getTeamDomain(): string | null {
  const configuredDomain = process.env.CLOUDFLARE_ACCESS_TEAM_DOMAIN?.trim();
  if (!configuredDomain) return null;

  try {
    const domain = new URL(
      configuredDomain.startsWith("https://") ? configuredDomain : `https://${configuredDomain}`,
    );
    if (domain.protocol !== "https:" || domain.pathname !== "/" || domain.search || domain.hash) {
      return null;
    }
    return domain.origin;
  } catch {
    return null;
  }
}

function getJwks(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedTeamDomain !== teamDomain || !cachedJwks) {
    cachedTeamDomain = teamDomain;
    cachedJwks = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
  }
  return cachedJwks;
}

export async function hasValidCloudflareAccess(request: Request): Promise<boolean> {
  if (process.env.DEMO_MODE === "true") return true;

  const teamDomain = getTeamDomain();
  const audience = process.env.CLOUDFLARE_ACCESS_AUD?.trim();
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!teamDomain || !audience || !token) return false;

  try {
    await jwtVerify(token, getJwks(teamDomain), {
      audience,
      issuer: teamDomain,
    });
    return true;
  } catch {
    return false;
  }
}
