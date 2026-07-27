import { AuthBrand } from '@/components/AuthBrand';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className="auth-shell"><AuthBrand /><section className="auth-main">{children}</section></main>;
}
