import type { Metadata } from 'next';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { planDeEmpresa, centrosDeEmpresa } from '@/lib/datos/maestros';
import { param } from '@/lib/formato';
import { FormDocumento } from './form';
import { crearClienteServidor } from '@/lib/supabase/server';
import { DTE_VENTAS, TIPOS_RESUMEN_VENTA } from '@/motor/dte';

export const metadata: Metadata = { title: 'Nuevo documento' };

export default async function NuevoDocumentoPage({ params, searchParams }: PageProps<'/e/[empresaId]/documentos/nuevo'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const tipo = param(sp.tipo) === 'venta' ? 'venta' : 'compra';
  const resumen = Number(param(sp.resumen)) || undefined;
  const empresa = await requerirEmpresa(empresaId);
  if (!puedeEscribir(empresa.rol)) return <p className="text-tenue">Tu rol no permite registrar documentos.</p>;
  const [plan, centros, cuentaVentas] = await Promise.all([planDeEmpresa(empresaId), centrosDeEmpresa(empresaId), tipo === 'venta' ? cuentaIngresoHabitual(empresaId) : null]);
  return <FormDocumento key={`${tipo}-${resumen ?? ''}`} empresaId={empresaId} tipo={tipo} cuentas={plan} centros={centros} resumen={resumen} cuentaVentas={cuentaVentas ?? undefined} />;
}

/** Cuenta de ingreso que usan las demás ventas de la empresa (la más frecuente en las últimas, sin contar boletas ni vouchers). */
async function cuentaIngresoHabitual(empresaId: string): Promise<string> {
  const supabase = await crearClienteServidor();
  const { data } = await supabase.from('documentos').select('tipo_dte,ci:datos->>cuentaIngreso,d0:datos->dist->0->>cuenta')
    .eq('empresa_id', empresaId).eq('tipo', 'venta').or('estado.is.null,estado.neq.anulado').order('fecha', { ascending: false }).limit(300);
  const cuenta: Record<string, number> = {};
  for (const d of (data ?? []) as { tipo_dte: number; ci: string | null; d0: string | null }[]) {
    if (TIPOS_RESUMEN_VENTA.includes(+d.tipo_dte)) continue;
    const cd = d.ci || d.d0;
    if (cd) cuenta[cd] = (cuenta[cd] ?? 0) + 1;
  }
  return Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0]?.[0] ?? DTE_VENTAS.find((x) => x.cod === 33)?.cuenta ?? '4101002';
}
