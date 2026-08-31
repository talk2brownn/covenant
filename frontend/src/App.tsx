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
          <MandateCard agent={agent} />
          <AutonomyMeter agent={agent} />
          <PaymentPanel agent={agent} />
          <AuditTrail agent={agent} />
        </div>
      ) : (
        <p className="hint">Enter an agent address above to view its mandate.</p>
      )}
    </div>
  );
}

export default App;
