import 'server-only';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import type { Documento } from '@/motor/contable';
import type { DeclaracionF29, EntradaF29, HonorarioF29, VentaF29 } from '@/tributario/f29';

/** Reúne todo lo que necesita el cálculo del F29 de un año. */
export async function entradaF29(empresaId: string, anio: number): Promise<EntradaF29> {
  const supabase = await crearClienteServidor();
  const [emp, ventas, compras, honorarios, iusc, decl, retLibro] = await Promise.all([
    supabase.from('empresas').select('tasa_ppm').eq('id', empresaId).single(),
    traerTodo((d, h) => supabase.from('documentos').select('tipo_dte,fecha,neto,exento,iva,total,estado,cantidad:datos->>cantidad')
      .eq('empresa_id', empresaId).eq('tipo', 'venta').gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`).order('fecha').range(d, h)),
    traerTodo((d, h) => supabase.from('documentos').select('datos,estado,periodo')
      .eq('empresa_id', empresaId).eq('tipo', 'compra').gte('periodo', `${anio}-01`).lte('periodo', `${anio}-12`).order('fecha').range(d, h)),
    traerTodo((d, h) => supabase.from('documentos').select('total,estado,periodo,fecha,mes:datos->>mes,retencion:datos->>retencion,tasa:datos->>tasaRetencion,tipoRet:datos->>tipoRetencion')
      .eq('empresa_id', empresaId).eq('tipo', 'honorario').eq('anio', anio).range(d, h)),
    supabase.rpc('iusc_por_periodo', { p_empresa: empresaId, p_anio: anio }),
    supabase.from('f29_declaraciones').select('periodo,estado,declarado,utm,remanente_inicial,calculado,ajustes').eq('empresa_id', empresaId)
      .gte('periodo', `${anio - 1}-12`).lte('periodo', `${anio}-12`),
    // Retención de honorarios contabilizada (2103002), sin los asientos del propio F29, cierre ni apertura
    traerTodo((d, h) => supabase.from('asiento_lineas').select('debe,haber,asientos!inner(fecha,tipo,anulado,anio)')
      .eq('empresa_id', empresaId).eq('cuenta', '2103002').eq('asientos.anio', anio).eq('asientos.anulado', false)
      .not('asientos.tipo', 'in', '(tributario,cierre,apertura)').order('id').range(d, h))
      .catch(() => []), // si falla, el F29 sigue funcionando con las boletas registradas
  ]);
  if (emp.error) throw new Error(emp.error.message);
  if (iusc.error) throw new Error(iusc.error.message);
  if (decl.error) throw new Error(decl.error.message);
  const n = (v: unknown) => (v == null || v === '' ? null : Number(v));
  const declaraciones: Record<string, DeclaracionF29> = {};
  const anteriores: Record<string, DeclaracionF29> = {};
  for (const d of decl.data) {
    const x: DeclaracionF29 = { periodo: d.periodo, estado: d.estado, declarado: d.declarado ?? {}, utm: n(d.utm), remanenteInicial: n(d.remanente_inicial), calculado: d.calculado ?? null, ajustes: d.ajustes ?? {} };
    (d.periodo.startsWith(String(anio)) ? declaraciones : anteriores)[d.periodo] = x;
  }
  return {
    anio,
    tasaPPM: Number(emp.data.tasa_ppm) || 0,
    ventas: (ventas as { tipo_dte: number; fecha: string; neto: number; exento: number; iva: number; total: number; estado: string | null; cantidad: string | null }[])
      .map((v): VentaF29 => ({ tipoDTE: v.tipo_dte, fecha: v.fecha, neto: Number(v.neto), exento: Number(v.exento), iva: Number(v.iva), total: Number(v.total), estado: v.estado ?? undefined, ...(n(v.cantidad) ? { cantidad: n(v.cantidad)! } : {}) })),
    compras: (compras as { datos: Documento; estado: string | null; periodo: string }[])
      .map((c) => ({ ...c.datos, periodoContable: c.periodo, estado: c.estado === 'anulado' ? 'anulado' : c.datos.estado })),
    honorarios: (honorarios as { total: number; estado: string | null; periodo: string | null; fecha: string | null; mes: string | null; retencion: string | null; tasa: string | null; tipoRet: string | null }[])
      .map((h): HonorarioF29 => ({
        mes: n(h.mes) ?? (h.periodo ? +h.periodo.slice(5, 7) : h.fecha ? +h.fecha.slice(5, 7) : undefined),
        bruto: Number(h.total), retencion: n(h.retencion), tasaRetencion: n(h.tasa), tipoRetencion: h.tipoRet ?? undefined,
        estado: h.estado ?? undefined,
      })),
    iusc: Object.fromEntries((iusc.data as { periodo: string; monto: number }[]).map((r) => [r.periodo, Number(r.monto)])),
    retencionLibro: sumarPorPeriodo(retLibro as unknown as LineaRet[]),
    declaraciones,
    anteriores,
  };
}

type LineaRet = { debe: number; haber: number; asientos: { fecha: string } | { fecha: string }[] };
function sumarPorPeriodo(lineas: LineaRet[]): Record<string, number> {
  const r: Record<string, number> = {};
  for (const l of lineas) {
    const a = Array.isArray(l.asientos) ? l.asientos[0] : l.asientos;
    if (!a?.fecha) continue;
    const per = String(a.fecha).slice(0, 7);
    r[per] = (r[per] ?? 0) + Number(l.haber) - Number(l.debe);
  }
  return r;
}

export interface AsientoF29 { id: string; numero: number; fecha: string; origen_id: string; anulado: boolean }

export async function asientosF29(empresaId: string, anio: number): Promise<AsientoF29[]> {
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.from('asientos').select('id,numero,fecha,origen_id,anulado')
    .eq('empresa_id', empresaId).eq('tipo', 'tributario').like('origen_id', `%f29:${anio}-%`).order('fecha');
  if (error) throw new Error(error.message);
  return data;
}
