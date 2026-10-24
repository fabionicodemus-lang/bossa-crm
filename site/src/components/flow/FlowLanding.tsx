import "@/styles/flow.css";
import type { Empreendimento } from "@/content/empreendimentos";
import { FlowPagina } from "./FlowPagina";
export function FlowLanding({ e, plantaInicial }: { e: Empreendimento; plantaInicial?: string }) {
  return <FlowPagina e={e} plantaInicial={plantaInicial} />;
}
