import type { CSSProperties } from "react";

const STEPS = ["Mandate", "Policy", "Router", "Vault", "Settlement", "Explainability", "Kill-Switch"];

export function PipelineStrip() {
  return (
    <div className="pipeline-strip" aria-hidden="true">
      {STEPS.map((step, i) => (
        <div className="pipeline-step" key={step} style={{ "--i": i } as CSSProperties}>
          <span className="pipeline-dot" />
          <span>{step}</span>
          {i < STEPS.length - 1 && <span className="pipeline-connector" />}
        </div>
      ))}
    </div>
  );
}
