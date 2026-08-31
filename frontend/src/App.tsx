import { useState } from "react";
import type { Address } from "viem";
import "./App.css";
import { ConnectWallet } from "./components/ConnectWallet";
import { AgentSelector } from "./components/AgentSelector";
import { MandateCard } from "./components/MandateCard";
import { AutonomyMeter } from "./components/AutonomyMeter";
import { PaymentPanel } from "./components/PaymentPanel";
import { AuditTrail } from "./components/AuditTrail";
import { PipelineStrip } from "./components/PipelineStrip";
import { DEMO_AGENT } from "./lib/demoData";

function App() {
  // Defaults to the seeded demo agent so a cold visitor (e.g. a grant reviewer) sees a live
  // mandate immediately instead of an empty "enter an address" prompt. Still fully editable.
  const [agent, setAgent] = useState<Address | undefined>(DEMO_AGENT);

  // Bumped after this browser's own writes (payment settled, freeze/restore confirmed) so
  // dependent cards refetch immediately. Public testnet RPCs rate-limit aggressively, so the
  // dashboard deliberately favors "refresh when something actually happened" over continuous
  // background polling — see docs/build-notes.md.
  const [activityTick, setActivityTick] = useState(0);
  const bumpActivity = () => setActivityTick((t) => t + 1);

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

      {agent ? (
        <div className="dashboard-grid">
          <MandateCard agent={agent} refreshOn={activityTick} />
          <AutonomyMeter agent={agent} onActivity={bumpActivity} />
          <PaymentPanel agent={agent} onSettled={bumpActivity} />
          <AuditTrail agent={agent} refreshOn={activityTick} />
        </div>
      ) : (
        <p className="hint">Enter an agent address above to view its mandate.</p>
      )}
    </div>
  );
}

export default App;
