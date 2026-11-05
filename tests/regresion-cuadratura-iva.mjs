// Cuadratura del IVA débito fiscal (2103003) y reconocimiento de las
// compensaciones del F29 que no llevan la marca interna.
//
// Los dos casos que se prueban aquí se encontraron en datos reales:
//   · boletas y comprobantes digitados en el F29 sin documento de venta detrás,
//     que dejan un saldo deudor igual a lo digitado;
//   · una compensación importada más otra generada encima, que carga el débito
//     dos veces porque la importada no se veía.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const S = { empresa: { anio: 2026, nombre: 'Prueba', rut: '76.684.700-3', tasaPPM: 0 },
  ventas: [], compras: [], honorarios: [], asientos: [], apertura: null, f29: {} };

const ctx = vm.createContext({ console, Date, Math, JSON, Set, Map, Intl, String, Number, Object, Array, RegExp, setTimeout });
ctx.S_REF = S;
ctx.DIARIO_REF = [];
const modulo = async (code) => { const m = new vm.SourceTextModule(code, { context: ctx }); await m.link(() => {}); await m.evaluate(); return m; };

const state = await modulo('export const S=globalThis.S_REF;');
const core = await modulo(`
 export const MESES=${JSON.stringify(MESES)};
 export const IVA=0.19;
 export const fmtC=x=>'$'+Math.round(+x||0).toLocaleString('es-CL');
 export const fmt=x=>String(x);
 export const pdcNm=cd=>'IVA DÉBITO FISCAL';
 export const PDC=[{cd:'2103003'}];
 export const toast=()=>{};
 export const pn=x=>+x||0;
 const m={33:{nm:'Factura',signo:1,cuenta:'4101002'},39:{nm:'Boleta',signo:1,cuenta:'4101003'},48:{nm:'Comprobante',signo:1,cuenta:'4101003'},61:{nm:'NC',signo:-1,cuenta:'4101002'}};
 export const dteV=x=>m[+x]||null; export const dteC=x=>m[+x]||null;
 export const esDteHonorario=x=>+x===41;
`);
const indicadores = await modulo('export const retencionHonorarios=()=>0.1475; export const getIndicadores=()=>({utm:0});');
const asientos = await modulo('export const todosDocsCompras=()=>globalThis.S_REF.compras; export const todosDocsVentas=()=>globalThis.S_REF.ventas; export const proxFolioComprobante=()=>900;');
const buscador = await modulo('export const inputCuenta=()=>"";');
const reportes = await modulo('export const buildMayor=()=>({}); export const genDiario=()=>globalThis.DIARIO_REF;');
const firebase = await modulo('export const logAccion=()=>{};');
const ui = await modulo('export const rerender=()=>{};');
const pdc = await modulo('export const savePDC=()=>{};');
const auth = await modulo('export const puedeEditar=()=>true;');
const v2 = await modulo('export const ejercicioCerrado=()=>false; export const persistirAsientosCritico=async f=>{f();return{ok:true}};');
const motor = await modulo(`
 export const periodoContableCompra=d=>d.periodoContable||String(d.fecha||'').slice(0,7);
 export const tributacionCompra=()=>({facturaCompra:false,ivaRetenido:0});
 export const clasificacionIVACompra=()=>({recuperable:0,activoFijo:0,noRecuperable:0});
`);
const utmh = await modulo('export const utmDelPeriodo=()=>0; export const fuenteUTM=()=>""; export const cargarUTMHistorico=async()=>{}; export const asegurarUTMHistoricoAlDia=async()=>{};');
const storage = await modulo('export default {};');
const correl = await modulo('export const numeroMostrar=a=>a?.n??null;');

const src = fs.readFileSync(new URL('../js/tributario.js', import.meta.url), 'utf8');
const mod = new vm.SourceTextModule(src, { context: ctx });
await mod.link((spec) => ({
  './state.js': state, './core.js': core, './indicadores.js': indicadores, './asientos.js': asientos,
  './buscadorcuentas.js': buscador, './reportes.js': reportes, './firebase.js': firebase, './ui.js': ui,
  './pdc.js': pdc, './auth.js': auth, './contabilidad-v2.js': v2, './motor-contable.js': motor,
  './utm-historico.js': utmh, './storage.js': storage, './correlativo-contable.js': correl,
}[spec]));
await mod.evaluate();
const { clasificarAsientoF29, esAsientoF29De, cuadraturaDebitoIVA, asientoIVAExistente, F29DECL } = mod.namespace;
// Los objetos nacen dentro del contexto vm, con otro prototipo: se comparan por campo.
const clasif = (a) => { const c = clasificarAsientoF29(a); return c ? `${c.origen}|${c.periodo}` : null; };

// ── Reconocer la compensación aunque no lleve la marca interna ──
assert.equal(clasif({ origenAuto: 'ivaf29', periodoIVA: '2026-01' }), 'ivaf29|2026-01', 'con marca interna');
assert.equal(clasif({ glosa: 'Compensación IVA Enero 2026 — F29', fecha: '2026-01-31' }), 'ivaf29|2026-01', 'importada, por la glosa');
assert.equal(clasif({ glosa: 'Compensacion IVA Febrero 2026', fecha: '2026-02-28' }), 'ivaf29|2026-02', 'sin tildes');
assert.equal(clasif({ glosa: 'Pago F29 Enero 2026', fecha: '2026-02-12' }), 'pagof29|2026-01', 'el pago pertenece al mes que paga, no al de su fecha');
assert.equal(clasif({ glosa: 'Compensación IVA del período', fecha: '2026-05-31' }), 'ivaf29|2026-05', 'sin mes en la glosa, por la fecha');
assert.equal(clasif({ glosa: 'Provisión de vacaciones', fecha: '2026-01-31' }), null, 'otro asiento queda fuera');
assert.equal(esAsientoF29De({ glosa: 'Compensación IVA Enero 2026 — F29', fecha: '2026-01-31' }, '2026-02', 'ivaf29'), false,
  'no confunde el mes');

// ── Escenario común ──
const venta = (n, fecha, iva, tipoDTE = 33) => ({ id: 'v' + n, fecha, tipoDTE, numero: String(n),
  rutCodigo: '11111111', rutDV: '1', razonSocial: 'Cliente', neto: Math.round(iva / 0.19), exento: 0, iva, total: Math.round(iva / 0.19) + iva });
const asientoComp = (n, monto, extra = {}) => ({ id: 'a' + n, n, folioComp: n, fecha: '2026-01-31',
  glosa: 'Compensación IVA Enero 2026 — F29', movs: [{ cd: '2103003', debe: monto, haber: 0 }, { cd: '1108002', debe: 0, haber: monto }], ...extra });
const eVenta = (v) => ({ n: 1, fecha: v.fecha, glosa: 'venta', origen: 'legado-auto', fuente: 'ventas',
  movs: [{ cd: '2103003', debe: 0, haber: v.iva }, { cd: '4101002', debe: 0, haber: v.neto }, { cd: '1104001', debe: v.total, haber: 0 }] });
const eAsiento = (a) => ({ n: a.n, fecha: a.fecha, glosa: a.glosa, movs: a.movs, origen: 'manual', ref: a.n,
  asientoId: a.id, origenAuto: a.origenAuto, periodoIVA: a.periodoIVA });
const montar = ({ ventas = [], asts = [], manual = null, diarioExtra = [] }) => {
  S.ventas = ventas; S.compras = []; S.honorarios = []; S.asientos = asts; S.apertura = null;
  F29DECL.anio = 2026; F29DECL.loaded = true;
  F29DECL.items = manual ? { '2026-01': { periodo: '2026-01', estado: 'borrador', manual } } : {};
  ctx.DIARIO_REF = [...ventas.map(eVenta), ...asts.filter(a => !a.anulado).map(eAsiento), ...diarioExtra];
};

const vs = [venta(5, '2026-01-05', 176895), venta(6, '2026-01-22', 30780)];   // 207.675 de IVA

// ── Mes que cuadra ──
montar({ ventas: vs, asts: [asientoComp(100, 207675, { origenAuto: 'ivaf29', periodoIVA: '2026-01' })] });
let c = cuadraturaDebitoIVA()[0];
assert.equal(c.ventas, 207675, 'abonado por las ventas');
assert.equal(c.compensacion, 207675, 'cargado por la compensación');
assert.equal(c.saldo, 0, 'la cuenta queda en cero');
assert.equal(c.causa, 'cuadra');

// ── Caso Pipa Gourmet: boletas y comprobantes digitados sin documento ──
montar({ ventas: vs, asts: [asientoComp(100, 208712, { origenAuto: 'ivaf29', periodoIVA: '2026-01' })],
  manual: { '110': 1, '111': 319, '758': 2, '759': 718 } });
c = cuadraturaDebitoIVA()[0];
assert.equal(c.debitoF29, 208712, 'el débito del F29 incluye lo digitado');
assert.equal(c.saldo, 1037, 'queda el saldo de lo digitado sin respaldo');
assert.equal(c.digitadoSinDoc, 1037, '319 de boletas más 718 de comprobantes');
assert.equal(c.causa, 'digitado-sin-documento');

// ── Con los documentos cargados, lo digitado deja de ser un descuadre ──
montar({ ventas: [...vs, venta(7, '2026-01-28', 319, 39), venta(8, '2026-01-29', 718, 48)],
  asts: [asientoComp(100, 208712, { origenAuto: 'ivaf29', periodoIVA: '2026-01' })],
  manual: { '110': 1, '111': 319, '758': 2, '759': 718 } });
c = cuadraturaDebitoIVA()[0];
assert.equal(c.digitadoSinDoc, 0, 'los documentos respaldan lo digitado');
assert.equal(c.saldo, 0);
assert.equal(c.causa, 'cuadra');

// ── Caso La Cabaña: una importada sin marca más otra generada encima ──
const importada = asientoComp(218, 207675);                                   // sin origenAuto
const generada = asientoComp(234, 207675, { origenAuto: 'ivaf29', periodoIVA: '2026-01' });
montar({ ventas: vs, asts: [importada, generada] });
c = cuadraturaDebitoIVA()[0];
assert.equal(c.nComp, 2, 'cuenta las dos compensaciones');
assert.equal(c.saldo, 207675, 'el débito quedó cargado dos veces');
assert.equal(c.causa, 'duplicada');
assert.equal(asientoIVAExistente('2026-01').id, 'a218',
  'la importada ahora se ve, así que regenerar la reemplaza en vez de crear una tercera');

// ── Compensación desactualizada por una venta posterior ──
montar({ ventas: [...vs, venta(9, '2026-01-28', 50000)],
  asts: [asientoComp(100, 207675, { origenAuto: 'ivaf29', periodoIVA: '2026-01' })] });
c = cuadraturaDebitoIVA()[0];
assert.equal(c.saldo, -50000, 'sobra abono por la venta nueva');
assert.equal(c.causa, 'desactualizada');

// ── Mes con ventas y sin compensar todavía: no es un error ──
montar({ ventas: vs, asts: [] });
assert.equal(cuadraturaDebitoIVA()[0].causa, 'sin-compensar');

// ── Una compensación anulada no cuenta ──
montar({ ventas: vs, asts: [asientoComp(218, 207675, { anulado: true }), asientoComp(234, 207675, { origenAuto: 'ivaf29', periodoIVA: '2026-01' })] });
c = cuadraturaDebitoIVA()[0];
assert.equal(c.nComp, 1, 'solo la vigente');
assert.equal(c.causa, 'cuadra');

// ── El saldo de apertura es legítimo y no descuadra el mes ──
montar({ ventas: vs, asts: [asientoComp(100, 207675, { origenAuto: 'ivaf29', periodoIVA: '2026-01' })],
  diarioExtra: [{ n: 0, fecha: '2026-01-01', glosa: 'Balance de Apertura', origen: 'apertura', movs: [{ cd: '2103003', debe: 0, haber: 3120000 }] }] });
c = cuadraturaDebitoIVA()[0];
assert.equal(c.apertura, -3120000, 'la apertura va aparte');
assert.equal(c.causa, 'cuadra', 'el mes sigue cuadrando');

console.log('✅ cuadratura del IVA débito: 24 comprobaciones');
