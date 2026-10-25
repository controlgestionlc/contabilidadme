import { CierreInactividad } from './inactividad';

/** Páginas privadas: cierre de sesión tras 30 minutos sin actividad. */
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return <>{children}<CierreInactividad /></>;
}
