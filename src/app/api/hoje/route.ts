import { NextResponse } from "next/server";
import { getCurrentContext } from "@/lib/auth";
import { loadToday } from "@/lib/hoje-data";
export async function GET() {
  const context = await getCurrentContext({ redirectIfMissing: false });
  if (!context)
    return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });
  try {
    return NextResponse.json(await loadToday(context), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json(
      { error: "Não foi possível atualizar os dados de hoje." },
      { status: 500 },
    );
  }
}
