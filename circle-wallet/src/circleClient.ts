import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { requireEnv } from "./config.js";

export function getCircleClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: requireEnv("CIRCLE_API_KEY"),
    entitySecret: requireEnv("CIRCLE_ENTITY_SECRET"),
  });
}

// An uncaught SDK error crashes with the whole minified bundle as its stack trace (the SDK
// inlines axios, so Node prints the source around the throw site) — genuinely unreadable, hit
// live running the settle script. This pulls out just the useful part: an Axios-style response
// body if there is one, otherwise the plain message.
export function formatCircleError(err: unknown): string {
  const e = err as { response?: { data?: unknown }; message?: string };
  if (e?.response?.data) return JSON.stringify(e.response.data, null, 2);
  if (e?.message) return e.message;
  return String(err);
}
