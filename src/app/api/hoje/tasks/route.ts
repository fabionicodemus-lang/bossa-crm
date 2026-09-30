import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { readTaskGroup, taskGroups, type TaskGroup } from "@/lib/hoje-tasks";
import type { LeadKind } from "@/lib/types";
export async function GET(request: Request) {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context)
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const kind = p.get("kind") as LeadKind;
  const group = p.get("group") as TaskGroup;
  const offset = Number(p.get("offset") || 0);
  if (
    !["cliente", "corretor", "geral"].includes(kind) ||
    !taskGroups.includes(group) ||
    !Number.isInteger(offset) ||
    offset < 0
  )
    return NextResponse.json({ error: "Filtro inválido." }, { status: 400 });
  try {
    return NextResponse.json(
      await readTaskGroup(
        context,
        kind,
        group,
        p.get("scope") === "mine",
        offset,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Não foi possível carregar mais tarefas." },
      { status: 500 },
    );
  }
}
