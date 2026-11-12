// Asiento del resultado del F22 (devolución o pago del impuesto a la renta).
// Uso: node --experimental-vm-modules tests/regresion-f22.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const src = fs.readFileSync(new URL('../js/devrenta.js', import.meta.url), 'utf8');
const ctx = vm.createContext({ document: { getElementById: () => null } });
const stub = (nombres, valores = {}) => {
  const m = new vm.SyntheticModule(nombres, function () {
    for (const n of nombres) this.setExport(n, valores[n] ?? (() => {}));
  }, { context: ctx });
  return m;
};
const mods = {
  './core.js': stub(['toast', 'fmtC', 'PDC', 'pdcNm'], { fmtC: (n) => '$' + Math.round(n), PDC: [], pdcNm: (cd) => cd }),
  './state.js': stub(['S'], { S: { empresa: { anio: 2026 }, asientos: [] } }),
  './auth.js': stub(['puedeEditar'], { puedeEditar: () => true }),
  './renta.js': stub(['calcularRenta', 'cargarRenta']),
  './asientos.js': stub(['proxFolioAsiento']),
  './contabilidad-v2.js': stub(['persistirAsientosCritico']),
  './empresa.js': stub(['updateHdr']),
};
for (const m of Object.values(mods)) { await m.link(() => {}); await m.evaluate(); }
const mod = new vm.SourceTextModule(src, { context: ctx });
await mod.link((spec) => mods[spec]);
await mod.evaluate();
const { asientoF22, revisarF22, CUENTAS_F22 } = mod.namespace;

const base = (p = {}) => ({ anio: 2025, modo: 'devolucion', idpc: 0, ppmReajustado: 0, solicitado: 0,
  ppmContable: 0, monto: 0, fecha: '2026-05-20', cuentaBanco: '1101202', folio: '123456', fechaPresentacion: '', notas: '', ...p });
const saldo = (ms, cd) => ms.filter((m) => m.cd === cd).reduce((s, m) => s + m.debe - m.haber, 0);

// Devolución: PPM contable 500.000, reajustados 515.000, impuesto 100.000 → llegan 415.000
let r = asientoF22(base({ idpc: 100000, ppmContable: 500000, ppmReajustado: 515000, solicitado: 415000, monto: 415000 }));
assert.equal(r.cuadra, true, 'devolución cuadra');
assert.equal(saldo(r.movs, '1101202'), 415000, 'banco al debe');
assert.equal(saldo(r.movs, CUENTAS_F22.impuesto), 100000, 'impuesto al debe');
assert.equal(saldo(r.movs, CUENTAS_F22.ppm), -500000, 'PPM al haber');
assert.equal(saldo(r.movs, CUENTAS_F22.correccion), -15000, 'reajuste al haber');

// A pagar: PPM contable 700.000, reajustados 720.000, impuesto 1.000.000 → se pagan 280.000
r = asientoF22(base({ modo: 'pago', idpc: 1000000, ppmContable: 700000, ppmReajustado: 720000, solicitado: 280000, monto: 280000 }));
assert.equal(r.cuadra, true, 'pago cuadra');
assert.equal(saldo(r.movs, '1101202'), -280000, 'banco al haber');
assert.equal(saldo(r.movs, CUENTAS_F22.impuesto), 1000000, 'impuesto al debe');
assert.equal(saldo(r.movs, CUENTAS_F22.correccion), -20000, 'reajuste al haber');

// Sin reajuste no se agrega la línea de corrección monetaria
r = asientoF22(base({ idpc: 100000, ppmContable: 500000, solicitado: 400000, monto: 400000 }));
assert.equal(r.movs.some((m) => m.cd === CUENTAS_F22.correccion), false, 'sin línea de corrección');

// Deflación: el reajuste queda al debe
r = asientoF22(base({ ppmContable: 500000, solicitado: 495000, monto: 495000 }));
assert.equal(saldo(r.movs, CUENTAS_F22.correccion), 5000, 'reajuste negativo al debe');

// Cuadra siempre, cualquiera sea el monto
for (const monto of [0, 1, 250000, 415000, 900000]) {
  const x = asientoF22(base({ idpc: 100000, ppmContable: 500000, monto }));
  assert.equal(x.debe, x.haber, 'cuadra con monto ' + monto);
}

// Avisos
assert.match(revisarF22(base()).join(' '), /monto transferido/i, 'pide el monto');
assert.match(revisarF22(base({ idpc: 100000, ppmContable: 500000, solicitado: 415000, monto: 300000 })).join(' '),
  /no coincide con el F22/i, 'avisa diferencia con el F22');
assert.equal(revisarF22(base({ idpc: 100000, ppmContable: 500000, ppmReajustado: 515000, solicitado: 415000, monto: 415000 })).length, 0, 'sin avisos');

console.log('ok asiento del F22');
