// Lector del "Detalle de Registro de Compras/Ventas" del SII (CSV o Excel).
// Traslado fiel de importadorsii.js del sistema actual.

import { dteC, dteV } from '@/motor/dte';
import { rutParse } from '@/motor/rut';
import type { OtroImpuestoDetalle } from '@/motor/contable';

export type TipoRCV = 'compra' | 'venta';

export interface DocRCV {
  fecha: string;
  fechaVencimiento: string;
  fechaVencimientoOrigen: 'archivo' | 'estimado30d' | 'manual' | string;
  fechaRecepcionSII: string;
  fechaAcuseSII: string;
  tipoDTE: number;
  numero: string;
  rutCodigo: string;
  rutDV: string;
  razonSocial: string;
  neto: number;
  exento: number;
  iva: number;
  ivaRecuperable?: number;
  ivaNoRecuperable?: number;
  codigoIvaNoRecuperable?: string;
  ivaUsoComun?: number;
  ivaActivoFijo?: number;
  tratamientoIVA: string;
  otrosImpuestos: number;
  tratamientoOtrosImpuestos: string;
  otrosImpuestosDetalle: OtroImpuestoDetalle[];
  total: number;
  /** Resumen de boletas (35/39/41) o comprobantes de pago electrónico (48): cantidad de documentos que agrupa. */
  cantidad?: number;
  impuestoSinDerechoCredito?: number;
  ivaRetenido?: number;
  totalSII?: number;
  totalIncluyeRetencion?: boolean;
  netoAF: number;
  tipoCompra?: string;
  numeroInternoSII?: string;
  /** Registro completo del SII: la fila del documento y sus filas de continuación, con los encabezados originales */
  registroSII?: Record<string, string>[];
}

export interface FilaDescartada { fila: Record<string, string>; motivo: string }

export interface LecturaRCV {
  docs: DocRCV[];
  descartados: number;
  continuaciones: number;
  /** Filas del archivo que no son documentos importables, con el motivo */
  filasDescartadas?: FilaDescartada[];
}

const num = (v: unknown) => Number(v) || 0;

export function parseNumSII(v: unknown): number {
  if (v == null) return 0;
  const s = String(v).trim().replace(/\s/g, '').replace(/\$/g, '');
  if (!s || s === '-' || s === '—') return 0;
  const norm = s.includes(',') && s.lastIndexOf(',') === s.length - 3 ? s.replace(/\./g, '').replace(',', '.') : s.replace(/[.,]/g, '');
  const n = parseFloat(norm);
  return isNaN(n) ? 0 : n;
}

export function parseFechaSII(v: unknown): string {
  if (v == null || v === '') return '';
  if (typeof v === 'number' && v > 0 && v < 100000) {
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return '';
}

export function sumarDiasFechaISO(fecha: string, dias = 30): string {
  const m = String(fecha || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return '';
  d.setUTCDate(d.getUTCDate() + (+dias || 0));
  return d.toISOString().slice(0, 10);
}

function splitCSVRow(line: string, delim = ','): string[] {
  const out: string[] = [];
  let cur = '';
  let en = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (en && line[i + 1] === '"') { cur += '"'; i++; } else en = !en;
    } else if (c === delim && !en) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function findCol(headers: string[], ...variantes: string[]): number {
  for (const v of variantes) {
    const idx = headers.findIndex((h) => h === v.toLowerCase().trim());
    if (idx >= 0) return idx;
  }
  for (const v of variantes) {
    const idx = headers.findIndex((h) => h.includes(v.toLowerCase()));
    if (idx >= 0) return idx;
  }
  return -1;
}

export function parseFilas(rows: unknown[][], tipo: TipoRCV): LecturaRCV {
  let headerIdx = -1;
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const joined = rows[i].join(' ').toLowerCase();
    if ((joined.includes('tipo doc') || joined.includes('tipo dte')) && joined.includes('rut')) { headerIdx = i; break; }
  }
  if (headerIdx < 0) {
    throw new Error(`No se encontró la fila de encabezados. ¿Es el archivo "Detalle de Registro de ${tipo === 'compra' ? 'Compras' : 'Ventas'}" del SII?`);
  }
  let descartados = 0;
  const headers = rows[headerIdx].map((h) => String(h || '').toLowerCase().trim().replace(/"/g, ''));
  const titulos = rows[headerIdx].map((h, i) => String(h || '').trim().replace(/"/g, '') || `Columna ${i + 1}`);
  /** Fila con sus encabezados originales (sólo celdas con valor) */
  const filaSII = (r: unknown[]): Record<string, string> => {
    const o: Record<string, string> = {};
    r.forEach((v, i) => { const t = String(v ?? '').trim(); if (t) o[titulos[i] ?? `Columna ${i + 1}`] = t; });
    return o;
  };
  const filasDescartadas: FilaDescartada[] = [];
  const descartar = (r: unknown[], motivo: string) => { descartados++; filasDescartadas.push({ fila: filaSII(r), motivo }); };
  const cTipo = findCol(headers, 'tipo doc', 'tipo dte');
  const cRut = findCol(headers, tipo === 'compra' ? 'rut proveedor' : 'rut cliente', 'rut receptor', 'rut emisor', 'rut');
  const cRazon = findCol(headers, 'razon social', 'razón social', 'razonsocial');
  const cNro = findCol(headers, 'nro doc', 'n° doc', 'nº doc', 'folio');
  const cVenc = findCol(headers, 'fecha vencimiento', 'fecha de vencimiento', 'fecha vcto', 'fch vencimiento', 'fch vcto', 'fec vencimiento', 'vencimiento');
  const cRecepcion = findCol(headers, 'fecha recepcion', 'fecha recepción');
  const cAcuse = findCol(headers, 'fecha acuse recibo', 'fecha acuse', 'acuse recibo');
  let cFecha = findCol(headers, 'fecha docto', 'fecha documento', 'fecha emision', 'fecha emisión', 'fecha doc');
  if (cFecha < 0) cFecha = headers.findIndex((h, i) => i !== cVenc && ['fecha', 'fecha dte', 'fch fecha'].includes(h));
  const cExento = findCol(headers, 'monto exento', 'exento');
  const cNeto = findCol(headers, 'monto neto', 'neto');
  const cIvaRec = findCol(headers, 'iva recuperable', 'monto iva recuperable');
  const cIvaNoRec = findCol(headers, 'iva no recuperable', 'monto iva no recuperable');
  const cCodIvaNoRec = findCol(headers, 'codigo iva no recuperable', 'código iva no recuperable', 'cod iva no rec');
  const cIvaUso = findCol(headers, 'iva uso comun', 'iva uso común');
  const cIva = findCol(headers, 'monto iva', 'iva');
  const cTotal = findCol(headers, 'monto total', 'total');
  const cOtro = findCol(headers, 'valor otro impuesto', 'valor otros impuestos', 'otros impuestos');
  const cCodOtro = findCol(headers, 'codigo otro impuesto', 'código otro impuesto');
  const cTasaOtro = findCol(headers, 'tasa otro impuesto');
  const cSinDerecho = findCol(headers, 'impto. sin derecho a credito', 'impto sin derecho a credito', 'impuesto sin derecho a credito', 'sin derecho a credito');
  const cTipoCompra = findCol(headers, 'tipo compra', 'tipo de compra');
  const cNumeroInterno = findCol(headers, 'numero interno', 'número interno');
  const cNetoAF = findCol(headers, 'monto neto activo fijo', 'neto activo fijo');
  const cIvaAF = findCol(headers, 'iva activo fijo');
  const cNroSII = findCol(headers, 'nro');

  if (cTipo < 0 || cRut < 0 || cNro < 0 || cFecha < 0 || cTotal < 0) {
    throw new Error('Faltan columnas esenciales (Tipo Doc, RUT, N° Doc, Fecha, Total). Verifica el archivo.');
  }
  const dteValido = tipo === 'compra' ? dteC : dteV;
  const docs: DocRCV[] = [];
  let continuaciones = 0;
  const claves = new Set<string>();
  const cel = (r: unknown[], c: number) => (c >= 0 ? r[c] : undefined);
  const txtCel = (r: unknown[], c: number) => String(cel(r, c) ?? '').trim();

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length < 3) continue;
    const nroSII = cNroSII >= 0 ? String(r[cNroSII] || '').trim() : 'x';
    const numero = String(r[cNro] || '').trim();
    if (cNroSII >= 0 && !nroSII) {
      if (docs.length) {
        docs[docs.length - 1].registroSII?.push(filaSII(r));
        const extra = cOtro >= 0 ? Math.abs(parseNumSII(r[cOtro])) : 0;
        if (extra > 0) {
          const anterior = docs[docs.length - 1];
          const esRetencion = [45, 46, 61].includes(+anterior.tipoDTE) && Math.abs(extra - Math.abs(+anterior.iva || 0)) <= 1;
          if (esRetencion) {
            anterior.ivaRetenido = Math.max(+(anterior.ivaRetenido ?? 0) || 0, extra);
            anterior.totalSII = anterior.total;
          } else {
            anterior.otrosImpuestos += extra;
            anterior.otrosImpuestosDetalle.push({
              tipo: String(cCodOtro >= 0 ? r[cCodOtro] || 'otro' : 'otro'), nombre: 'Otro impuesto RCV',
              monto: extra, tasa: cTasaOtro >= 0 ? Math.abs(parseNumSII(r[cTasaOtro])) : 0, tratamiento: 'costo',
            });
          }
          continuaciones++;
        }
      }
      continue;
    }
    const tipoDTE = parseInt(String(r[cTipo]), 10) || 0;
    if (!tipoDTE || !dteValido(tipoDTE)) { descartar(r, `Tipo de documento ${String(r[cTipo] ?? '').trim() || '(vacío)'} no corresponde a ${tipo === 'compra' ? 'compras' : 'ventas'}`); continue; }
    const rutInfo = rutParse(String(r[cRut] || ''));
    if (!rutInfo.codigo) { descartar(r, 'RUT vacío o no válido'); continue; }
    const fecha = parseFechaSII(r[cFecha]);
    if (!fecha) { descartar(r, 'Sin fecha del documento'); continue; }
    const vencArchivo = cVenc >= 0 ? parseFechaSII(r[cVenc]) : '';
    const neto = Math.abs(parseNumSII(cel(r, cNeto)));
    const netoAF = cNetoAF >= 0 ? Math.abs(parseNumSII(r[cNetoAF])) : 0;
    const exento = Math.abs(parseNumSII(cel(r, cExento)));
    const ivaRecuperable = cIvaRec >= 0 ? Math.abs(parseNumSII(r[cIvaRec])) : null;
    const ivaNoRecuperable = cIvaNoRec >= 0 ? Math.abs(parseNumSII(r[cIvaNoRec])) : null;
    const ivaUsoComun = cIvaUso >= 0 ? Math.abs(parseNumSII(r[cIvaUso])) : 0;
    const ivaActivoFijo = cIvaAF >= 0 ? Math.abs(parseNumSII(r[cIvaAF])) : 0;
    let iva = (ivaRecuperable || 0) + (ivaNoRecuperable || 0);
    if (!iva && cIva >= 0) iva = Math.abs(parseNumSII(r[cIva]));
    const total = Math.abs(parseNumSII(r[cTotal]));
    const otrosImpuestos = cOtro >= 0 ? Math.abs(parseNumSII(r[cOtro])) : 0;
    const impuestoSinDerechoCredito = cSinDerecho >= 0 ? Math.abs(parseNumSII(r[cSinDerecho])) : 0;
    if (!numero || total === 0) { descartar(r, !numero ? 'Sin folio' : 'Total en cero'); continue; }

    let otrosFinal = otrosImpuestos;
    const facturaCompra = tipoDTE === 45 || tipoDTE === 46;
    const ncFacturaCompra = tipoDTE === 61 && iva > 0 && Math.abs(otrosImpuestos - iva) <= 1 && Math.abs(total - (neto + exento)) <= 1;
    if (facturaCompra || ncFacturaCompra) otrosFinal = 0;

    const claveDoc = `${rutInfo.codigo}|${tipoDTE}|${numero}`;
    if (claves.has(claveDoc)) { descartar(r, 'Repetido en el archivo'); continue; }
    claves.add(claveDoc);

    const tasaOtro = cTasaOtro >= 0 ? Math.abs(parseNumSII(r[cTasaOtro])) : 0;
    const codOtro = String(cCodOtro >= 0 ? r[cCodOtro] || 'otro' : 'otro');
    const d: DocRCV = {
      fecha,
      fechaVencimiento: vencArchivo || sumarDiasFechaISO(fecha, 30),
      fechaVencimientoOrigen: vencArchivo ? 'archivo' : 'estimado30d',
      fechaRecepcionSII: txtCel(r, cRecepcion),
      fechaAcuseSII: txtCel(r, cAcuse),
      tipoDTE, numero,
      rutCodigo: rutInfo.codigo, rutDV: rutInfo.dv,
      razonSocial: String(cel(r, cRazon) || '').trim(),
      neto, exento, iva,
      ...(ivaRecuperable != null ? { ivaRecuperable } : {}),
      ...(ivaNoRecuperable != null ? { ivaNoRecuperable } : {}),
      ...(cCodIvaNoRec >= 0 && txtCel(r, cCodIvaNoRec) ? { codigoIvaNoRecuperable: txtCel(r, cCodIvaNoRec) } : {}),
      ...(ivaUsoComun ? { ivaUsoComun } : {}),
      ...(ivaActivoFijo ? { ivaActivoFijo } : {}),
      tratamientoIVA: ivaActivoFijo > 0 ? 'activo_fijo' : (ivaNoRecuperable ?? 0) > 0 ? 'sii' : 'recuperable',
      otrosImpuestos: otrosFinal,
      tratamientoOtrosImpuestos: 'costo',
      otrosImpuestosDetalle: otrosFinal ? [{ tipo: codOtro, nombre: 'Otro impuesto RCV', monto: otrosFinal, tasa: tasaOtro, tratamiento: 'costo' }] : [],
      total,
      ...(impuestoSinDerechoCredito ? { impuestoSinDerechoCredito } : {}),
      ...(facturaCompra || ncFacturaCompra ? { ivaRetenido: iva, totalSII: total, totalIncluyeRetencion: false } : {}),
      netoAF,
      ...(cTipoCompra >= 0 && txtCel(r, cTipoCompra) ? { tipoCompra: txtCel(r, cTipoCompra) } : {}),
      ...(cNumeroInterno >= 0 && txtCel(r, cNumeroInterno) ? { numeroInternoSII: txtCel(r, cNumeroInterno) } : {}),
      registroSII: [filaSII(r)],
    };
    docs.push(d);
  }

  // Reconciliación contra el Total del RCV (compras corrientes): lo que excede a
  // neto + exento + IVA es otro impuesto que integra el costo.
  if (tipo === 'compra') {
    for (const d of docs) {
      if (d.ivaRetenido != null) continue;
      const objetivo = Math.round(num(d.total) - num(d.neto) - num(d.exento) - num(d.iva));
      const actual = num(d.otrosImpuestos);
      if (objetivo > actual + 1) {
        const faltante = objetivo - actual;
        const esSinDerecho = num(d.impuestoSinDerechoCredito) > 0 && Math.abs(num(d.impuestoSinDerechoCredito) - faltante) <= 1;
        d.otrosImpuestosDetalle.push({
          tipo: esSinDerecho ? '14' : 'sincredito',
          nombre: esSinDerecho ? 'Impto. sin derecho a crédito (RCV)' : 'Impuesto sin crédito fiscal (ajuste a Total RCV)',
          monto: faltante, tasa: 0, tratamiento: 'costo',
        });
        d.otrosImpuestos = objetivo;
        d.tratamientoOtrosImpuestos = 'costo';
      }
    }
  }
  return { docs, descartados, continuaciones, filasDescartadas };
}

export function leerCSV(texto: string, tipo: TipoRCV): LecturaRCV {
  const raw = String(texto || '').replace(/^﻿/, '').replace(/\r/g, '').split('\n').filter((l) => l.trim());
  if (!raw.length) throw new Error('El archivo está vacío');
  const first = raw[0];
  const delim = (first.match(/;/g) || []).length >= (first.match(/,/g) || []).length ? ';' : ',';
  return parseFilas(raw.map((l) => splitCSVRow(l, delim)), tipo);
}

/** Lee CSV o Excel según el nombre. Los CSV del SII vienen en Windows-1252 o UTF-8. */
export async function leerArchivoRCV(nombre: string, buf: ArrayBuffer, tipo: TipoRCV): Promise<LecturaRCV> {
  if (/\.(xlsx|xls)$/i.test(nombre)) {
    const XLSX = await import('xlsx');
    const wb = XLSX.read(buf, { type: 'array', cellDates: false });
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
    return parseFilas(rows, tipo);
  }
  let texto = new TextDecoder('utf-8').decode(buf);
  if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(buf);
  return leerCSV(texto, tipo);
}
