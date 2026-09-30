import { getCurrentContext } from "@/lib/auth";
import { loadToday } from "@/lib/hoje-data";
import { TodayWorkspace } from "@/components/TodayWorkspace";
export default async function TodayPage() {
  const context = (await getCurrentContext())!;
  const data = await loadToday(context).catch(() => null);
  if (!data)
    return (
      <div className="page-content">
        <h1>Hoje</h1>
        <div className="error-box">
          Não foi possível carregar os dados. Atualize a página para tentar
          novamente.
        </div>
      </div>
    );
  return <TodayWorkspace initialData={data} context={context} />;
}
