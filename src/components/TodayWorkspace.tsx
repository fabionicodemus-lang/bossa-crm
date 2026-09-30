"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  MessageCircle,
  Sparkles,
  ListFilter,
} from "lucide-react";
import type { LeadTask, UserContext } from "@/lib/types";
import {
  brazilDay,
  brazilStart,
  DAY,
  elapsed,
  isOpenTask,
  isOverdueTask,
  lastInteraction,
  locationOf,
  type TodayData,
  type TodayLead,
} from "@/lib/hoje-model";
import { stageLabel } from "@/lib/stages";
import { initials } from "@/lib/format";
import { taskAction, taskTypes, useCrmUI, WorkspaceActions } from "./CrmUI";
type TaskGroup = "overdue" | "today" | "upcoming" | "no-due" | "completed";
type Kind = "cliente" | "corretor" | "all";
type Alert = {
  lead: TodayLead;
  label: string;
  detail: string;
  tone: "red" | "orange" | "muted";
  action: "contact" | "task";
};
export function TodayWorkspace({
  initialData,
  context,
}: {
  initialData: TodayData;
  context: UserContext;
}) {
  const ui = useCrmUI();
  const [data, setData] = useState(initialData);
  const [kind, setKind] = useState<Kind>("cliente");
  const [mine, setMine] = useState(context.role !== "admin");
  const [compact, setCompact] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [completedOpen, setCompletedOpen] = useState(false);
  const [taskFilter, setTaskFilter] = useState("all");
  const [clock, setClock] = useState(Date.parse(initialData.now));
  const inFlight = useRef(false);
  const mounted = useRef(true);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const r = await fetch("/api/hoje");
      if (!r.ok)
        throw new Error(
          "Não foi possível atualizar. Os dados exibidos são da última consulta.",
        );
      const p = await r.json();
      if (mounted.current) {
        setData(p);
        setClock(Date.parse(p.now));
        setError("");
      }
    } catch (cause) {
      if (mounted.current)
        setError(
          cause instanceof Error ? cause.message : "Falha ao atualizar.",
        );
    } finally {
      inFlight.current = false;
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => void refresh(), 15 * 60 * 1000);
    const clockTimer = setInterval(() => setClock(Date.now()), 60000);
    const changed = () => void refresh();
    window.addEventListener("crm:data-changed", changed);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      clearInterval(clockTimer);
      window.removeEventListener("crm:data-changed", changed);
    };
  }, [refresh]);
  const [visibleLimits, setVisibleLimits] = useState<Record<string, number>>(
    {},
  );
  function countFor(group: TaskGroup | "aiToday", selectedKind: Kind = kind) {
    const scope = data.taskCounts[mine ? "mine" : "team"];
    return selectedKind === "all"
      ? scope.cliente[group] + scope.corretor[group] + scope.geral[group]
      : scope[selectedKind][group];
  }
  async function more(group: TaskGroup) {
    setBusy(`more:${group}`);
    try {
      const offset = visibleLimits[group] || 50;
      const kinds = kind === "all" ? ["cliente", "corretor", "geral"] : [kind];
      const results = await Promise.all(
        kinds.map(async (k) => {
          const r = await fetch(
            `/api/hoje/tasks?kind=${k}&group=${group}&scope=${mine ? "mine" : "team"}&offset=${offset}`,
          );
          const p = await r.json();
          if (!r.ok) throw new Error(p.error);
          return p.tasks as LeadTask[];
        }),
      );
      setData((current) => {
        const map = new Map(current.tasks.map((t) => [t.id, t]));
        for (const task of results.flat()) map.set(task.id, task);
        return { ...current, tasks: [...map.values()] };
      });
      setVisibleLimits((current) => ({ ...current, [group]: offset + 50 }));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível carregar.",
      );
    } finally {
      setBusy(null);
    }
  }
  const start = brazilStart(clock ? new Date(clock) : data.now);
  const end = start + DAY;
  const nextWeek = end + 7 * DAY;
  const day = brazilDay(new Date(clock));
  const leadMap = useMemo(
    () => new Map(data.leads.map((l) => [l.id, l])),
    [data.leads],
  );
  const members = useMemo(
    () => new Map(data.members.map((m) => [m.user_id, m])),
    [data.members],
  );
  const leads = data.leads.filter(
    (l) =>
      (kind === "all" || l.kind === kind) &&
      (!mine || l.owner_id === context.userId),
  );
  const leadIds = new Set(leads.map((l) => l.id));
  // Tarefas minhas podem estar vinculadas a um lead da IA ou de outro responsável.
  const tasks = data.tasks.filter((t) => {
    const lead = leadMap.get(t.lead_id);
    return (
      lead &&
      (kind === "all" || lead.kind === kind) &&
      (!mine || t.assigned_to === context.userId)
    );
  });
  const open = tasks.filter(isOpenTask);
  const overdue = open.filter((t) => isOverdueTask(t, clock));
  const today = open.filter(
    (t) =>
      !isOverdueTask(t, clock) &&
      t.due_at &&
      Date.parse(t.due_at) >= start &&
      Date.parse(t.due_at) < end,
  );
  const upcoming = open.filter(
    (t) =>
      !isOverdueTask(t, clock) &&
      t.due_at &&
      Date.parse(t.due_at) >= end &&
      Date.parse(t.due_at) < nextWeek,
  );
  const noDue = open.filter((t) => !t.due_at && !isOverdueTask(t, clock));
  const completed = tasks.filter(
    (t) =>
      t.status === "completed" &&
      t.completed_at &&
      brazilDay(t.completed_at) === day,
  );
  const handoffs = leads.filter((l) => l.stage === "passagem_pendente");
  const unanswered = leads.filter(
    (l) =>
      l.last_outbound_at &&
      (!l.last_inbound_at ||
        Date.parse(l.last_outbound_at) > Date.parse(l.last_inbound_at)) &&
      clock - Date.parse(l.last_outbound_at) >= 2 * DAY,
  );
  const stalled = leads.filter(
    (l) =>
      l.stage === "proposta_negociacao" &&
      clock - lastInteraction(l) >= 7 * DAY,
  );
  const openProposals = data.proposals.filter(
    (p) =>
      p.lead_id &&
      leadIds.has(p.lead_id) &&
      ["rascunho", "enviada"].includes(p.status) &&
      !["convertida", "recusada", "expirada"].includes(
        String(p.snapshot?.workflow_status),
      ),
  );
  const brokerSales = data.proposals.filter(
    (p) =>
      p.lead_id &&
      leadIds.has(p.lead_id) &&
      p.snapshot?.origin === "corretor" &&
      p.snapshot?.workflow_status === "convertida",
  );
  const alerts: Alert[] = leads
    .flatMap<Alert>((lead) => {
      if (["encerrado", "fechado_ganho"].includes(lead.stage) || lead.opt_out)
        return [];
      const task = data.tasks.find(
        (t) => t.lead_id === lead.id && isOpenTask(t),
      );
      const last = lastInteraction(lead);
      if (!lead.last_outbound_at)
        return [
          {
            lead,
            label:
              lead.kind === "corretor"
                ? "Sem boas-vindas"
                : "Sem primeiro contato",
            detail: "Novo contato aguardando atendimento",
            tone: "red" as const,
            action: "contact" as const,
          },
        ];
      if (unanswered.some((l) => l.id === lead.id))
        return [
          {
            lead,
            label: `Sem resposta há ${elapsed(Date.parse(lead.last_outbound_at), clock)}`,
            detail: "A última mensagem foi enviada pela equipe",
            tone: "orange" as const,
            action: "contact" as const,
          },
        ];
      const proposal = data.proposals.find(
        (p) =>
          p.lead_id === lead.id &&
          p.status === "enviada" &&
          clock - Date.parse(p.updated_at) >= 3 * DAY,
      );
      if (proposal)
        return [
          {
            lead,
            label: "Proposta aguardando retorno",
            detail: `Enviada há ${elapsed(Date.parse(proposal.updated_at), clock)}`,
            tone: "orange" as const,
            action: "contact" as const,
          },
        ];
      if (!task && !lead.next_action)
        return [
          {
            lead,
            label: "Sem próxima atividade",
            detail:
              lead.kind === "corretor"
                ? "Agende o próximo contato com o parceiro"
                : "Agende a continuidade do atendimento",
            tone: "orange" as const,
            action: "task" as const,
          },
        ];
      if (last && clock - last >= 7 * DAY)
        return [
          {
            lead,
            label: "Negociação sem interação",
            detail: `${stageLabel(lead.kind, lead.stage)} · ${elapsed(last, clock)}`,
            tone: "muted" as const,
            action: "contact" as const,
          },
        ];
      if (task?.type === "followup" || task?.type === "follow_up")
        return [
          {
            lead,
            label: "Aguardando follow-up",
            detail: task.title,
            tone: "muted" as const,
            action: "task" as const,
          },
        ];
      return [];
    })
    .sort(
      (a, b) =>
        ({ red: 0, orange: 1, muted: 2 })[a.tone] -
        { red: 0, orange: 1, muted: 2 }[b.tone],
    );
  const kpis = [
    {
      label: kind === "corretor" ? "Corretores novos" : "Leads novos hoje",
      value: leads.filter((l) => brazilDay(l.created_at) === day).length,
      color: "var(--blue)",
      filter: "all",
    },
    {
      label: "Atrasadas",
      value: countFor("overdue"),
      color: "var(--red)",
      filter: "overdue",
    },
    {
      label: "Para hoje",
      value: countFor("today"),
      color: "var(--ink)",
      filter: "today",
    },
    {
      label: "Sem resposta",
      value: unanswered.length,
      color: "var(--orange)",
      filter: "all",
    },
    {
      label:
        kind === "corretor"
          ? "Clientes indicados no mês"
          : "Negociações paradas",
      value: kind === "corretor" ? "—" : stalled.length,
      color: "var(--ink-2)",
      filter: "all",
      hint:
        kind === "corretor"
          ? "O cadastro atual não possui vínculo estruturado de indicação entre corretor e cliente."
          : "Sem interação há pelo menos 7 dias",
    },
    {
      label:
        kind === "corretor" ? "Vendas via corretor" : "Propostas abertas (R$)",
      value:
        kind === "corretor"
          ? brokerSales.length
          : new Intl.NumberFormat("pt-BR", {
              notation: "compact",
              maximumFractionDigits: 1,
            }).format(
              openProposals.reduce(
                (s, p) => s + Number(p.proposed_price || 0),
                0,
              ),
            ),
      color: "var(--ink)",
      filter: "all",
    },
  ];
  const persona =
    kind === "corretor"
      ? "Plantão"
      : kind === "all"
        ? "Nara e Plantão"
        : "Nara";
  async function act(task: LeadTask, action: "complete" | "reopen") {
    setBusy(task.id);
    try {
      const updated = await taskAction(task, action);
      setData((d) => ({
        ...d,
        tasks: d.tasks.map((t) => (t.id === task.id ? updated : t)),
      }));
      const lead = leadMap.get(task.lead_id);
      ui.notify({
        message:
          action === "complete" ? "Tarefa concluída." : "Tarefa reaberta.",
        undo: async () => {
          await taskAction(task, action === "complete" ? "reopen" : "complete");
          await refresh();
        },
        next:
          action === "complete" && lead && lead.kind !== "geral"
            ? () =>
                ui.openTask({
                  ...lead,
                  kind: lead.kind as "cliente" | "corretor",
                })
            : undefined,
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível salvar.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function assume(lead: TodayLead) {
    setBusy(lead.id);
    try {
      const r = await fetch(`/api/leads/${lead.id}/handoff`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "accept" }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error);
      ui.notify({ message: "Atendimento assumido. A IA está em silêncio." });
      await refresh();
      ui.openLead(lead.id, "whatsapp");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Não foi possível assumir.",
      );
    } finally {
      setBusy(null);
    }
  }
  function row(task: LeadTask) {
    const lead = leadMap.get(task.lead_id)!;
    const overdue = isOverdueTask(task, clock);
    const responsible =
      members.get(task.assigned_to || "")?.full_name ||
      (task.assigned_mode === "ai"
        ? lead.kind === "corretor"
          ? "Plantão"
          : "Nara"
        : "Sem responsável");
    const last = lastInteraction(lead);
    const type =
      taskTypes.find((t) => t.id === task.type) ||
      taskTypes.find((t) => t.id === "followup")!;
    const Icon = type.icon;
    return (
      <div className="agenda-row" key={task.id}>
        <div className="task-icon" title={type.label}>
          <Icon size={15} strokeWidth={1.7} />
        </div>
        <div className={`task-time ${overdue ? "text-red" : ""}`}>
          <strong>
            {task.due_at
              ? new Intl.DateTimeFormat("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(task.due_at))
              : "—"}
          </strong>
          <span>
            {overdue && task.due_at
              ? `há ${elapsed(Date.parse(task.due_at), clock)}`
              : task.due_at
                ? brazilDay(task.due_at) === day
                  ? "Hoje"
                  : new Intl.DateTimeFormat("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                      day: "2-digit",
                      month: "short",
                    }).format(new Date(task.due_at))
                : "Sem prazo"}
          </span>
        </div>
        <button
          type="button"
          className="task-description"
          onClick={() => ui.openLead(lead.id)}
        >
          <div>
            <strong>{task.title}</strong>
            {lead.kind === "corretor" && (
              <span className="chip neutral">Corretor</span>
            )}
            {(task.created_by_kind === "ai" || task.assigned_mode === "ai") && (
              <span className="chip">
                <Sparkles size={10} />
                {lead.kind === "corretor" ? "Plantão" : "Nara"}
              </span>
            )}
          </div>
          <span>
            {lead.name} ·{" "}
            {lead.kind === "corretor"
              ? lead.company || "Autônomo"
              : lead.enterprise || "Empreendimento não informado"}
            {locationOf(lead) ? ` · ${locationOf(lead)}` : ""}
          </span>
        </button>
        <div className="task-row-actions">
          <div className="task-assignee" title={responsible}>
            <span>{initials(responsible)}</span>
            {responsible.split(" ")[0]}
          </div>
          <div
            className={
              last && clock - last >= 2 * DAY ? "text-orange" : "faint"
            }
            title="Tempo desde a última interação"
          >
            <Clock3 size={12} />
            {last ? elapsed(last, clock) : "—"}
          </div>
          <button
            type="button"
            className="icon-button"
            title="WhatsApp"
            aria-label={`WhatsApp de ${lead.name}`}
            onClick={() => ui.openLead(lead.id, "whatsapp")}
          >
            <MessageCircle size={14} />
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => ui.openLead(lead.id)}
          >
            Abrir lead
          </button>
          {context.role !== "viewer" && (
            <button
              className="btn btn-ghost btn-sm complete-button"
              disabled={busy === task.id}
              onClick={() =>
                void act(
                  task,
                  task.status === "completed" ? "reopen" : "complete",
                )
              }
            >
              <Check size={13} />
              {task.status === "completed" ? "Reabrir" : "Concluir"}
            </button>
          )}
        </div>
      </div>
    );
  }
  const groups = [
    {
      id: "overdue",
      title: "Atrasadas",
      hint: "Precisam de ação",
      rows: overdue,
    },
    { id: "today", title: "Hoje", hint: "Ordenadas por horário", rows: today },
    {
      id: "upcoming",
      title: "Próximas",
      hint: "Próximos 7 dias",
      rows: upcoming,
    },
    ...(noDue.length
      ? [
          {
            id: "no-due",
            title: "Sem prazo",
            hint: "Atividades pendentes",
            rows: noDue,
          },
        ]
      : []),
  ];
  const hour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Sao_Paulo",
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date(clock)),
  );
  return (
    <>
      <header className="topbar today-topbar">
        <h1>Hoje</h1>
        <WorkspaceActions />
      </header>
      <div className={`today-content ${compact ? "compact" : ""}`}>
        <div className="today-date">
          {new Intl.DateTimeFormat("pt-BR", {
            timeZone: "America/Sao_Paulo",
            weekday: "long",
            day: "numeric",
            month: "long",
          }).format(new Date(clock))}
        </div>
        <h1 className="greeting">
          {hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite"},{" "}
          {context.fullName.split(" ")[0]}
        </h1>
        <p className="today-summary">
          <strong className="text-red">
            {countFor("overdue")} tarefas atrasadas
          </strong>{" "}
          e {countFor("today")} para hoje. {persona} tem{" "}
          <strong>{handoffs.length} conversas</strong> para a equipe.
        </p>
        {error && (
          <div className="error-box" role="alert">
            {error}
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => void refresh()}
            >
              Tentar novamente
            </button>
          </div>
        )}
        <div className="kind-tabs" role="tablist" aria-label="Tipo de contato">
          {(
            [
              { id: "cliente", label: "Clientes diretos" },
              { id: "corretor", label: "Corretores" },
              { id: "all", label: "Tudo" },
            ] as const
          ).map((k) => {
            const count = countFor("overdue", k.id) + countFor("today", k.id);
            return (
              <button
                role="tab"
                aria-selected={kind === k.id}
                className={kind === k.id ? "on" : ""}
                key={k.id}
                onClick={() => {
                  setKind(k.id);
                  setVisibleLimits({});
                  setTaskFilter("all");
                }}
              >
                {k.label}
                <span>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="today-kpis">
          {kpis.map((k) => (
            <button
              type="button"
              key={k.label}
              title={k.hint}
              onClick={() => setTaskFilter(k.filter)}
            >
              <span>
                <i style={{ background: k.color }} />
                {k.label}
              </span>
              <strong style={{ color: k.color }}>{k.value}</strong>
            </button>
          ))}
        </div>
        <div className="today-columns">
          <section className="agenda-workspace">
            <div className="agenda-heading">
              <h2>Agenda</h2>
              <div className="segmented">
                {context.role === "admin" && (
                  <button
                    className={!mine ? "on" : ""}
                    onClick={() => {
                      setMine(false);
                      setVisibleLimits({});
                    }}
                  >
                    Equipe
                  </button>
                )}
                <button
                  className={mine ? "on" : ""}
                  onClick={() => {
                    setMine(true);
                    setVisibleLimits({});
                  }}
                >
                  Minhas
                </button>
              </div>
              <button
                className="icon-button"
                title="Alternar densidade"
                onClick={() => setCompact((v) => !v)}
              >
                <ListFilter size={14} />
              </button>
              <Link href="/tarefas">Abrir em Tarefas</Link>
            </div>
            {taskFilter !== "all" && (
              <div className="filter-notice">
                Filtro: {taskFilter === "overdue" ? "Atrasadas" : "Para hoje"}
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setTaskFilter("all")}
                >
                  Ver todas
                </button>
              </div>
            )}
            {groups
              .filter((g) => taskFilter === "all" || g.id === taskFilter)
              .map((g) => (
                <section
                  className={`agenda-group ${g.id === "overdue" ? "overdue" : ""}`}
                  key={g.id}
                >
                  <header>
                    <i />
                    <h3>{g.title}</h3>
                    <span>{countFor(g.id as TaskGroup)}</span>
                    <small>{g.hint}</small>
                  </header>
                  {g.rows.length ? (
                    [...g.rows]
                      .sort(
                        (a, b) =>
                          Date.parse(a.due_at || "9999-01-01") -
                          Date.parse(b.due_at || "9999-01-01"),
                      )
                      .slice(0, visibleLimits[g.id] || 50)
                      .map(row)
                  ) : (
                    <div className="agenda-empty">
                      {g.id === "overdue"
                        ? "Nenhuma tarefa atrasada."
                        : g.id === "today"
                          ? "Nada agendado para hoje."
                          : "Nada agendado nos próximos 7 dias."}
                    </div>
                  )}
                  {countFor(g.id as TaskGroup) >
                    (visibleLimits[g.id] || 50) && (
                    <button
                      className="btn btn-ghost btn-sm load-more-tasks"
                      disabled={busy === `more:${g.id}`}
                      onClick={() => void more(g.id as TaskGroup)}
                    >
                      Carregar mais tarefas
                    </button>
                  )}
                </section>
              ))}
            <section className="agenda-group completed">
              <button
                type="button"
                className="completed-heading"
                aria-expanded={completedOpen}
                onClick={() => setCompletedOpen((v) => !v)}
              >
                <Check size={14} />
                Concluídas hoje <span>{countFor("completed")}</span>
              </button>
              {completedOpen &&
                (completed.length ? (
                  completed.map(row)
                ) : (
                  <div className="agenda-empty">
                    Nenhuma tarefa concluída hoje.
                  </div>
                ))}
            </section>
            <Link className="calendar-link" href="/agenda">
              <CalendarDays size={14} />
              Reuniões, visitas e calendário sincronizado
            </Link>
          </section>
          <aside className="today-aside">
            <section className="attention">
              <div className="aside-heading">
                <h2>Precisam de atenção</h2>
                <span>{alerts.length}</span>
              </div>
              {alerts.length ? (
                alerts.slice(0, 8).map((a) => (
                  <div key={a.lead.id} className={`attention-row ${a.tone}`}>
                    <div>
                      <small>{a.label}</small>
                      <button onClick={() => ui.openLead(a.lead.id)}>
                        {a.lead.name}
                      </button>
                      <p>{a.detail}</p>
                    </div>
                    <button
                      className="icon-button"
                      title={
                        a.action === "task" ? "Criar tarefa" : "Abrir conversa"
                      }
                      onClick={() =>
                        a.action === "task" && a.lead.kind !== "geral"
                          ? ui.openTask({
                              ...a.lead,
                              kind: a.lead.kind as "cliente" | "corretor",
                            })
                          : ui.openLead(a.lead.id, "whatsapp")
                      }
                    >
                      {a.action === "task" ? (
                        <Clock3 size={14} />
                      ) : (
                        <MessageCircle size={14} />
                      )}
                    </button>
                  </div>
                ))
              ) : (
                <div className="agenda-empty">Nenhum alerta neste recorte.</div>
              )}
              {alerts.length > 8 && (
                <Link className="aside-more" href="/leads">
                  Ver todos os leads
                </Link>
              )}
            </section>
            <section className="nara-panel">
              <div className="aside-heading">
                <h2>
                  <Sparkles size={15} />
                  {persona}
                </h2>
                <Link href="/ia">Ver conversas</Link>
              </div>
              <div className="nara-stats">
                {[
                  {
                    label: "Atendendo agora",
                    value: leads.filter(
                      (l) =>
                        l.owner_mode === "ai" &&
                        l.ai_enabled &&
                        !l.automation_paused &&
                        !l.opt_out,
                    ).length,
                  },
                  {
                    label: "Aguardando cliente",
                    value: leads.filter(
                      (l) =>
                        l.owner_mode === "ai" &&
                        l.last_outbound_at &&
                        (!l.last_inbound_at ||
                          Date.parse(l.last_outbound_at) >
                            Date.parse(l.last_inbound_at)),
                    ).length,
                  },
                  {
                    label: "Tarefas criadas hoje",
                    value: countFor("aiToday"),
                  },
                  {
                    label: "Mensagens automáticas",
                    value: leads.reduce(
                      (s, l) => s + (data.automaticMessages[l.id] || 0),
                      0,
                    ),
                  },
                ].map((stat) => (
                  <div key={stat.label}>
                    <strong>{stat.value}</strong>
                    <span>{stat.label}</span>
                  </div>
                ))}
              </div>
              <h3>
                Passagens para a equipe <span>{handoffs.length}</span>
              </h3>
              {handoffs.length ? (
                handoffs.slice(0, 8).map((l) => (
                  <div className="handoff-row" key={l.id}>
                    <div>
                      <button
                        className="plain-name"
                        onClick={() => ui.openLead(l.id)}
                      >
                        {l.name}
                      </button>
                      <p>
                        {l.next_action ||
                          l.enterprise ||
                          l.company ||
                          "Atendimento aguardando aceite"}
                      </p>
                    </div>
                    {context.role !== "viewer" && (
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={busy === l.id}
                        onClick={() => void assume(l)}
                      >
                        Assumir
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <div className="agenda-empty">Nenhuma passagem pendente.</div>
              )}
            </section>
          </aside>
        </div>
      </div>
    </>
  );
}
