import "@fontsource/ephesis/400.css";
import "@/styles/alma.css";
import type { Empreendimento } from "@/content/empreendimentos";
import { AlmaPagina } from "./AlmaPagina";

export function AlmaLanding({
  e,
  plantaInicial,
}: {
  e: Empreendimento;
  plantaInicial?: string;
}) {
  // Prévia e desenvolvimento mostram o mapa de produção; produção usa as alternativas públicas.
  const previa =
    process.env.VERCEL_ENV === "preview" ||
    (process.env.VERCEL_ENV !== "production" &&
      process.env.BOSSA_PUBLICADO !== "sim");
  return <AlmaPagina e={e} plantaInicial={plantaInicial} previa={previa} />;
}
