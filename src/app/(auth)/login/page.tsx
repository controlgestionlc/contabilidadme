import type { Metadata } from 'next';
import { FormLogin } from './form';

export const metadata: Metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: PageProps<'/login'>) {
  const sp = await searchParams;
  const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  return <FormLogin next={uno(sp.next)} errorInicial={uno(sp.motivo) === 'inactividad' ? 'Tu sesión se cerró por 30 minutos sin actividad. Ingresa de nuevo.' : uno(sp.error)} />;
}
