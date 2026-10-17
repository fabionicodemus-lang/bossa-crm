"use client";
import { rastrear } from "@/lib/rastreio";

export function Perguntas({ itens }: { itens: { p: string; r: string }[] }) {
  return (
    <div className="faq">
      {itens.map((q) => (
        <details key={q.p} onToggle={(e) => { if ((e.currentTarget as HTMLDetailsElement).open) rastrear("faq_open", { pergunta: q.p }); }}>
          <summary>{q.p}</summary>
          <p>{q.r}</p>
        </details>
      ))}
    </div>
  );
}
