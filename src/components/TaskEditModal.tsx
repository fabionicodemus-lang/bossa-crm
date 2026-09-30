"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import type { LeadTask } from "@/lib/types";

type TaskMember = {
  user_id: string;
  full_name: string;
  email?: string;
};

function brazilDateTimeParts(value: string | null) {
  if (!value) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
  }
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

export function TaskEditModal({
  task,
  members,
  currentUserId,
  isAdmin,
  onClose,
  onSaved,
  onDeleted,
}: {
  task: LeadTask;
  members: TaskMember[];
  currentUserId: string;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: (task: LeadTask) => void;
  onDeleted: (taskId: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const initial = brazilDateTimeParts(task.due_at);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [date, setDate] = useState(initial.date);
  const [time, setTime] = useState(initial.time || "09:00");
  const [priority, setPriority] = useState(task.priority);
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const dueAt = new Date(`${date}T${time}:00-03:00`).toISOString();
      const response = await fetch(`/api/leads/${task.lead_id}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          action: "edit",
          title: title.trim(),
          description: description.trim(),
          dueAt,
          priority,
          assignedTo,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.task) {
        throw new Error(payload.error || "Não foi possível editar a tarefa.");
      }
      onSaved(payload.task as LeadTask);
      window.dispatchEvent(new Event("crm:data-changed"));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível editar a tarefa.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (busy) return;
    if (!window.confirm(`Excluir a tarefa “${task.title}”? Essa ação remove a tarefa definitivamente.`)) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/leads/${task.lead_id}/tasks`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Não foi possível excluir a tarefa.");
      onDeleted(task.id);
      window.dispatchEvent(new Event("crm:data-changed"));
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível excluir a tarefa.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="crm-modal"
      aria-label="Editar tarefa"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <header className="modal-head">
        <h2>Editar tarefa</h2>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Fechar">×</button>
      </header>
      <form className="modal-body" onSubmit={save}>
        <div className="field">
          <label htmlFor="edit-task-title">Título</label>
          <input
            id="edit-task-title"
            className="input"
            required
            maxLength={180}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="edit-task-date">Data (Brasília)</label>
            <input
              id="edit-task-date"
              className="input"
              type="date"
              required
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="edit-task-time">Horário</label>
            <input
              id="edit-task-time"
              className="input"
              type="time"
              required
              value={time}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label htmlFor="edit-task-description">Descrição</label>
          <textarea
            id="edit-task-description"
            className="textarea"
            maxLength={5000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
        <div className="grid grid-2">
          <div className="field">
            <label htmlFor="edit-task-priority">Prioridade</label>
            <select
              id="edit-task-priority"
              className="select"
              value={priority}
              onChange={(event) => setPriority(event.target.value as LeadTask["priority"])}
            >
              <option value="urgent">Urgente</option>
              <option value="high">Alta</option>
              <option value="normal">Normal</option>
              <option value="low">Baixa</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="edit-task-owner">Responsável</label>
            <select
              id="edit-task-owner"
              className="select"
              value={assignedTo}
              disabled={!isAdmin}
              onChange={(event) => setAssignedTo(event.target.value)}
            >
              {!assignedTo && <option value="">IA / sem responsável</option>}
              {members.map((member) => (
                <option value={member.user_id} key={member.user_id}>{member.full_name}</option>
              ))}
              {assignedTo && !members.some((member) => member.user_id === assignedTo) && (
                <option value={assignedTo}>Responsável atual</option>
              )}
            </select>
          </div>
        </div>
        {error && <div className="error-box" role="alert">{error}</div>}
        <footer className="modal-actions" style={{ justifyContent: "space-between" }}>
          <button type="button" className="btn btn-ghost" onClick={() => void remove()} disabled={busy}>
            Excluir tarefa
          </button>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={busy}>Cancelar</button>
            <button className="btn btn-primary" disabled={busy || !title.trim() || !date || !time}>
              {busy ? "Salvando…" : "Salvar alterações"}
            </button>
          </div>
        </footer>
      </form>
    </dialog>
  );
}
