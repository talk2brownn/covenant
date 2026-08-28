import { useState } from "react";
import { useReadContract, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { formatUnits, isAddress, keccak256, parseUnits, toBytes, type Address } from "viem";
import { abis, CHECK_LABELS } from "../lib/contracts";
import { getAddresses } from "../lib/addresses";
import { useActiveChainId } from "../lib/useActiveChainId";
import { Card } from "./Card";
import { CheckIcon, CrossIcon } from "./icons";

type Props = {
  agent: Address;
};

export function PaymentPanel({ agent }: Props) {
  const chainId = useActiveChainId();
  const addresses = getAddresses(chainId);

  const [counterparty, setCounterparty] = useState("");
  const [category, setCategory] = useState("saas");
  const [settlementToken, setSettlementToken] = useState("");
  const [amount, setAmount] = useState("");

  const { data: mandate } = useReadContract({
    chainId,
    address: addresses?.mandateRegistry,
    abi: abis.mandateRegistry,
    functionName: "getMandate",
    args: [agent],
    query: { enabled: !!addresses },
  });

  const { data: decimals } = useReadContract({
    chainId,
    address: mandate?.homeCurrency,
    abi: abis.erc20,
    functionName: "decimals",
    query: { enabled: !!mandate?.homeCurrency },
  });

  const categoryBytes32 = category ? keccak256(toBytes(category)) : undefined;
  const amountBaseUnits = amount && decimals !== undefined ? safeParseUnits(amount, decimals) : undefined;
  const counterpartyValid = isAddress(counterparty);
  const tokenValid = isAddress(settlementToken);

  const preflightArgs =
    addresses && counterpartyValid && tokenValid && categoryBytes32 && amountBaseUnits !== undefined
      ? ([agent, counterparty as Address, categoryBytes32, settlementToken as Address, amountBaseUnits] as const)
      : undefined;

  const { data: preflight, isFetching: preflightLoading } = useReadContract({
    chainId,
    address: addresses?.settlementRouter,
    abi: abis.settlementRouter,
    functionName: "preflight",
    args: preflightArgs,
    query: { enabled: !!preflightArgs },
  });

  const { data: allowance } = useReadContract({
    chainId,
    address: mandate?.homeCurrency,
    abi: abis.erc20,
    functionName: "allowance",
    args: agent && addresses ? [agent, addresses.settlementRouter] : undefined,
    query: { enabled: !!mandate?.homeCurrency && !!addresses },
  });

  const needsApproval = amountBaseUnits !== undefined && (allowance ?? 0n) < amountBaseUnits;

  const { writeContract: approve, isPending: approving } = useWriteContract();
  const {
    writeContract: submitPayment,
    data: txHash,
    isPending: submitting,
    reset: resetSubmission,
  } = useWriteContract();
  const { data: receipt, isLoading: waitingForReceipt } = useWaitForTransactionReceipt({ hash: txHash });

  const decision = preflight?.[0];
  const requiresFx = preflight?.[1] ?? false;
  const quote = preflight?.[2];
  const quotedSlippageBps = preflight?.[3];

  const canSend = !!decision?.approved && !needsApproval && !!addresses;

  return (
    <Card title="Send a Payment" layer="Layer 2–5" accent="ledger" index={2}>
      <div className="form-grid">
        <label>
          Counterparty
          <input placeholder="0x..." value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
        </label>
        <label>
          Category
          <input value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label>
          Settlement currency
          <input placeholder="0x... (token address)" value={settlementToken} onChange={(e) => setSettlementToken(e.target.value)} />
        </label>
        <label>
          Amount (in home currency)
          <input placeholder="0.00" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
      </div>

      {preflightLoading && <p className="hint">Checking mandate constraints...</p>}

      {decision && (
        <div className="explainability">
          <h3>Constraint checklist</h3>
          <ul className="checklist">
            {decision.checklist.map((check, i) => (
              <li key={i} className={check.passed ? "check-pass" : "check-fail"} style={{ animationDelay: `${i * 45}ms` }}>
                <span className="check-icon">{check.passed ? <CheckIcon /> : <CrossIcon />}</span>
                <span className="check-label">{CHECK_LABELS[i]}</span>
                <span className="check-detail">{check.detail}</span>
              </li>
            ))}
          </ul>

          {requiresFx && quote && (
            <div className="fx-summary">
              <strong>Cross-currency settlement</strong>
              <p>
                Quoted spread: {quotedSlippageBps !== undefined ? (quotedSlippageBps === 65535 ? "no quote available" : `${(quotedSlippageBps / 100).toFixed(2)}%`) : "-"}
              </p>
              <p>
                {formatUnits(quote.fromAmount, decimals ?? 6)} (home currency) &rarr; {formatUnits(quote.toAmount, decimals ?? 6)} settlement currency
              </p>
              <p className="hint">Atomic payment-vs-payment: both legs settle together or the transaction reverts. No counterparty exposure.</p>
            </div>
          )}

          <div
            className={`decision-banner decision-${decision.approved ? "approved" : "denied"}`}
          >
            {decision.approved ? "Approved — ready to settle" : "Denied — see failing checks above"}
          </div>
        </div>
      )}

      {needsApproval && mandate?.homeCurrency && (
        <button
          className="btn-secondary"
          disabled={approving}
          onClick={() =>
            approve({
              address: mandate.homeCurrency,
              abi: abis.erc20,
              functionName: "approve",
              args: [addresses!.settlementRouter, amountBaseUnits ?? 0n],
            })
          }
        >
          {approving ? "Approving..." : "Approve router to spend home currency"}
        </button>
      )}

      <button
        className="btn-primary"
        disabled={!canSend || submitting || waitingForReceipt}
        onClick={() => {
          resetSubmission();
          submitPayment({
            address: addresses!.settlementRouter,
            abi: abis.settlementRouter,
            functionName: "settlePayment",
            args: [agent, counterparty as Address, categoryBytes32!, settlementToken as Address, amountBaseUnits!],
          });
        }}
      >
        {submitting || waitingForReceipt ? "Settling..." : "Send Payment"}
      </button>

      {receipt && (
        <p className="hint">
          Settled in block {receipt.blockNumber.toString()}. Check the audit trail below for the final outcome.
        </p>
      )}
    </Card>
  );
}

function safeParseUnits(value: string, decimals: number): bigint | undefined {
  try {
    return parseUnits(value, decimals);
  } catch {
    return undefined;
  }
}
