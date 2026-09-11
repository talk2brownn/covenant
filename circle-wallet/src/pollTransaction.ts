import { getCircleClient } from "./circleClient.js";

// getTransaction's own waitForState option polls server-side until the transaction reaches
// (or passes) COMPLETE, or rejects immediately if it lands in a terminal failure state first
// (CANCELLED/DENIED/FAILED/STUCK) — confirmed from the installed SDK's own type declarations
// (node_modules/@circle-fin/developer-controlled-wallets), not the hand-rolled poll loop an
// earlier draft of this file used.
export async function waitForCompletion(id: string) {
  const client = getCircleClient();
  try {
    const response = await client.getTransaction({ id, waitForState: "COMPLETE" });
    return response.data?.transaction;
  } catch (err) {
    // waitForState rejects on a terminal failure state — fetch the transaction once more
    // (without waiting) so the caller can see exactly what state it actually landed in,
    // rather than just the rejection.
    const response = await client.getTransaction({ id });
    console.error("Transaction did not reach COMPLETE:", (err as Error).message ?? err);
    return response.data?.transaction;
  }
}
