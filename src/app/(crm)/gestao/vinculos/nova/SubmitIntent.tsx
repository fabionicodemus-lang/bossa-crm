"use client";
import { useFormStatus } from "react-dom";
export function SubmitIntent() {
  const { pending } = useFormStatus();
  return <button className="btn btn-primary" type="submit" disabled={pending} aria-disabled={pending}>
    {pending ? "Confirmando e vinculando…" : "Confirmar intenção, criar e vincular"}
  </button>;
}
