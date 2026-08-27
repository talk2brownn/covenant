import type { ReactNode } from "react";

type Props = {
  title: string;
  layer?: string;
  accent?: "blue" | "violet" | "teal" | "dynamic";
  index?: number;
  children: ReactNode;
};

export function Card({ title, layer, accent = "blue", index = 0, children }: Props) {
  return (
    <section className={`card card-accent-${accent}`} style={{ animationDelay: `${index * 70}ms` }}>
      <div className="card-head">
        {layer && <span className="card-eyebrow">{layer}</span>}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}
