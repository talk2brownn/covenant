import { initiateDeveloperControlledWalletsClient } from "@circle-fin/developer-controlled-wallets";
import { requireEnv } from "./config.js";

export function getCircleClient() {
  return initiateDeveloperControlledWalletsClient({
    apiKey: requireEnv("CIRCLE_API_KEY"),
    entitySecret: requireEnv("CIRCLE_ENTITY_SECRET"),
  });
}
