"use client";
import { useEffect } from "react";
import { rastrear } from "@/lib/rastreio";
export function VerEmpreendimento({ slug, estagio }: { slug: string; estagio: string }) {
  useEffect(() => { rastrear("view_project", { empreendimento: slug, estagio }); }, [slug, estagio]);
  return null;
}
