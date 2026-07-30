function isDubuVercelOrigin(origin) {
  try {
    const url = new URL(origin);
    return (
      url.protocol === "https:" &&
      url.hostname.endsWith(".vercel.app") &&
      url.hostname.startsWith("dubu-frontend")
    );
  } catch {
    return false;
  }
}

export function isAllowedOrigin(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin) || isDubuVercelOrigin(origin);
}

export function resolveCorsOrigin(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) return allowedOrigins[0] ?? "*";
  return isAllowedOrigin(origin, allowedOrigins) ? origin : "null";
}
