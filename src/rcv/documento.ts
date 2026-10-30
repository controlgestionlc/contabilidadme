// Convierte un documento del RCV (con sus líneas del paso 2 o una cuenta rápida) en el
// documento contable y el asiento que se registran. Sigue la lógica de compras.js/ventas.js
// del sistema actual y contabiliza con el mismo motor.

import { asientoCompra, asientoVenta, type Documento, type LineaDist, type OtroImpuestoDetalle } from '@/motor/contable';
import type { PlanCuentas, CuentaBase } from '@/motor/plan-cuentas';
import { lineasDe, redondear, type LineaImport, type MovLegado } from '@/importador/respaldo';
import { validarDetalleRCV, type LineaDetalle, type ResultadoValidacion } from './detalle';
import type { DocRCV, TipoRCV } from './leer';

export const CUENTA_OTRO_IMP_RECUPERABLE = '1108006';

/** Cuentas de impuestos y retenciones: créditos fiscales y PPM (1108), retenciones e IVA débito (2103), impuestos por pagar (2104). */
export const esCuentaImpuesto = (cuenta: string) => /^(1108|2103|2104)/.test(cuenta);

export interface Asignacion {
  /** Paso 1: cuenta y CC para todo el documento */
  cuenta?: string;
  cc?: string;
  /** Paso 2: líneas revisadas */
  detalle?: { lineas: LineaDetalle[]; glosa?: string; aceptaRedondeo?: boolean };
  /** Ventas: clientes (por cobrar) | banco | deudores | tarjetas (débito o crédito, por cobrar al operador) */
  formaPago?: 'clientes' | 'banco' | 'deudores' | 'tarjetas';
  fechaVencimiento?: string;
  glosa?: string;
  origen?: 'RCV' | 'manual';
}

export interface Registro {
  documento: {
    tipo: TipoRCV; ref: string; tipo_dte: number; folio: string; fecha: string; rut: string; razon_social: string;
    neto: number; exento: number; iva: number; total: number; datos: Documento;
  };
  asiento: { fecha: string; glosa: string; lineas: LineaImport[] };
}

export type ResultadoRegistro = { ok: true; registro: Registro; avisos: string[] } | { ok: false; errores: string[] };

/** Plan de cuentas desde las columnas de la base (respeta lo editado por el usuario). */
export function cuentasDesdeBase(filas: {
  codigo: string; nombre: string; tipo: string; naturaleza: string | null; acepta_movimientos: boolean;
  acepta_centro_costo: boolean; requiere_centro_costo: boolean; tipo_auxiliar: string | null; activa: boolean;
}[]): CuentaBase[] {
  return filas.map((c) => ({
    cd: c.codigo, nm: c.nombre, tp: c.tipo, nat: c.naturaleza ?? '',
    aceptaMovimientos: c.acepta_movimientos, aceptaCentroCosto: c.acepta_centro_costo,
    requiereCentroCosto: c.requiere_centro_costo, tipoAuxiliar: c.tipo_auxiliar ?? '',
    requiereAuxiliar: !!c.tipo_auxiliar, activa: c.activa,
  }));
}

export const refDocumento = (tipo: TipoRCV, d: Pick<DocRCV, 'rutCodigo' | 'tipoDTE' | 'numero'>) =>
  `${tipo}:${d.rutCodigo}:${d.tipoDTE}:${d.numero}`;

/** Clave para detectar duplicados contra documentos ya registrados. */
/** Origen legible de un documento registrado (igual que documento_registrado en la base). */
export const origenDocumento = (refOrigen: string | null, origen: string | null, tipo: string) =>
  refOrigen ? 'respaldo del sistema anterior' : origen === 'asiento manual' ? 'asiento manual' : origen === 'manual' ? 'registro manual' : tipo === 'honorario' ? 'boleta de honorarios' : 'RCV';

/** Folio comparable: sin espacios ni ceros a la izquierda (igual que folio_normalizado en la base). */
export const folioNormalizado = (folio: string | null | undefined) => String(folio ?? '').replace(/\s/g, '').toUpperCase().replace(/^0+/, '') || '0';
/** Clave de un documento para detectar duplicados: RUT|tipo|folio normalizados. */
export const claveDocumento = (rut: string | null | undefined, tipoDTE: number | null | undefined, folio: string | null | undefined) =>
  `${String(rut ?? '').replace(/[^0-9kK]/g, '').toUpperCase()}|${Number(tipoDTE) || 0}|${folioNormalizado(folio)}`;

export function construirRegistro(tipo: TipoRCV, d: DocRCV, periodo: string, a: Asignacion, plan: PlanCuentas): ResultadoRegistro {
  const errores: string[] = [];
  let avisos: string[] = [];
  const lineasDetalle = a.detalle?.lineas;
  let validacion: ResultadoValidacion | null = null;
  if (lineasDetalle?.length) {
    validacion = validarDetalleRCV(tipo, d, lineasDetalle, plan, { aceptaRedondeo: a.detalle?.aceptaRedondeo });
    if (!validacion.ok) return { ok: false, errores: validacion.errores };
    avisos = validacion.avisos;
  } else {
    const r = plan.regla(a.cuenta);
    if (!a.cuenta) errores.push('Falta la cuenta.');
    else if (!r) errores.push(`La cuenta ${a.cuenta} no existe en el plan de cuentas.`);
    else {
      if (!r.aceptaMovimientos) errores.push(`La cuenta ${a.cuenta} es agrupadora y no acepta movimientos.`);
      if (r.activa === false) errores.push(`La cuenta ${a.cuenta} está inactiva.`);
      if (r.requiereCentroCosto && !a.cc) errores.push(`La cuenta ${a.cuenta} exige centro de costo.`);
    }
    if (errores.length) return { ok: false, errores };
  }
  if (tipo === 'compra' && d.fecha.slice(0, 7) > periodo) {
    return { ok: false, errores: [`La fecha del documento (${d.fecha}) es posterior al período ${periodo}.`] };
  }

  const doc = armarDocumento(tipo, d, periodo, a);
  const e = tipo === 'compra' ? asientoCompra(doc, plan) : asientoVenta(doc, plan);
  if (!e.cuadre.ok) return { ok: false, errores: [`El asiento no cuadra (diferencia ${e.cuadre.diferencia}).`] };
  const { lineas: crudas, descuadre } = redondear(lineasDe(e.movs as MovLegado[]));
  if (descuadre) return { ok: false, errores: [`El asiento no cuadra al redondear (diferencia ${descuadre}).`] };
  // Las líneas de impuestos y retenciones sin detalle (IVA crédito/débito, IVA retenido, crédito de activo fijo,
  // otros impuestos recuperables, retención de honorarios) llevan el nombre de su cuenta. Las de gasto, ingreso
  // y activo no: su detalle lo escribe quien importa en el paso 2.
  const lineas = crudas.map((l) => (!l.glosa?.trim() && esCuentaImpuesto(l.cuenta) ? { ...l, glosa: plan.nombre(l.cuenta) || undefined } : l));
  return {
    ok: true,
    avisos,
    registro: {
      documento: {
        tipo, ref: refDocumento(tipo, d), tipo_dte: d.tipoDTE, folio: d.numero, fecha: d.fecha,
        rut: `${d.rutCodigo}-${d.rutDV}`, razon_social: d.razonSocial,
        neto: Math.round(d.neto), exento: Math.round(d.exento), iva: Math.round(d.iva), total: Math.round(d.total), datos: doc,
      },
      asiento: { fecha: String(e.fecha), glosa: e.glosa, lineas },
    },
  };
}

/** Documento contable a partir del RCV y la asignación (sin validar). */
export function armarDocumento(tipo: TipoRCV, d: DocRCV, periodo: string, a: Asignacion): Documento {
  const lineasDetalle = a.detalle?.lineas;
  const glosa = (a.detalle?.glosa ?? a.glosa ?? '').trim();
  const base: Documento = {
    id: refDocumento(tipo, d),
    fecha: d.fecha,
    fechaVencimiento: a.fechaVencimiento || d.fechaVencimiento,
    fechaVencimientoOrigen: a.fechaVencimiento && a.fechaVencimiento !== d.fechaVencimiento ? 'manual' : d.fechaVencimientoOrigen,
    tipoDTE: d.tipoDTE, numero: d.numero, rutCodigo: d.rutCodigo, rutDV: d.rutDV, razonSocial: d.razonSocial,
    neto: d.neto, exento: d.exento, iva: d.iva, total: d.total,
    origenRegistro: a.origen ?? 'RCV', estado: 'activo',
    ...(d.cantidad && d.cantidad > 0 ? { cantidad: Math.round(d.cantidad) } : {}),
    ...(glosa ? { glosa } : {}),
    ...(lineasDetalle?.length ? { detalleRCV: { v: 2, lineas: lineasDetalle, glosa, aceptaRedondeo: !!a.detalle?.aceptaRedondeo, revisado: true } } : {}),
    // Registro completo del SII tal como venía en el archivo (todas las columnas)
    ...(d.registroSII?.length ? { registroSII: d.registroSII } : {}),
  };

  let doc: Documento;
  if (tipo === 'compra') {
    const dist: LineaDist[] = lineasDetalle?.length
      ? lineasDetalle.filter((l) => !l.otroImp).map((l) => ({ cuenta: l.cuenta, monto: Math.round(+l.monto || 0), cc: l.cc || '', desc: l.desc || '', afecto: l.afecto !== false, tratamientoTributario: 'aceptado' }))
      : [{ cuenta: a.cuenta!, monto: d.neto + d.exento, cc: a.cc || '' }];
    let otrosImpuestosDetalle: OtroImpuestoDetalle[] = d.otrosImpuestosDetalle ?? [];
    const otrasLineas = (lineasDetalle ?? []).filter((l) => l.otroImp);
    if (otrasLineas.length) {
      otrosImpuestosDetalle = otrasLineas.map((l) => ({
        tipo: l.codImp || 'otro', nombre: l.desc || 'Otros impuestos', monto: Math.round(+l.monto || 0),
        tratamiento: l.cuenta === CUENTA_OTRO_IMP_RECUPERABLE ? 'recuperable' : 'costo',
        ...(l.cuenta !== CUENTA_OTRO_IMP_RECUPERABLE ? { cuenta: l.cuenta, cc: l.cc || '', desc: l.desc || '' } : {}),
      }));
    }
    doc = {
      ...base,
      periodoContable: periodo,
      ...(d.ivaRecuperable != null ? { ivaRecuperable: d.ivaRecuperable } : {}),
      ...(d.ivaNoRecuperable != null ? { ivaNoRecuperable: d.ivaNoRecuperable } : {}),
      ...(d.codigoIvaNoRecuperable ? { codigoIvaNoRecuperable: d.codigoIvaNoRecuperable } : {}),
      ...(d.ivaUsoComun ? { ivaUsoComun: d.ivaUsoComun } : {}),
      ...(d.ivaActivoFijo ? { ivaActivoFijo: d.ivaActivoFijo } : {}),
      ...(d.tratamientoIVA ? { tratamientoIVA: d.tratamientoIVA } : {}),
      otrosImpuestos: d.otrosImpuestos || 0,
      tratamientoOtrosImpuestos: d.tratamientoOtrosImpuestos || 'costo',
      otrosImpuestosDetalle,
      ...(d.tipoCompra ? { tipoCompra: d.tipoCompra } : {}),
      ...(d.numeroInternoSII ? { numeroInternoSII: d.numeroInternoSII } : {}),
      ...(+d.tipoDTE === 45 || +d.tipoDTE === 46 || d.ivaRetenido != null
        ? { ivaRetenido: d.ivaRetenido ?? d.iva, totalSII: d.totalSII ?? d.total, totalIncluyeRetencion: [45, 46].includes(+d.tipoDTE) ? false : (d.totalIncluyeRetencion ?? false) }
        : {}),
      dist,
    };
  } else {
    doc = {
      ...base,
      formaPago: a.formaPago || 'clientes',
      cuentaIngreso: (lineasDetalle?.length ? lineasDetalle[0].cuenta : a.cuenta) ?? '',
      ...(lineasDetalle?.length
        ? { dist: lineasDetalle.map((l) => ({ cuenta: l.cuenta, monto: Math.round(+l.monto || 0), cc: l.cc || '', desc: l.desc || '', afecto: l.afecto !== false })) }
        : a.cc ? { dist: [{ cuenta: a.cuenta!, monto: d.neto + d.exento, cc: a.cc }] } : {}),
    };
  }

  return doc;
}

export interface LineaProvisional extends LineaImport {
  /** Índice de la línea del paso 2 que la origina (gasto, ingreso, activo u otro impuesto); null = automática */
  origen: number | null;
}

/**
 * Asiento provisional para mostrar mientras se edita, aunque aún no cuadre: mismas reglas del motor,
 * sin validar ni redondear. Las primeras líneas corresponden, en orden, a las líneas del paso 2.
 */
export function asientoProvisional(tipo: TipoRCV, d: DocRCV, periodo: string, a: Asignacion, plan: PlanCuentas): LineaProvisional[] {
  const doc = armarDocumento(tipo, d, periodo, a);
  const e = tipo === 'compra' ? asientoCompra(doc, plan) : asientoVenta(doc, plan);
  const ls = lineasDe(e.movs as MovLegado[]).map((l) => ({ ...l, debe: Math.round(l.debe), haber: Math.round(l.haber) }));
  const n = a.detalle?.lineas.length ?? 0;
  const propias = a.detalle?.lineas ?? [];
  // Las primeras n líneas del motor son las del paso 2 si coinciden en cuenta (con cuenta vacía el motor puede omitirlas)
  const coincide = propias.every((l, i) => ls[i] && ls[i].cuenta === (l.cuenta || '').replace(/[^0-9]/g, ''));
  return ls.map((l, i) => ({
    ...l,
    origen: coincide && i < n ? i : null,
    ...(!l.glosa?.trim() && esCuentaImpuesto(l.cuenta) ? { glosa: plan.nombre(l.cuenta) || undefined } : {}),
  }));
}

/** Período más frecuente entre las fechas de los documentos (YYYY-MM). */
export function periodoSugerido(docs: Pick<DocRCV, 'fecha'>[]): string {
  const cuenta = new Map<string, number>();
  for (const d of docs) cuenta.set(d.fecha.slice(0, 7), (cuenta.get(d.fecha.slice(0, 7)) ?? 0) + 1);
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || b[0].localeCompare(a[0]))[0]?.[0] ?? '';
}
