"use client";
import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  X,
  Maximize2,
  Search,
  Plus,
  Phone,
  MessageCircle,
  Video,
  Home,
  FileText,
  Send,
  RotateCcw,
  Circle,
  Bell,
  ArrowRightLeft,
  CheckSquare,
} from "lucide-react";
import dynamic from "next/dynamic";
const LeadDetail = dynamic(
  () => import("./LeadDetail").then((module) => module.LeadDetail),
  { loading: () => <div className="empty-state">Carregando ficha…</div> },
);
import type {
  Activity,
  Lead,
  LeadTask,
  Message,
  TeamMember,
  UserContext,
} from "@/lib/types";
import { brazilDay } from "@/lib/hoje-model";
export const taskTypes = [
  { id: "ligacao", label: "Ligação", icon: Phone },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { id: "reuniao", label: "Reunião", icon: Video },
  { id: "visita", label: "Visita", icon: Home },
  { id: "proposta", label: "Enviar proposta", icon: FileText },
  { id: "material", label: "Enviar material", icon: Send },
  { id: "followup", label: "Follow-up", icon: RotateCcw },
  { id: "outro", label: "Outro", icon: Circle },
];
type SearchLead = {
  id: string;
  name: string;
  kind: "cliente" | "corretor" | "geral";
  enterprise?: string | null;
  company?: string | null;
  owner_id?: string | null;
};
type DetailPayload = {
  lead: Lead;
  messages: Message[];
  activities: Activity[];
  tasks: LeadTask[];
  teamMembers: TeamMember[];
  whatsappConnected: boolean;
  canEdit: boolean;
};
type Toast = { message: string; undo?: () => Promise<void>; next?: () => void };
type UI = {
  theme: "light" | "dark";
  toggleTheme: () => void;
  openLead: (
    id: string,
    tab?: "dados" | "whatsapp" | "tarefas" | "historico",
  ) => void;
  openTask: (lead?: SearchLead) => void;
  openSearch: () => void;
  notify: (toast: Toast) => void;
  context: UserContext;
};
const UIContext = createContext<UI | null>(null);
export function useCrmUI() {
  const value = useContext(UIContext);
  if (!value) throw new Error("CrmUI ausente.");
  return value;
}
export async function taskAction(
  task: Pick<LeadTask, "id" | "lead_id">,
  action: "complete" | "cancel" | "reopen",
) {
  const response = await fetch(`/api/leads/${task.lead_id}/tasks`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskId: task.id, action }),
  });
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Não foi possível atualizar a tarefa.");
  window.dispatchEvent(new Event("crm:data-changed"));
  return data.task as LeadTask;
}
async function searchLeads(
  query: string,
  signal: AbortSignal,
): Promise<SearchLead[]> {
  const rows = await Promise.all(
    ["cliente", "corretor", "geral"].map(async (kind) => {
      const res = await fetch(
        `/api/leads/search?kind=${kind}&q=${encodeURIComponent(query)}`,
        { signal },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Não foi possível buscar.");
      return data.leads as SearchLead[];
    }),
  );
  return rows.flat();
}
function LeadSearch({
  onPick,
  autoFocus = true,
}: {
  onPick: (lead: SearchLead) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SearchLead[]>([]);
  const [notice, setNotice] = useState("Digite pelo menos 2 caracteres.");
  useEffect(() => {
    if (query.trim().length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      searchLeads(query, controller.signal)
        .then((results) => {
          setRows(results);
          setNotice(results.length ? "" : "Nenhum lead encontrado.");
        })
        .catch((cause) => {
          if (!controller.signal.aborted) setNotice(cause.message);
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return (
    <div className="lead-search">
      <label className="search-field">
        <Search size={16} />
        <input
          autoFocus={autoFocus}
          aria-label="Buscar lead"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setRows([]);
            setNotice(
              e.target.value.trim().length < 2
                ? "Digite pelo menos 2 caracteres."
                : "Buscando…",
            );
          }}
          placeholder="Buscar nome, telefone ou empreendimento…"
        />
      </label>
      <div className="search-results">
        {rows.map((lead) => (
          <button key={lead.id} type="button" onClick={() => onPick(lead)}>
            <strong>{lead.name}</strong>
            <span>
              {lead.kind === "corretor"
                ? "Corretor · " + (lead.company || "Autônomo")
                : lead.enterprise ||
                  (lead.kind === "geral" ? "Contato geral" : "Cliente")}
            </span>
          </button>
        ))}
        {notice && <p className="faint">{notice}</p>}
      </div>
    </div>
  );
}
function Modal({
  children,
  title,
  onClose,
  className = "",
}: {
  children: ReactNode;
  title: string;
  onClose: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`crm-modal ${className}`}
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={17} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function TaskModal({
  initialLead,
  onClose,
  context,
  notify,
}: {
  initialLead?: SearchLead;
  onClose: () => void;
  context: UserContext;
  notify: (toast: Toast) => void;
}) {
  const router = useRouter();
  const [lead, setLead] = useState(initialLead);
  const [type, setType] = useState("ligacao");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState(brazilDay(new Date()));
  const [time, setTime] = useState("09:00");
  const [assignedTo, setAssignedTo] = useState(context.userId);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!lead) return;
    const controller = new AbortController();
    fetch(`/api/leads/${lead.id}/detail`, { signal: controller.signal })
      .then((r) => r.json())
      .then((p: DetailPayload & { error?: string }) => {
        if (p.error) throw new Error(p.error);
        setMembers(p.teamMembers.filter((m) => m.role !== "viewer"));
        setAssignedTo(
          context.role === "admin"
            ? p.lead.owner_id || context.userId
            : context.userId,
        );
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => controller.abort();
  }, [lead, context.role, context.userId]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!lead || busy) return;
    setBusy(true);
    setError("");
    try {
      const dueAt = new Date(`${date}T${time}:00-03:00`).toISOString();
      const response = await fetch(`/api/leads/${lead.id}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, type, dueAt, assignedTo }),
      });
      const p = await response.json();
      if (!response.ok)
        throw new Error(p.error || "Não foi possível criar a tarefa.");
      window.dispatchEvent(new Event("crm:data-changed"));
      router.refresh();
      notify({
        message: "Tarefa criada.",
        undo: async () => {
          await taskAction(p.task, "cancel");
        },
      });
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a tarefa.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title="Nova tarefa" onClose={onClose}>
      <form className="modal-body" onSubmit={submit}>
        <div className="task-type-chips">
          {taskTypes.map((item) => (
            <button
              type="button"
              key={item.id}
              className={type === item.id ? "on" : ""}
              onClick={() => setType(item.id)}
            >
              <item.icon size={14} />
              {item.label}
            </button>
          ))}
        </div>
        <div className="field">
          <label htmlFor="task-title">Título</label>
          <input
            autoFocus={Boolean(lead)}
            id="task-title"
            className="input"
            required
            maxLength={180}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex.: Ligar para Juliana"
          />
        </div>
        <div className="field">
          <label>Lead</label>
          {lead ? (
            <div className="selected-lead">
              <strong>{lead.name}</strong>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setLead(undefined)}
              >
                Trocar
              </button>
            </div>
          ) : (
            <LeadSearch onPick={setLead} />
          )}
        </div>
        <div className="date-shortcuts">
          {[0, 1].map((offset) => (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              key={offset}
              onClick={() =>
                setDate(brazilDay(new Date(Date.now() + offset * 86400000)))
              }
            >
              {offset ? "Amanhã" : "Hoje"}
            </button>
          ))}
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="task-date">Data (Brasília)</label>
            <input
              id="task-date"
              className="input"
              type="date"
              required
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="task-time">Horário</label>
            <input
              id="task-time"
              className="input"
              type="time"
              required
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="task-owner">Responsável</label>
          <select
            id="task-owner"
            className="select"
            value={assignedTo}
            disabled={context.role !== "admin"}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            {members.length ? (
              members.map((m) => (
                <option value={m.user_id} key={m.user_id}>
                  {m.full_name}
                </option>
              ))
            ) : (
              <option value={context.userId}>{context.fullName}</option>
            )}
          </select>
        </div>
        {error && (
          <div role="alert" className="error-box">
            {error}
          </div>
        )}
        <footer className="modal-actions">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button className="btn btn-primary" disabled={!lead || busy}>
            {busy ? "Criando…" : "Criar tarefa"}
          </button>
        </footer>
      </form>
    </Modal>
  );
}
function LeadDrawer({
  id,
  tab,
  onClose,
}: {
  id: string;
  tab: "dados" | "whatsapp" | "tarefas" | "historico";
  onClose: () => void;
}) {
  const [data, setData] = useState<DetailPayload | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/leads/${id}/detail`, { signal: controller.signal })
      .then(async (r) => {
        const p = await r.json();
        if (!r.ok) throw new Error(p.error);
        return p;
      })
      .then(setData)
      .catch((cause) => {
        if (!controller.signal.aborted) setError(cause.message);
      });
    return () => {
      controller.abort();
      window.dispatchEvent(new Event("crm:data-changed"));
    };
  }, [id]);
  return (
    <Modal
      title={data ? `Leads / ${data.lead.name}` : "Leads"}
      onClose={onClose}
      className="lead-drawer"
    >
      <div className="drawer-full-link">
        <Link
          className="icon-button"
          href={`/leads/${id}`}
          title="Abrir em página inteira"
          onClick={onClose}
        >
          <Maximize2 size={15} />
        </Link>
      </div>
      <div className="drawer-body">
        {error ? (
          <div className="error-box" role="alert">
            {error}
          </div>
        ) : data ? (
          <LeadDetail
            initialLead={data.lead}
            initialMessages={data.messages}
            initialActivities={data.activities}
            initialTasks={data.tasks}
            teamMembers={data.teamMembers}
            whatsappConnected={data.whatsappConnected}
            canEdit={data.canEdit}
            initialTab={tab}
            drawerMode
          />
        ) : (
          <div className="empty-state">Carregando ficha…</div>
        )}
      </div>
    </Modal>
  );
}
export function CrmUI({
  children,
  context,
}: {
  children: ReactNode;
  context: UserContext;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [drawer, setDrawer] = useState<{
    id: string;
    tab: "dados" | "whatsapp" | "tarefas" | "historico";
  } | null>(null);
  const [task, setTask] = useState<{ lead?: SearchLead } | null>(null);
  const [search, setSearch] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notify = useCallback((value: Toast) => {
    setToast(value);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 6000);
  }, []);
  useEffect(() => {
    try {
      const stored = localStorage.getItem("bossa:theme");
      const next = stored === "dark" ? "dark" : "light";
      document.documentElement.dataset.theme = next;
      const timer = setTimeout(() => setTheme(next), 0);
      return () => clearTimeout(timer);
    } catch {}
  }, []);
  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );
  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("bossa:theme", next);
    } catch {}
  }
  useEffect(() => {
    function key(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (
        target.closest('input,textarea,select,[contenteditable="true"]') ||
        document.querySelector("dialog[open]")
      )
        return;
      if (
        event.key.toLowerCase() === "n" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        context.role !== "viewer"
      ) {
        event.preventDefault();
        setTask({});
      }
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setSearch(true);
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [context.role]);
  // Intercepta somente cliques simples em fichas. Abrir em nova aba continua funcionando.
  useEffect(() => {
    function click(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey ||
        document.querySelector("dialog[open]")
      )
        return;
      const anchor = (event.target as HTMLElement).closest(
        "a[href]",
      ) as HTMLAnchorElement | null;
      if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href);
      if (url.origin !== location.origin) return;
      const match = url.pathname.match(/^\/leads\/([^/]+)$/);
      if (match) {
        event.preventDefault();
        setDrawer({ id: match[1], tab: "dados" });
      }
    }
    document.addEventListener("click", click);
    return () => document.removeEventListener("click", click);
  }, [pathname]);
  const value: UI = {
    theme,
    toggleTheme,
    context,
    openLead: (id, tab = "dados") => {
      setSearch(false);
      setDrawer({ id, tab });
    },
    openTask: (lead) => {
      if (context.role !== "viewer") setTask({ lead });
    },
    openSearch: () => setSearch(true),
    notify,
  };
  return (
    <UIContext.Provider value={value}>
      {children}
      {drawer && (
        <LeadDrawer
          key={drawer.id}
          {...drawer}
          onClose={() => setDrawer(null)}
        />
      )}{" "}
      {task && (
        <TaskModal
          initialLead={task.lead}
          context={context}
          notify={notify}
          onClose={() => setTask(null)}
        />
      )}{" "}
      {search && (
        <Modal title="Buscar no CRM" onClose={() => setSearch(false)}>
          <div className="modal-body">
            <LeadSearch onPick={(lead) => value.openLead(lead.id)} />
          </div>
        </Modal>
      )}
      {toast && (
        <div className="crm-toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              disabled={undoBusy}
              onClick={async () => {
                setUndoBusy(true);
                try {
                  await toast.undo?.();
                  setToast(null);
                  router.refresh();
                } catch (cause) {
                  notify({
                    message:
                      cause instanceof Error
                        ? cause.message
                        : "Não foi possível desfazer.",
                  });
                } finally {
                  setUndoBusy(false);
                }
              }}
            >
              {undoBusy ? "Desfazendo…" : "Desfazer"}
            </button>
          )}
          {toast.next && (
            <button
              onClick={() => {
                toast.next?.();
                setToast(null);
              }}
            >
              Agendar próxima
            </button>
          )}
        </div>
      )}
    </UIContext.Provider>
  );
}

type UserNotification = {
  id: string;
  kind: "handoff" | "task";
  source: string;
  title: string;
  body: string | null;
  lead_id: string | null;
  handoff_id: string | null;
  task_id: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
};

const notificationDate = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function NotificationCenter() {
  const ui = useCrmUI();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<UserNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const response = await fetch("/api/notifications", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível carregar as notificações.");
      setItems((payload.notifications ?? []) as UserNotification[]);
      setError("");
    } catch (cause) {
      if (!quiet) setError(cause instanceof Error ? cause.message : "Não foi possível carregar as notificações.");
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = window.setTimeout(() => void load(true), 0);
    const timer = window.setInterval(() => void load(true), 15000);
    const refresh = () => void load(true);
    window.addEventListener("focus", refresh);
    window.addEventListener("crm:data-changed", refresh);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("crm:data-changed", refresh);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const refresh = window.setTimeout(() => void load(), 0);
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => {
      window.clearTimeout(refresh);
      document.removeEventListener("mousedown", close);
    };
  }, [open, load]);

  async function accept(item: UserNotification) {
    if (busyId) return;
    setBusyId(item.id);
    setError("");
    try {
      const action = String(item.metadata?.action ?? "");
      if (action === "accept_handoff") {
        if (!item.lead_id) throw new Error("A passagem não está vinculada a um lead.");
        const response = await fetch(`/api/leads/${item.lead_id}/handoff`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "accept" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Não foi possível aceitar a passagem.");
      } else {
        const response = await fetch("/api/notifications", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: item.id, action: "accept" }),
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || "Não foi possível aceitar a notificação.");
      }

      setItems((current) => current.filter((notification) => notification.id !== item.id));
      window.dispatchEvent(new Event("crm:data-changed"));
      router.refresh();
      ui.notify({
        message: item.kind === "task" ? "Tarefa aceita." : "Passagem aceita.",
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível aceitar.");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="notification-center" ref={ref}>
      <button
        type="button"
        className={`notification-bell ${items.length ? "has-items" : ""}`}
        aria-label={`Notificações${items.length ? `: ${items.length} pendente(s)` : ""}`}
        title="Notificações"
        onClick={() => setOpen((value) => !value)}
      >
        <Bell size={16} />
        {items.length > 0 && (
          <span className="notification-count">{items.length > 99 ? "99+" : items.length}</span>
        )}
      </button>

      {open && (
        <div className="notification-panel">
          <div className="notification-panel-head">
            <div>
              <strong>Notificações</strong>
              <span>{items.length ? `${items.length} pendente${items.length === 1 ? "" : "s"}` : "Tudo em dia"}</span>
            </div>
            <button className="icon-button" type="button" aria-label="Fechar notificações" onClick={() => setOpen(false)}>
              <X size={15} />
            </button>
          </div>

          {error && <div className="notification-error">{error}</div>}
          {loading && !items.length ? (
            <div className="notification-empty">Carregando…</div>
          ) : !items.length ? (
            <div className="notification-empty">
              <Bell size={22} />
              <strong>Nenhuma notificação pendente</strong>
              <span>Passagens e tarefas atribuídas a você aparecerão aqui.</span>
            </div>
          ) : (
            <div className="notification-list">
              {items.map((item) => {
                const action = String(item.metadata?.action ?? "");
                const handoff = item.kind === "handoff";
                return (
                  <article className="notification-item" key={item.id}>
                    <div className={`notification-kind ${handoff ? "handoff" : "task"}`}>
                      {handoff ? <ArrowRightLeft size={15} /> : <CheckSquare size={15} />}
                    </div>
                    <div className="notification-copy">
                      <div className="notification-title-row">
                        <strong>{item.title}</strong>
                        <time>{notificationDate.format(new Date(item.created_at))}</time>
                      </div>
                      {item.body && <p>{item.body}</p>}
                      <div className="notification-source">
                        {item.source === "nara"
                          ? "Nara"
                          : item.source === "plantao"
                            ? "Plantão"
                            : item.source === "usuario"
                              ? "Usuário"
                              : "Sistema"}
                      </div>
                      <div className="notification-actions">
                        {item.lead_id && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            onClick={() => {
                              ui.openLead(item.lead_id!, item.kind === "task" ? "tarefas" : "dados");
                              setOpen(false);
                            }}
                          >
                            Abrir lead
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={busyId === item.id}
                          onClick={() => void accept(item)}
                        >
                          {busyId === item.id
                            ? "Aceitando…"
                            : item.kind === "task"
                              ? "Aceitar tarefa"
                              : action === "acknowledge_transfer"
                                ? "Aceitar passagem"
                                : "Aceitar passagem"}
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkspaceActions() {
  const ui = useCrmUI();
  return (
    <div className="page-actions">
      <NotificationCenter />
      <button className="global-search" type="button" onClick={ui.openSearch}>
        <Search size={14} />
        <span>Buscar lead, telefone…</span>
        <kbd>⌘K</kbd>
      </button>
      {ui.context.role !== "viewer" && (
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => ui.openTask()}
        >
          <Plus size={14} />
          Nova tarefa <kbd>N</kbd>
        </button>
      )}
    </div>
  );
}
