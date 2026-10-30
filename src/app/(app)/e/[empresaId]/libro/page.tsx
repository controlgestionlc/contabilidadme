import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirEmpresa, puedeEscribir } from '@/lib/auth';
import { crearClienteServidor } from '@/lib/supabase/server';
import { traerTodo } from '@/lib/paginar';
import { clp, fechaCL, param, MESES } from '@/lib/formato';
import { dteC, dteV } from '@/motor/dte';
import { SelectorPeriodo } from '@/components/selector-periodo';
import { AnularDocumento } from './anular';
import { EditarVenta } from './editar-venta';
import { nombreFormaCobro } from '@/rcv/editar-venta';
import { planDeEmpresa } from '@/lib/datos/maestros';
import { anioContable } from '@/lib/anio-contable';

export const metadata: Metadata = { title: 'Libro de compras y ventas' };

interface DocLibro {
  id: string; tipo_dte: number; folio: string; fecha: string; rut: string; razon_social: string | null;
  neto: number; exento: number; iva: number; total: number; estado: string | null; otros: string | null;
  motivo_anulacion: string | null; fp: string | null; cant: string | null; asientos: { numero: number; fecha: string; anulado: boolean } | null;
}

export default async function LibroPage({ params, searchParams }: PageProps<'/e/[empresaId]/libro'>) {
  const { empresaId } = await params;
  const sp = await searchParams;
  const tipo = param(sp.tipo) === 'venta' ? 'venta' : 'compra';
  const anio = Number(param(sp.anio)) || await anioContable();
  const mes = Number(param(sp.mes)) || new Date().getMonth() + 1;
  const periodo = `${anio}-${String(mes).padStart(2, '0')}`;
  const empresa = await requerirEmpresa(empresaId);
  const supabase = await crearClienteServidor();
  const docs = await traerTodo((d, h) => supabase.from('documentos')
    .select('id,tipo_dte,folio,fecha,rut,razon_social,neto,exento,iva,total,estado,motivo_anulacion,otros:datos->>otrosImpuestos,fp:datos->>formaPago,cant:datos->>cantidad,asientos(numero,fecha,anulado)')
    .eq('empresa_id', empresaId).eq('tipo', tipo).eq('periodo', periodo)
    .order('fecha').order('folio').range(d, h)) as unknown as DocLibro[];
  const info = (c: number) => (tipo === 'compra' ? dteC(c) : dteV(c));
  const vigentes = docs.filter((d) => d.estado !== 'anulado');
  const resumen = new Map<number, { n: number; exento: number; neto: number; iva: number; otros: number; total: number }>();
  for (const d of vigentes) {
    const s = info(d.tipo_dte)?.signo ?? 1;
    const r = resumen.get(d.tipo_dte) ?? { n: 0, exento: 0, neto: 0, iva: 0, otros: 0, total: 0 };
    r.n++; r.exento += s * Number(d.exento); r.neto += s * Number(d.neto); r.iva += s * Number(d.iva);
    r.otros += s * Number(d.otros ?? 0); r.total += s * Number(d.total);
    resumen.set(d.tipo_dte, r);
  }
  const totales = [...resumen.values()].reduce((a, r) => ({ n: a.n + r.n, exento: a.exento + r.exento, neto: a.neto + r.neto, iva: a.iva + r.iva, otros: a.otros + r.otros, total: a.total + r.total }),
    { n: 0, exento: 0, neto: 0, iva: 0, otros: 0, total: 0 });
  const escribe = puedeEscribir(empresa.rol);
  const titulo = tipo === 'compra' ? 'compras' : 'ventas';
  // Ventas: cuentas de ingreso (grupo 4, imputables y activas) para el editor
  const cuentasIngreso: [string, string][] = tipo === 'venta' && escribe
    ? (await planDeEmpresa(empresaId)).filter((c) => c.cd.startsWith('4') && c.aceptaMovimientos && c.activa !== false).map((c) => [c.cd, c.nm])
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Libro de {titulo} · {MESES[mes - 1]} {anio}</h1>
          <div className="mt-1 flex gap-1 text-sm">
            <Link href={`?tipo=compra&anio=${anio}&mes=${mes}`} className={`rounded px-2 py-0.5 ${tipo === 'compra' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Compras</Link>
            <Link href={`?tipo=venta&anio=${anio}&mes=${mes}`} className={`rounded px-2 py-0.5 ${tipo === 'venta' ? 'bg-panel-2 text-acento' : 'text-tenue'}`}>Ventas</Link>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SelectorPeriodo anio={anio} mes={mes} etiquetaMes="Mes" extra={{ tipo }} conAnioCompleto={false} />
          {escribe && <Link href={`/e/${empresaId}/rcv?tipo=${tipo}`} className="boton-sec">📥 Importar RCV</Link>}
          {escribe && tipo === 'venta' && <Link href={`/e/${empresaId}/documentos/nuevo?tipo=venta&resumen=39`} className="boton-sec" title="Total de boletas del día o del mes (F29 códigos 110 y 111)">🧾 Ventas con boleta</Link>}
          {escribe && tipo === 'venta' && <Link href={`/e/${empresaId}/documentos/nuevo?tipo=venta&resumen=48`} className="boton-sec" title="Total de comprobantes de pago electrónico del día o del mes (F29 códigos 758 y 759)">💳 Medios electrónicos</Link>}
          {escribe && <Link href={`/e/${empresaId}/documentos/nuevo?tipo=${tipo}`} className="boton">+ Documento</Link>}
        </div>
      </div>

      {resumen.size > 0 && (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[720px] text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde"><th className="px-3 py-2">Resumen por tipo</th><th className="px-2 py-2 text-right">Cant.</th>
                <th className="px-2 py-2 text-right">Exento</th><th className="px-2 py-2 text-right">Neto</th><th className="px-2 py-2 text-right">IVA</th>
                {tipo === 'compra' && <th className="px-2 py-2 text-right">Otros</th>}<th className="px-3 py-2 text-right">Total</th></tr>
            </thead>
            <tbody>
              {[...resumen.entries()].sort((a, b) => a[0] - b[0]).map(([c, r]) => (
                <tr key={c} className="border-b border-borde/40">
                  <td className="px-3 py-1">{c} · {info(c)?.nm}</td><td className="num px-2 py-1 text-right">{r.n}</td>
                  <td className="num px-2 py-1 text-right">{clp(r.exento)}</td><td className="num px-2 py-1 text-right">{clp(r.neto)}</td>
                  <td className="num px-2 py-1 text-right">{clp(r.iva)}</td>{tipo === 'compra' && <td className="num px-2 py-1 text-right">{clp(r.otros)}</td>}
                  <td className="num px-3 py-1 text-right">{clp(r.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="font-semibold">
              <tr><td className="px-3 py-1.5">Total del período</td><td className="num px-2 py-1.5 text-right">{totales.n}</td>
                <td className="num px-2 py-1.5 text-right">{clp(totales.exento)}</td><td className="num px-2 py-1.5 text-right">{clp(totales.neto)}</td>
                <td className="num px-2 py-1.5 text-right">{clp(totales.iva)}</td>{tipo === 'compra' && <td className="num px-2 py-1.5 text-right">{clp(totales.otros)}</td>}
                <td className="num px-3 py-1.5 text-right">{clp(totales.total)}</td></tr>
            </tfoot>
          </table>
        </div>
      )}

      {docs.length === 0 ? (
        <div className="tarjeta p-8 text-center text-tenue">Sin documentos en el período.</div>
      ) : (
        <div className="tarjeta overflow-x-auto">
          <table className="w-full min-w-[1100px] text-xs">
            <thead className="text-left text-tenue uppercase">
              <tr className="border-b border-borde">
                <th className="px-3 py-2">Fecha</th><th className="px-2 py-2">Documento</th><th className="px-2 py-2">{tipo === 'compra' ? 'Proveedor' : 'Cliente'}</th>
                <th className="px-2 py-2 text-right">Exento</th><th className="px-2 py-2 text-right">Neto</th><th className="px-2 py-2 text-right">IVA</th>
                {tipo === 'compra' && <th className="px-2 py-2 text-right">Otros</th>}
                <th className="px-2 py-2 text-right">Total</th>{tipo === 'venta' && <th className="px-2 py-2">Forma de pago</th>}<th className="px-2 py-2">Asiento</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => {
                const anulado = d.estado === 'anulado';
                const nc = (info(d.tipo_dte)?.signo ?? 1) < 0;
                return (
                  <tr key={d.id} className={`border-b border-borde/40 ${anulado ? 'opacity-50' : ''}`}>
                    <td className="num px-3 py-1">{fechaCL(d.fecha)}</td>
                    <td className="px-2 py-1"><span className="num">{d.tipo_dte} N° {d.folio}</span>{nc && <span className="ml-1 text-aviso">NC</span>}{d.cant && <span className="ml-1 text-info" title="Resumen: cantidad de documentos">× {Number(d.cant).toLocaleString('es-CL')} docs</span>}</td>
                    <td className="max-w-[260px] px-2 py-1"><div className="truncate">{d.razon_social}</div><div className="num text-tenue">{d.rut}</div></td>
                    <td className="num px-2 py-1 text-right">{Number(d.exento) ? clp(d.exento) : ''}</td>
                    <td className="num px-2 py-1 text-right">{clp(d.neto)}</td>
                    <td className="num px-2 py-1 text-right">{clp(d.iva)}</td>
                    {tipo === 'compra' && <td className="num px-2 py-1 text-right">{Number(d.otros) ? clp(d.otros) : ''}</td>}
                    <td className="num px-2 py-1 text-right font-semibold">{clp(d.total)}</td>
                    {tipo === 'venta' && <td className="px-2 py-1 whitespace-nowrap">{nombreFormaCobro(d.fp)}</td>}
                    <td className="px-2 py-1">
                      {d.asientos ? (
                        <Link className="num hover:text-acento" href={`/e/${empresaId}/diario?anio=${d.asientos.fecha.slice(0, 4)}&mes=${Number(d.asientos.fecha.slice(5, 7))}#n${d.asientos.numero}`}>
                          N° {d.asientos.numero}{d.asientos.anulado ? ' (anulado)' : ''}
                        </Link>
                      ) : <span className="text-tenue">—</span>}
                    </td>
                    <td className="px-3 py-1 text-right">
                      {anulado ? <span className="rounded bg-peligro/20 px-1.5 py-0.5 text-[10px] font-semibold text-peligro" title={d.motivo_anulacion ?? ''}>ANULADO</span>
                        : escribe && (
                          <div className="flex items-center justify-end gap-3">
                            {tipo === 'venta' && d.asientos && !d.asientos.anulado && <EditarVenta empresaId={empresaId} id={d.id} etiqueta={`${d.tipo_dte} N° ${d.folio}`} cuentasIngreso={cuentasIngreso} />}
                            <AnularDocumento empresaId={empresaId} id={d.id} etiqueta={`${d.tipo_dte} N° ${d.folio}`} />
                          </div>
                        )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
