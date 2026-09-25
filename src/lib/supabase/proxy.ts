import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const AUTH_PATHS = ['/login', '/cadastro', '/recuperar-senha'];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // getClaims valida o token localmente quando o projeto usa chaves assimétricas,
  // evitando uma ida ao servidor de autenticação a cada clique. Também renova a
  // sessão (cookies) quando o token está perto de expirar.
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const user = !claimsError && typeof claimsData?.claims?.sub === 'string' ? claimsData.claims : null;
  const pathname = request.nextUrl.pathname;
  const isAuthPath = AUTH_PATHS.some((path) => pathname.startsWith(path));
  const isPublicPath = isAuthPath || pathname.startsWith('/auth/') || pathname.startsWith('/api/') || pathname === '/atualizar-senha';

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPath) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return response;
}
