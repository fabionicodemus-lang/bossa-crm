export function PageTopbar({ title, subtitle, actions }: { title: string; subtitle: string; actions?: React.ReactNode }) {
  return <><header className="topbar"><div><h1>{title}</h1><p>{subtitle}</p></div>{actions && <div className="page-actions">{actions}</div>}</header></>;
}
