import { useEffect, useState } from "react";
import { isAddress, type Address } from "viem";
import "./App.css";
import { ConnectWallet } from "./components/ConnectWallet";
import { AgentSelector } from "./components/AgentSelector";
import { MandateCard } from "./components/MandateCard";
import { AutonomyMeter } from "./components/AutonomyMeter";
import { PaymentPanel } from "./components/PaymentPanel";
import { AuditTrail } from "./components/AuditTrail";
import { PipelineStrip } from "./components/PipelineStrip";
import { CIRCLE_AGENTS, DEMO_AGENT } from "./lib/demoData";

// URL parameters make a specific demo one link: ?agent=0x...&signer=circle&live=1
const params = new URLSearchParams(window.location.search);
const agentParam = params.get("agent");
const urlAgent = agentParam && isAddress(agentParam) ? agentParam : undefined;
const urlSaysCircle = params.get("signer") === "circle" ? urlAgent?.toLowerCase() : undefined;

function App() {
  // Defaults to the seeded demo agent so a cold visitor (e.g. a grant reviewer) sees a live
  // mandate immediately instead of an empty "enter an address" prompt. Still fully editable.
  const [agent, setAgent] = useState<Address | undefined>(urlAgent ?? DEMO_AGENT);

  const agentIsCircle =
    !!agent &&
    (CIRCLE_AGENTS.some((a) => a.toLowerCase() === agent.toLowerCase()) || agent.toLowerCase() === urlSaysCircle);

  // Bumped after this browser's own writes (payment settled, freeze/restore confirmed) so
  // dependent cards refetch immediately. Public testnet RPCs rate-limit aggressively, so the
  // dashboard deliberately favors "refresh when something actually happened" over continuous
  // background polling — see docs/build-notes.md.
  const [activityTick, setActivityTick] = useState(0);
  const bumpActivity = () => setActivityTick((t) => t + 1);

  // Opt-in polling for presenting: when payments are made from a terminal (the Circle wallet
  // signs server-side, so this browser sees none of them), the dashboard has to go look. Off by
  // default so an audience opening the public link doesn't multiply RPC load.
  const [live, setLive] = useState(params.get("live") === "1");
  useEffect(() => {
    if (!live) return;
    const tick = () => {
      if (document.visibilityState === "visible") setActivityTick((t) => t + 1);
    };
    const id = setInterval(tick, 10_000);
    // Browsers report a window as hidden while it's fully covered (e.g. by a maximized terminal),
    // which pauses the interval above — catch up immediately when the presenter switches back
    // instead of waiting out the rest of a 10-second tick.
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [live]);

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Covenant</h1>
          <p className="tagline">Autonomy needs boundaries. Boundaries need borders.</p>
        </div>
        <ConnectWallet />
      </header>

      <PipelineStrip />

      <AgentSelector agent={agent} onChange={setAgent} />

      <div className="live-row">
        <button className="btn-ghost" onClick={() => setLive((v) => !v)} aria-pressed={live}>
          <span className={`live-dot ${live ? "live-dot-on" : ""}`} />
          Live updates: {live ? "on" : "off"}
        </button>
        <span className="hint">
          {live
            ? "Refreshing every 10 seconds — payments made from a terminal show up here."
            : "Turn on to watch payments made outside this browser appear as they land."}
        </span>
      </div>

      {agent ? (
        <div className="dashboard-grid">
          <MandateCard agent={agent} refreshOn={activityTick} agentIsCircle={agentIsCircle} />
          <AutonomyMeter agent={agent} onActivity={bumpActivity} refreshOn={activityTick} />
          <PaymentPanel agent={agent} onSettled={bumpActivity} agentIsCircle={agentIsCircle} />
          <AuditTrail agent={agent} refreshOn={activityTick} />
        </div>
      ) : (
        <p className="hint">Enter an agent address above to view its mandate.</p>
      )}
    </div>
  );
}

export default App;
