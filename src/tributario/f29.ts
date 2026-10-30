// Formulario 29 mensual: traslado fiel de calcularF29Anual (tributario.js) del sistema actual.
// IVA débito y crédito por códigos, remanente reajustado por UTM (art. 27 DL 825),
// PPM, retención de honorarios e impuesto único. Si un período fue presentado,
// el arrastre al mes siguiente es el remanente DECLARADO (cód. 77).

import { clasificacionIVACompra, tributacionCompra, periodoContableCompra, type Documento } from '@/motor/contable';
import { dteC, dteV, esDteHonorario, IVA } from '@/motor/dte';
import { retencionHonorarios } from '@/importador/respaldo';
import { UTM_SII } from './utm';

export interface DeclaracionF29 {
  periodo: string;
  estado: 'borrador' | 'presentado' | 'cerrado' | string;
  declarado?: Record<string, number>;
  utm?: number | null;
  /** Remanente del mes anterior (cód. 77) ingresado a mano: en enero, el de diciembre; en otro mes, una corrección. */
  remanenteInicial?: number | null;
  /** Foto de lo calculado al presentar (para saber si una corrección anterior dejó desactualizada la declaración). */
  calculado?: Record<string, number> | null;
  /** Ajustes del mes: tasa PPM congelada o manual, códigos digitados a mano y anticipo de cambio de sujeto. */
  ajustes?: AjustesF29 | null;
}

/** Códigos que se pueden ingresar a mano en el F29 del mes: reemplazan lo calculado y se recalcula. */
export const F29_MANUALES = ['110', '111', '758', '759', '563', '543', '573'] as const;
export const F29_ANTICIPO = ['556', '557', '558'] as const;
export interface AjustesF29 {
  /** Tasa PPM (%) con que se calculó el mes. Se graba al guardar; si es manual, la ingresó el usuario. */
  tasaPPM?: number | null;
  tasaPPMManual?: boolean;
  manual?: Partial<Record<(typeof F29_MANUALES)[number], number>>;
  anticipo?: Partial<Record<(typeof F29_ANTICIPO)[number], number>>;
  /** Sólo en enero sin F29 de diciembre: cód. 573 de diciembre del año anterior. */
  remanenteAnticipoInicial?: number | null;
}

export interface VentaF29 { tipoDTE: number; fecha: string; neto?: number; exento?: number; iva?: number; total?: number; estado?: string; excluidoAuto?: boolean;
  /** Resumen de boletas o comprobantes de pago electrónico: cantidad de documentos que agrupa (por defecto 1). */
  cantidad?: number }
export interface HonorarioF29 { mes?: number; bruto?: number; retencion?: number | null; tasaRetencion?: number | null; tipoRetencion?: string; estado?: string }

export interface EntradaF29 {
  anio: number;
  /** Tasa PPM de la empresa en porcentaje (1 = 1%). Cada mes puede tener la suya (ajustes.tasaPPM). */
  tasaPPM: number;
  ventas: VentaF29[];
  compras: Documento[];
  honorarios: HonorarioF29[];
  /** Impuesto único de segunda categoría por período (YYYY-MM) */
  iusc: Record<string, number>;
  /**
   * Retención de honorarios contabilizada por período (abonos netos a 2103002 fuera de los asientos del F29).
   * Se usa sólo en los meses sin boletas registradas, para no perder retenciones ingresadas por asiento.
   */
  retencionLibro?: Record<string, number>;
  /** Declaraciones del año */
  declaraciones: Record<string, DeclaracionF29>;
  /** Declaraciones del año anterior (diciembre para el remanente inicial) */
  anteriores: Record<string, DeclaracionF29>;
  /** UTM conocida por período (sobrescribe la tabla del SII) */
  utmExtra?: Record<string, number>;
}

export interface MesF29 {
  m: number; ventasNetas: number; ventasExentas: number; debito: number; ivaRetenido: number; debitoTotal: number;
  comprasNetas: number; credito: number; creditoActivoFijo: number; creditoMes: number; ivaNoRecuperable: number;
  remanenteAnt: number; remanenteReaj: number; reajusteRemanente: number; remanenteSinUTM: boolean; utmRemanenteAnt: number;
  utmPeriodo: number; utmImputacion: number; remanenteUTM: number; creditoTotal: number; ivaDeterminado: number;
  ivaAPagar: number; remanente: number; basePPM: number; ppm: number; retencionHon: number; iusc: number; totalPagar: number;
  /** Tasa PPM (%) usada en el mes y de dónde viene. */
  tasaPPM: number; tasaPPMFuente: 'empresa' | 'guardada' | 'manual';
  /** Cód. 557 ingresado a mano o arrastrado del 573 del mes anterior. */
  c557Fuente: 'manual' | 'arrastre';
  /** Códigos ingresados a mano en este mes. */
  manuales: string[];
  nDocsV: number; nDocsC: number; codigos: Record<number, number>;
  /** El remanente anterior viene de una corrección ingresada en este mes. */
  remanenteCorregido: boolean;
  /** Presentado, pero una corrección en un mes anterior cambió su remanente: hay que rectificarlo. Desde aquí se arrastra lo calculado. */
  desactualizado: boolean;
  detalleVentas: ReturnType<typeof detalleVentas>; detalleCompras: ReturnType<typeof detalleCompras>;
  declaracion: DeclaracionF29 | null;
}

/** Monto digitado: acepta número o texto con separador de miles ("5.887.130"). Vacío = sin declarar. */
export const montoDeclarado = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const t = String(v).trim().replace(/\$/g, '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n) : null;
};
export const CODIGOS_DECLARABLES = [503, 502, 110, 111, 758, 759, 538, 39, 511, 519, 520, 584, 562, 537, 504, 77, 89, 563, 62, 151, 48,
  595, 556, 557, 558, 543, 598, 573, 547, 91] as const;
/** Tipos de documento de compra electrónicos (cód. 511). */
const DTE_COMPRA_ELECTRONICOS = new Set([33, 34, 43, 46, 56, 61]);
/** Tasa PPM (%) del período: la grabada en su F29 (al guardar o a mano) o la de la empresa. */
export function tasaPPMPeriodo(d: DeclaracionF29 | null | undefined, tasaEmpresa: number) {
  const t = d?.ajustes?.tasaPPM;
  if (t != null && Number.isFinite(+t)) return { tasa: +t, fuente: (d!.ajustes!.tasaPPMManual ? 'manual' : 'guardada') as 'manual' | 'guardada' };
  return { tasa: +tasaEmpresa || 0, fuente: 'empresa' as const };
}
export const esPresentado = (d?: DeclaracionF29 | null) => !!(d && ['presentado', 'cerrado'].includes(d.estado));
const codDecl = (d: DeclaracionF29 | null | undefined, cod: number, def = 0) => {
  const v = d?.declarado?.[String(cod)];
  return v == null ? def : +v || 0;
};
export const periodoSiguiente = (p: string) => {
  const [y, m] = p.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
};
export function reajustarRemanente(monto: number, utmOrigen: number, utmDestino: number) {
  if (!(monto > 0) || !(utmOrigen > 0) || !(utmDestino > 0)) return { monto, utm: 0, reajustado: false };
  const utm = Math.round((monto / utmOrigen) * 100) / 100;
  return { monto: Math.round(utm * utmDestino), utm, reajustado: true };
}

function detalleVentas(vs: VentaF29[]) {
  const r = { facturas: { n: 0, iva: 0 }, boletas: { n: 0, iva: 0 }, comprobantes: { n: 0, iva: 0 }, nd: { n: 0, iva: 0 }, nc: { n: 0, iva: 0 }, exentas: { n: 0, monto: 0 } };
  for (const d of vs) {
    const t = +d.tipoDTE, iva = Math.abs(+(d.iva ?? 0) || 0), ex = Math.abs(+(d.exento ?? 0) || 0);
    // Un resumen de boletas o vouchers cuenta por la cantidad de documentos que agrupa
    const cant = Math.max(1, Math.round(+(d.cantidad ?? 1) || 1));
    if (t === 33) { r.facturas.n++; r.facturas.iva += iva; }
    else if (t === 39 || t === 35) { r.boletas.n += cant; r.boletas.iva += iva; }
    else if (t === 48) { r.comprobantes.n += cant; r.comprobantes.iva += iva; }
    else if (t === 56) { r.nd.n++; r.nd.iva += iva; }
    else if (t === 61) { r.nc.n++; r.nc.iva += iva; }
    else if (t === 34 || t === 41) { r.exentas.n += t === 41 ? cant : 1; r.exentas.monto += ex || Math.abs(+(d.total ?? 0) || 0); }
  }
  return r;
}

function detalleCompras(cs: Documento[]) {
  const r = { electronicos: { credito: 0 }, facturas: { n: 0, credito: 0 }, activoFijo: { n: 0, credito: 0 }, nd: { n: 0, credito: 0 }, nc: { n: 0, credito: 0 }, sinDerecho: { n: 0, neto: 0 }, exentas: { n: 0, monto: 0 } };
  for (const d of cs) {
    const t = +d.tipoDTE, ci = clasificacionIVACompra(d), rec = ci.recuperable;
    if (DTE_COMPRA_ELECTRONICOS.has(t)) r.electronicos.credito += rec * (t === 61 ? -1 : 1);
    if (t === 61) { r.nc.n++; r.nc.credito += rec; continue; }
    if (t === 56) { r.nd.n++; r.nd.credito += rec; continue; }
    if (t === 32 || t === 34) { r.exentas.n++; r.exentas.monto += Math.abs(+(d.exento || d.total || 0)); continue; }
    if (ci.activoFijo > 0) { r.activoFijo.n++; r.activoFijo.credito += ci.activoFijo; }
    const creditoGiro = Math.max(0, rec - ci.activoFijo);
    if (creditoGiro > 0) { r.facturas.n++; r.facturas.credito += creditoGiro; }
    if (ci.noRecuperable > 0) { r.sinDerecho.n++; r.sinDerecho.neto += Math.abs(+(d.neto ?? 0)); }
  }
  return r;
}

export function calcularF29Anual(e: EntradaF29): MesF29[] {
  const { anio } = e;
  const decl = (p: string) => e.declaraciones[p] ?? null;
  const utmPeriodo = (p: string) => {
    const guardada = +((decl(p) ?? e.anteriores[p])?.utm ?? 0) || 0;
    if (guardada > 0) return guardada;
    if (+(e.utmExtra?.[p] ?? 0) > 0) return +e.utmExtra![p];
    const [y, m] = p.split('-').map(Number);
    return +(UTM_SII[y]?.[m - 1] ?? 0) || 0;
  };
  const utmDeclaracion = (p: string) => utmPeriodo(periodoSiguiente(p));

  // Remanente inicial: cód. 77 del F29 de diciembre anterior; si no, el ingresado en enero.
  // (Si en enero se ingresó un remanente a mano, se toma como corrección dentro del ciclo.)
  const perDic = `${anio - 1}-12`;
  const dic = e.anteriores[perDic] ?? null;
  let remanenteAnt = 0;
  if (dic && (esPresentado(dic) || dic.declarado?.['77'] != null)) remanenteAnt = Math.max(0, codDecl(dic, 77, 0));
  let utmRemanenteAnt = remanenteAnt > 0 ? utmDeclaracion(perDic) : 0;

  // Anticipo cambio de sujeto: el remanente (cód. 573) de diciembre anterior entra como cód. 557 de enero.
  // Sin el 573 declarado en diciembre: el ingresado a mano, o se reconstruye con su anticipo (556 + 557 − 558 − 598).
  let remAnticipoAnt = (() => {
    if (!dic) return Math.max(0, +(e.declaraciones[`${anio}-01`]?.ajustes?.remanenteAnticipoInicial ?? 0) || 0);
    if (dic.declarado?.['573'] != null) return Math.max(0, codDecl(dic, 573, 0));
    const aj = dic.ajustes ?? {};
    if (aj.manual?.['573'] != null) return Math.max(0, +aj.manual['573'] || 0);
    const a = aj.anticipo ?? {};
    const t543 = aj.manual?.['543'] != null ? +aj.manual['543'] : Math.max(0, (+(a['556'] ?? 0) || 0) + (+(a['557'] ?? 0) || 0) - (+(a['558'] ?? 0) || 0));
    return Math.max(0, t543 - Math.min(t543, codDecl(dic, 89, 0)));
  })();
  // El remanente de anticipo se reajusta por UTM igual que el de IVA (cotejado con F29 reales dic-2025 → ene-2026).
  let utmAnticipoAnt = remAnticipoAnt > 0 ? utmDeclaracion(perDic) : 0;
  const ventasVigentes = e.ventas.filter((d) => d.estado !== 'anulado');
  const comprasVigentes = e.compras.filter((d) => d.estado !== 'anulado');
  const meses: MesF29[] = [];
  for (let m = 1; m <= 12; m++) {
    const per = `${anio}-${String(m).padStart(2, '0')}`;
    const vs = ventasVigentes.filter((d) => d.fecha.slice(0, 4) === String(anio) && +d.fecha.slice(5, 7) === m);
    const vdet = detalleVentas(vs);
    let ventasNetas = 0, ventasExentas = 0, debito = 0;
    for (const d of vs) {
      const s = dteV(d.tipoDTE)?.signo || 1;
      ventasNetas += (d.neto || 0) * s; ventasExentas += (d.exento || 0) * s; debito += (d.iva || 0) * s;
    }
    // Valores ingresados a mano: boletas (110/111) y comprobantes de pago electrónico (758/759) suelen venir de
    // resúmenes del SII. Reemplazan lo calculado; el débito y la base del PPM (neto = IVA ÷ 19 %) se recalculan.
    const dm = decl(per);
    const man = dm?.ajustes?.manual ?? {};
    const hayMan = (k: (typeof F29_MANUALES)[number]) => man[k] != null && Number.isFinite(+man[k]!);
    const vMan = (k: (typeof F29_MANUALES)[number]) => Math.max(0, Math.round(+man[k]! || 0));
    if (hayMan('110')) vdet.boletas.n = vMan('110');
    if (hayMan('111')) { const v = vMan('111'); debito += v - vdet.boletas.iva; ventasNetas += Math.round((v - vdet.boletas.iva) / IVA); vdet.boletas.iva = v; }
    if (hayMan('758')) vdet.comprobantes.n = vMan('758');
    if (hayMan('759')) { const v = vMan('759'); debito += v - vdet.comprobantes.iva; ventasNetas += Math.round((v - vdet.comprobantes.iva) / IVA); vdet.comprobantes.iva = v; }
    const cs = comprasVigentes.filter((d) => !esDteHonorario(d.tipoDTE) && periodoContableCompra(d) === per);
    const cdet = detalleCompras(cs);
    let comprasNetas = 0, credito = 0, creditoActivoFijo = 0, ivaNoRecuperable = 0, ivaRetenido = 0;
    for (const d of cs) {
      const s = dteC(d.tipoDTE)?.signo || 1;
      comprasNetas += (d.neto || 0) * s;
      const ci = clasificacionIVACompra(d);
      credito += (ci.recuperable - ci.activoFijo) * s;
      creditoActivoFijo += ci.activoFijo * s;
      ivaNoRecuperable += ci.noRecuperable * s;
      const tc = tributacionCompra(d);
      if (tc.facturaCompra) ivaRetenido += tc.ivaRetenido * s;
    }
    const creditoMes = credito + creditoActivoFijo;
    const honM = e.honorarios.filter((h) => h.estado !== 'anulado' && h.mes === m);
    const retencionHon = honM.length
      ? Math.round(honM.reduce((s, h) => s + (h.retencion != null
        ? Math.abs(+h.retencion || 0)
        : Math.round(Math.abs(+(h.bruto ?? 0) || 0) * (h.tasaRetencion != null ? +h.tasaRetencion : retencionHonorarios(anio)))), 0))
      : Math.max(0, Math.round(e.retencionLibro?.[per] ?? 0));
    const iusc = Math.max(0, Math.round(e.iusc[per] ?? 0));
    const utmP = utmPeriodo(per);
    const utmImputacion = utmDeclaracion(per);
    const d = dm;
    // Corrección del remanente anterior ingresada en este mes: manda sobre el arrastre.
    const remanenteCorregido = d?.remanenteInicial != null;
    if (remanenteCorregido) {
      remanenteAnt = Math.max(0, +(d!.remanenteInicial ?? 0) || 0);
      if (m === 1) utmRemanenteAnt = remanenteAnt > 0 ? utmDeclaracion(perDic) : 0;
    }
    const rr = reajustarRemanente(remanenteAnt, utmRemanenteAnt, utmImputacion);
    const remanenteReaj = rr.monto, remanenteUTM = rr.utm;
    const reajusteRemanente = remanenteReaj - remanenteAnt;
    const remanenteSinUTM = remanenteAnt > 0 && !rr.reajustado;
    const creditoTotal = creditoMes + remanenteReaj;
    const debitoTotal = debito + ivaRetenido;
    const ivaDeterminado = debitoTotal - creditoTotal;
    const ivaAPagar = ivaDeterminado > 0 ? ivaDeterminado : 0;
    const remanente = ivaDeterminado < 0 ? -ivaDeterminado : 0;
    const basePPM = hayMan('563') ? vMan('563') : ventasNetas + ventasExentas;
    const tp = tasaPPMPeriodo(d, e.tasaPPM);
    const ppm = Math.round(basePPM * tp.tasa / 100);
    // Anticipo cambio de sujeto: 556 del período (a mano) + 557 remanente anterior (573 del mes anterior reajustado,
    // o a mano) − 558 devolución = 543. Se imputa contra el IVA a pagar (598, tope cód. 89) y lo que sobra es el 573.
    const ant = d?.ajustes?.anticipo ?? {};
    const c556 = Math.max(0, Math.round(+(ant['556'] ?? 0) || 0));
    const rrAnt = reajustarRemanente(Math.max(0, Math.round(remAnticipoAnt)), utmAnticipoAnt, utmImputacion);
    const c557 = ant['557'] != null ? Math.max(0, Math.round(+ant['557'] || 0)) : Math.max(0, rrAnt.monto);
    const c558 = Math.max(0, Math.round(+(ant['558'] ?? 0) || 0));
    const c543 = hayMan('543') ? vMan('543') : Math.max(0, c556 + c557 - c558);
    const c598 = Math.min(c543, ivaAPagar);
    const c573 = hayMan('573') ? vMan('573') : c543 - c598;
    const subtotalAnverso = ivaAPagar + ppm + retencionHon + iusc; // cód. 595
    const totalPagar = subtotalAnverso - c598; // cód. 547 → 91
    const codigos: Record<number, number> = {
      503: vdet.facturas.n, 502: vdet.facturas.iva, 110: vdet.boletas.n, 111: vdet.boletas.iva, 758: vdet.comprobantes.n, 759: vdet.comprobantes.iva,
      512: vdet.nd.n, 513: vdet.nd.iva, 509: vdet.nc.n, 510: vdet.nc.iva, 586: vdet.exentas.n, 142: vdet.exentas.monto,
      538: debito,
      519: cdet.facturas.n, 520: cdet.facturas.credito, 524: cdet.activoFijo.n, 525: cdet.activoFijo.credito,
      527: cdet.nc.n, 528: cdet.nc.credito, 531: cdet.nd.n, 532: cdet.nd.credito,
      564: cdet.sinDerecho.n, 521: cdet.sinDerecho.neto, 584: cdet.exentas.n, 562: cdet.exentas.monto,
      504: remanenteReaj, 537: creditoTotal, 77: remanente, 89: ivaAPagar,
      563: basePPM, 62: ppm, 151: retencionHon, 48: iusc, 91: totalPagar, 39: ivaRetenido,
      511: Math.round(cdet.electronicos.credito), 115: tp.tasa,
      595: subtotalAnverso, 556: c556, 557: c557, 558: c558, 543: c543, 598: c598, 573: c573, 547: totalPagar,
    };
    // Arrastre al mes siguiente: lo declarado (cód. 77) si el F29 está presentado y sigue al día; si una corrección
    // (en este mes o en uno anterior) cambió su remanente (cód. 504), la declaración quedó desactualizada y se arrastra lo calculado.
    let desactualizado = false;
    let arrastre = remanente;
    if (esPresentado(d)) {
      const ref504 = d!.calculado?.['504'] ?? d!.declarado?.['504'];
      if (ref504 != null && Math.abs(remanenteReaj - +ref504) > Math.max(5, Math.abs(+ref504) * 0.002)) desactualizado = true;
      else arrastre = codDecl(d, 77, remanente);
    }
    meses.push({ m, ventasNetas, ventasExentas, debito, ivaRetenido, debitoTotal, comprasNetas, credito, creditoActivoFijo, creditoMes,
      ivaNoRecuperable, remanenteAnt, remanenteReaj, reajusteRemanente, remanenteSinUTM, utmRemanenteAnt, utmPeriodo: utmP, utmImputacion,
      remanenteUTM, creditoTotal, ivaDeterminado, ivaAPagar, remanente, basePPM, ppm, retencionHon, iusc, totalPagar,
      tasaPPM: tp.tasa, tasaPPMFuente: tp.fuente, c557Fuente: ant['557'] != null ? 'manual' : 'arrastre', manuales: F29_MANUALES.filter(hayMan),
      nDocsV: vs.length, nDocsC: cs.length, codigos, detalleVentas: vdet, detalleCompras: cdet, declaracion: d || null, remanenteCorregido, desactualizado });
    remanenteAnt = arrastre;
    utmRemanenteAnt = utmImputacion;
    remAnticipoAnt = esPresentado(d) ? codDecl(d, 573, c573) : c573;
    utmAnticipoAnt = utmImputacion;
  }
  return meses;
}

/** Diferencias entre lo calculado y lo declarado (códigos declarables). */
export function diferenciasF29(m: MesF29, d: DeclaracionF29 | null) {
  if (!d?.declarado) return [];
  return CODIGOS_DECLARABLES.filter((c) => d.declarado![String(c)] != null && Math.round(+d.declarado![String(c)]) !== Math.round(m.codigos[c] ?? 0))
    .map((c) => ({ codigo: c, calculado: m.codigos[c] ?? 0, declarado: +d.declarado![String(c)] }));
}
