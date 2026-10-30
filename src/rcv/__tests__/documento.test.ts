import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { leerCSV } from '../leer';
import { construirRegistro, periodoSugerido } from '../documento';
import { lineasIniciales } from '../detalle';
import { PlanCuentas } from '@/motor/plan-cuentas';
import pdc from '@/motor/__fixtures__/pdc-base.json';

const FX = path.resolve(__dirname, '../__fixtures__');
const plan = new PlanCuentas(pdc);
const compras = leerCSV(fs.readFileSync(path.join(FX, 'rcv-compras.csv'), 'utf8'), 'compra').docs;
const ventas = leerCSV(fs.readFileSync(path.join(FX, 'rcv-ventas.csv'), 'utf8'), 'venta').docs;
const por = (folio: string) => compras.find((d) => d.numero === folio)!;
const cuadra = (l: { debe: number; haber: number }[]) => l.reduce((s, x) => s + x.debe - x.haber, 0);

describe('registro de documentos RCV', () => {
  it('el documento registrado guarda el registro completo del SII', () => {
    const d = compras[0];
    const r = construirRegistro('compra', d, d.fecha.slice(0, 7), { cuenta: '3202024' }, plan);
    expect(r.ok && r.registro.documento.datos.registroSII).toEqual(d.registroSII);
  });
  it('sólo las líneas de impuestos llevan como detalle el nombre de su cuenta', () => {
    const c = compras.find((d) => d.iva > 0 && d.tipoDTE === 33)!;
    const rc = construirRegistro('compra', c, c.fecha.slice(0, 7) < '2026-03' ? '2026-03' : c.fecha.slice(0, 7), { cuenta: '3202024' }, plan);
    expect(rc.ok && rc.registro.asiento.lineas.find((l) => l.cuenta === '1108002')?.glosa).toBe(plan.nombre('1108002'));
    const v = ventas.find((d) => d.iva > 0)!;
    const rv = construirRegistro('venta', v, v.fecha.slice(0, 7), { cuenta: '4101001' }, plan);
    expect(rv.ok && rv.registro.asiento.lineas.find((l) => l.cuenta === '2103003')?.glosa).toBe(plan.nombre('2103003'));
    // La línea de gasto no recibe el nombre de la cuenta (su detalle se escribe en el paso 2)
    expect(rc.ok && rc.registro.asiento.lineas.find((l) => l.cuenta === '3202024')?.glosa).not.toBe(plan.nombre('3202024'));
  });
  it('sugiere el período más frecuente', () => expect(periodoSugerido(compras)).toBe('2026-03'));

  it('todas las compras del archivo generan asientos cuadrados con cuenta rápida', () => {
    for (const d of compras) {
      const r = construirRegistro('compra', d, '2026-03', { cuenta: '3202010' }, plan);
      expect(r.ok, `${d.tipoDTE} ${d.numero}: ${r.ok ? '' : r.errores.join(' ')}`).toBe(true);
      if (r.ok) {
        expect(cuadra(r.registro.asiento.lineas)).toBe(0);
        expect(r.registro.asiento.lineas.find((l) => l.cuenta === '2102001')?.rut).toBe(`${d.rutCodigo}-${d.rutDV}`);
      }
    }
  });

  it('documento del mes anterior se contabiliza el día 1 del período', () => {
    const r = construirRegistro('compra', por('584509'), '2026-03', { cuenta: '3202010' }, plan);
    expect(r.ok && r.registro.asiento.fecha).toBe('2026-03-01');
  });

  it('paso 2 con otro impuesto en cuenta propia y centros de costo', () => {
    const d = por('584509');
    const lineas = lineasIniciales('compra', { ...d, cuenta: '3202010' });
    lineas[1].cuenta = '3202011';
    lineas[0].cc = 'FES-1';
    const r = construirRegistro('compra', d, '2026-03', { detalle: { lineas, glosa: 'Combustible tractor', aceptaRedondeo: true } }, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const l = r.registro.asiento.lineas;
    expect(l.find((x) => x.cuenta === '3202011')?.debe).toBe(21363);
    expect(l.find((x) => x.cuenta === '3202010')?.cc).toBe('FES-1');
    expect(r.registro.asiento.glosa).toContain('Combustible tractor');
    expect(cuadra(l)).toBe(0);
  });

  it('paso 2: con IVA del RCV distinto del 19% calculado se registra con los valores del RCV', () => {
    const base = por('584509');
    const d = { ...base, neto: 1100264, exento: 0, iva: 209048, otrosImpuestos: 423243, total: 1732555, otrosImpuestosDetalle: [{ tipo: '35', monto: 358176 }, { tipo: '28', monto: 65067 }] };
    const lineas = lineasIniciales('compra', { ...d, cuenta: '3202010' }).map((l) => ({ ...l, desc: l.desc || 'Diesel' }));
    const r = construirRegistro('compra', d, '2026-03', { detalle: { lineas, glosa: 'Combustible' } }, plan);
    expect(r.ok, r.ok ? '' : r.errores.join(' ')).toBe(true);
    if (!r.ok) return;
    const l = r.registro.asiento.lineas;
    expect(l.find((x) => x.cuenta === '1108002')?.debe).toBe(209048);
    expect(l.find((x) => x.cuenta === '2102001')?.haber).toBe(1732555);
    expect(cuadra(l)).toBe(0);
  });

  it('paso 2 inválido no se registra', () => {
    const r = construirRegistro('compra', por('100'), '2026-03', { detalle: { lineas: [{ cuenta: '3202010', monto: 1, afecto: true }] } }, plan);
    expect(r.ok).toBe(false);
  });

  it('sin cuenta o con cuenta agrupadora no se registra', () => {
    expect(construirRegistro('compra', por('100'), '2026-03', {}, plan).ok).toBe(false);
    expect(construirRegistro('compra', por('100'), '2026-03', { cuenta: '1' }, plan).ok).toBe(false);
  });

  it('ventas: factura y nota de crédito contra clientes, y venta al contado contra banco', () => {
    const f = construirRegistro('venta', ventas[0], '2026-03', { cuenta: '4101002' }, plan);
    const nc = construirRegistro('venta', ventas[1], '2026-03', { cuenta: '4101002' }, plan);
    const banco = construirRegistro('venta', ventas[3], '2026-03', { cuenta: '4101002', formaPago: 'banco' }, plan);
    expect(f.ok && nc.ok && banco.ok).toBe(true);
    if (!f.ok || !nc.ok || !banco.ok) return;
    expect(f.registro.asiento.lineas[0]).toMatchObject({ cuenta: '1104001', debe: 1190000, rut: '77684700-3' });
    expect(nc.registro.asiento.lineas[0]).toMatchObject({ cuenta: '1104001', haber: 119000 });
    expect(banco.registro.asiento.lineas[0]).toMatchObject({ cuenta: '1101201', debe: 61615 });
    expect(cuadra(banco.registro.asiento.lineas)).toBe(0);
  });

  it('ventas con tarjeta: cargo a 1107004 (por cobrar al operador), sin auxiliar de cliente', () => {
    const planT = new PlanCuentas([...(pdc as never[]), { cd: '1107004', nm: 'TARJETAS POR COBRAR (DÉBITO Y CRÉDITO)', tp: 'A', nat: 'D' } as never]);
    const t = construirRegistro('venta', ventas[3], '2026-03', { cuenta: '4101002', formaPago: 'tarjetas' }, planT);
    expect(t.ok).toBe(true);
    if (!t.ok) return;
    expect(t.registro.asiento.lineas[0]).toMatchObject({ cuenta: '1107004', debe: 61615 });
    expect(t.registro.asiento.lineas[0].rut ?? null).toBeNull();
    expect(cuadra(t.registro.asiento.lineas)).toBe(0);
  });
});

describe('resumen de boletas', () => {
  it('guarda la cantidad de documentos en el documento contable', () => {
    const d = { ...ventas[3], tipoDTE: 39, numero: 'R20260315', rutCodigo: '66666666', rutDV: '6', razonSocial: 'Ventas con boleta', cantidad: 350 };
    const r = construirRegistro('venta', d, '2026-03', { cuenta: '4101003', formaPago: 'banco' }, plan);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect((r.registro.documento.datos as { cantidad?: number }).cantidad).toBe(350);
    expect(r.registro.documento.folio).toBe('R20260315');
  });
});
