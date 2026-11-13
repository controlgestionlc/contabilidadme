// Costeo de ventas sin inventario permanente: costo del mes y ajuste contra el conteo físico.
// Uso: node --experimental-vm-modules tests/regresion-costeo.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../js/costeo.js', import.meta.url), 'utf8');

// Plan de cuentas recortado del estándar que usan las empresas
const PDC = [
  { cd: '1109', nm: 'EXISTENCIAS', tp: 'S' },
  { cd: '1109001', nm: 'MADERAS', tp: 'A' },
  { cd: '1109007', nm: 'MATERIAS PRIMAS', tp: 'A' },
  { cd: '1101101', nm: 'CAJA CENTRAL', tp: 'A' },
  { cd: '3101002', nm: 'COSTO VENTA PROVEEDORES', tp: 'C' },
  { cd: '3202024', nm: 'GASTOS GENERALES', tp: 'C' },
  { cd: '4101001', nm: 'INGRESOS FORESTALES', tp: 'I' },
  { cd: '4101002', nm: 'INGRESOS POR SERVICIOS', tp: 'I' },
];
const S = { empresa: { anio: 2026 }, asientos: [] };

const ctx = vm.createContext({ document: { getElementById: () => null }, window: {} });
const stub = (nombres, valores = {}) => new vm.SyntheticModule(nombres, function () {
  for (const n of nombres) this.setExport(n, valores[n] ?? (() => {}));
}, { context: ctx });
const mods = {
  './core.js': stub(['toast', 'fmtC', 'PDC', 'pdcNm'], {
    fmtC: (n) => '$' + Math.round(n), PDC, pdcNm: (cd) => (PDC.find((x) => x.cd === cd) || {}).nm || cd,
  }),
  './state.js': stub(['S'], { S }),
  './auth.js': stub(['puedeEditar'], { puedeEditar: () => true }),
  './asientos.js': stub(['proxFolioAsiento']),
  './contabilidad-v2.js': stub(['persistirAsientosCritico']),
  './empresa.js': stub(['updateHdr']),
};
for (const m of Object.values(mods)) { await m.link(() => {}); await m.evaluate(); }
const mod = new vm.SourceTextModule(src, { context: ctx });
await mod.link((spec) => mods[spec]);
await mod.evaluate();
const { costearMes, asientoConteo, margenSugerido, sugerirCuentas, datosMes, mesEnPalabras } = mod.namespace;

const cfg = (p = {}) => ({ metodo: 'margen', margen: 0.5, lineas: [], cuentaCosto: '3101002',
  cuentasExistencias: ['1109001'], mesesAviso: 6, ...p });
const mes = (p = {}) => ({ periodo: '2026-03', ventas: [{ cuenta: '4101001', neto: 1000000 }],
  comprasExistencias: 400000, saldos: [{ cuenta: '1109001', saldo: 5000000 }], comprasPromedio: 1000000, ...p });
const saldo = (ms, cd) => ms.filter((m) => m.cd === cd).reduce((s, m) => s + m.debe - m.haber, 0);
// El módulo corre en un sandbox: sus arreglos y objetos no comparten prototipo con los de aquí, así que
// deepEqual falla incluso con el mismo contenido. Se comparan serializados.
const igual = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);

// ═══ Margen deducido de la contabilidad ═══
// Pipa Gourmet ene-ago 2026: 41.386.855 de venta y 19.166.629 que entraron a existencias
assert.equal(margenSugerido(41386855, 19166629), 0.537, 'margen de la ventana');
assert.equal(margenSugerido(0, 100), null, 'sin ventas no hay margen');
assert.equal(margenSugerido(1000, 5000), null, 'compras muy por encima: datos incompletos');
assert.equal(margenSugerido(1000000, 10000), null, 'casi sin compras: tampoco');

// ═══ Costo del mes ═══
let r = costearMes(cfg({ margen: 0.4 }), mes());
assert.equal(r.costo, 600000, 'costo por margen');
assert.equal(r.cuadra, true, 'el asiento cuadra');
assert.equal(saldo(r.movs, '3101002'), 600000, 'costo al debe');
assert.equal(saldo(r.movs, '1109001'), -600000, 'existencias al haber');
assert.equal(r.saldoDespues, 4400000, 'saldo después');
igual(r.avisos, [], 'sin avisos');

// Compras del período: el costo son las compras, sin mirar las ventas
r = costearMes(cfg({ metodo: 'compras' }), mes({ comprasExistencias: 4000000, ventas: [{ cuenta: '4101001', neto: 600000 }] }));
assert.equal(r.costo, 4000000, 'costo por compras');
assert.ok(r.margenEfectivo < -5, 'así se ve el problema de este método');

// Margen por línea: cada cuenta de venta con su margen y su cuenta de costo
r = costearMes(
  cfg({ metodo: 'margen_linea', lineas: [
    { cuentaVenta: '4101001', margen: 0.5, cuentaCosto: '3202024' },
    { cuentaVenta: '4101002', margen: 0.2 },
  ] }),
  mes({ ventas: [{ cuenta: '4101001', neto: 1000000 }, { cuenta: '4101002', neto: 500000 }] }),
);
assert.equal(r.costo, 900000, 'costo por líneas');
assert.equal(saldo(r.movs, '3202024'), 500000, 'la línea con cuenta propia');
assert.equal(saldo(r.movs, '3101002'), 400000, 'la línea con la cuenta general');
assert.equal(r.cuadra, true, 'cuadra con varias cuentas de costo');

// Una venta sin margen configurado se avisa, no se costea en cero callado
r = costearMes(cfg({ metodo: 'margen_linea', lineas: [{ cuentaVenta: '4101001', margen: 0.5 }] }),
  mes({ ventas: [{ cuenta: '4101001', neto: 1000000 }, { cuenta: '4101002', neto: 800000 }] }));
assert.equal(r.costo, 500000, 'sólo costea lo configurado');
assert.ok(r.avisos.join(' ').includes('4101002'), 'avisa de la cuenta sin margen');

// Varias cuentas de existencias: a prorrata del saldo y sumando exacto
r = costearMes(cfg({ cuentasExistencias: ['1109001', '1109007'] }),
  mes({ saldos: [{ cuenta: '1109001', saldo: 12000000 }, { cuenta: '1109007', saldo: 6990371 }] }));
const haberes = r.movs.filter((m) => m.haber > 0);
assert.equal(haberes.length, 2, 'descarga de las dos cuentas');
assert.equal(haberes.reduce((s, m) => s + m.haber, 0), r.costo, 'el prorrateo suma exacto');
assert.equal(r.cuadra, true, 'cuadra con prorrateo');

// Avisos de control
r = costearMes(cfg(), mes({ saldos: [{ cuenta: '1109001', saldo: 100000 }] }));
assert.ok(r.saldoDespues < 0 && /bajo cero|muy bajo/.test(r.avisos.join(' ')), 'avisa saldo negativo');

// El caso real de Pipa Gourmet: 19 millones parados contra 2,4 de compra mensual
r = costearMes(cfg({ margen: 0.9 }), mes({ saldos: [{ cuenta: '1109001', saldo: 19166629 }], comprasPromedio: 2400000 }));
assert.ok(r.mesesDeCompra > 6 && r.avisos.join(' ').includes('margen está muy alto'), 'avisa existencias infladas');

r = costearMes(cfg(), mes({ ventas: [] }));
assert.equal(r.cuadra, false, 'sin ventas no hay asiento');
assert.ok(r.avisos.join(' ').includes('no hay nada que costear'), 'lo dice');

// ═══ Ajuste contra el conteo ═══
r = asientoConteo(cfg(), { fecha: '2026-12-31', contado: 4000000, saldos: [{ cuenta: '1109001', saldo: 19166629 }] });
assert.equal(r.diferencia, 15166629, 'diferencia a costo');
assert.equal(saldo(r.movs, '3101002'), 15166629, 'lo que sobra en libros va a costo');
assert.equal(saldo(r.movs, '1109001'), -15166629, 'sale de existencias');
assert.equal(r.cuadra, true, 'el ajuste cuadra');

r = asientoConteo(cfg(), { fecha: '2026-12-31', contado: 8000000, saldos: [{ cuenta: '1109001', saldo: 5000000 }] });
assert.equal(r.diferencia, -3000000, 'diferencia a favor de existencias');
assert.equal(saldo(r.movs, '1109001'), 3000000, 'vuelve a existencias');
assert.equal(saldo(r.movs, '3101002'), -3000000, 'contra costo');

r = asientoConteo(cfg(), { fecha: '2026-12-31', contado: 5000000, saldos: [{ cuenta: '1109001', saldo: 5000000 }] });
assert.equal(r.movs.length, 0, 'conteo que calza no genera asiento');

r = asientoConteo(cfg(), { fecha: '2026-12-31', contado: 500000, saldos: [{ cuenta: '1109001', saldo: 5000000 }] });
assert.ok(r.avisos.join(' ').includes('precio de venta'), 'avisa de una diferencia desmedida');

// ═══ Cuentas propuestas desde el plan ═══
igual(sugerirCuentas(), { cuentaCosto: '3101002', cuentasExistencias: ['1109001', '1109007'] }, 'cuentas propuestas');

// ═══ Lectura de los asientos ═══
S.asientos = [
  { fecha: '2026-01-10', movs: [{ cd: '1109001', debe: 1000000, haber: 0 }, { cd: '1101101', debe: 0, haber: 1000000 }] },
  { fecha: '2026-01-20', movs: [{ cd: '1101101', debe: 500000, haber: 0 }, { cd: '4101001', debe: 0, haber: 500000 }] },
  { fecha: '2026-02-05', movs: [{ cd: '1109001', debe: 600000, haber: 0 }, { cd: '1101101', debe: 0, haber: 600000 }] },
  { fecha: '2026-02-25', movs: [{ cd: '1101101', debe: 900000, haber: 0 }, { cd: '4101001', debe: 0, haber: 700000 }, { cd: '4101002', debe: 0, haber: 200000 }] },
  { fecha: '2026-02-28', anulado: true, movs: [{ cd: '1101101', debe: 9999999, haber: 0 }, { cd: '4101001', debe: 0, haber: 9999999 }] },
];
const m1 = datosMes('2026-01');
igual(m1.ventas, [{ cuenta: '4101001', neto: 500000 }], 'ventas de enero');
// Sin cuentas de existencias configuradas todavía, las compras no se pueden identificar
assert.equal(m1.comprasExistencias, 0, 'sin configuración no hay compras a existencias');

const m2 = datosMes('2026-02');
igual(m2.ventas, [{ cuenta: '4101001', neto: 700000 }, { cuenta: '4101002', neto: 200000 }], 'ventas de febrero por cuenta');
assert.ok(!m2.ventas.some((v) => v.neto > 1000000), 'el asiento anulado no cuenta');

assert.equal(mesEnPalabras('2026-03'), 'marzo de 2026', 'mes en palabras');

export {};
