import { describe, it, expect } from 'vitest';
import oro from '../__fixtures__/f29-oro.json';
import { calcularF29Anual, reajustarRemanente, montoDeclarado, type EntradaF29 } from '../f29';

interface Caso { nombre: string; entrada: Record<string, unknown> & { tasaPPM: number; anterior: object; items: object; ventas: never[]; compras: never[]; honorarios: never[]; asientos: { anulado?: boolean; tipo: string; fecha: string; periodo?: string; movs: { cd: string; debe: number; haber: number }[] }[] }; resultado: unknown[] }

const NUEVOS = new Set([758, 759, 511, 115, 595, 556, 557, 558, 543, 598, 573, 547]);

describe('F29 (igual al sistema actual)', () => {
  for (const c of (oro as unknown as { casos: Caso[] }).casos) {
    it(c.nombre, () => {
      const iusc: Record<string, number> = {};
      for (const a of c.entrada.asientos) {
        if (a.anulado || a.tipo !== 'remuneraciones') continue;
        const p = a.periodo ?? a.fecha.slice(0, 7);
        iusc[p] = (iusc[p] ?? 0) + a.movs.reduce((s, m) => s + (m.cd === '2104002' ? m.haber - m.debe : 0), 0);
      }
      const e: EntradaF29 = {
        anio: 2026, tasaPPM: c.entrada.tasaPPM, ventas: c.entrada.ventas, compras: c.entrada.compras, honorarios: c.entrada.honorarios,
        iusc, declaraciones: c.entrada.items as EntradaF29['declaraciones'], anteriores: c.entrada.anterior as EntradaF29['anteriores'],
      };
      // remanenteCorregido y desactualizado son de 10z5 (el sistema anterior no los tenía)
      // Los campos y códigos agregados después (tasa por mes, manuales, anticipo, 511/595/547…) se prueban aparte
      const r = calcularF29Anual(e).map((x) => {
        const y: Partial<typeof x> = { ...x };
        for (const k of ['remanenteCorregido', 'desactualizado', 'tasaPPM', 'tasaPPMFuente', 'c557Fuente', 'manuales'] as const) delete y[k];
        y.codigos = Object.fromEntries(Object.entries(x.codigos).filter(([k]) => !NUEVOS.has(+k)));
        y.detalleVentas = { ...x.detalleVentas, comprobantes: undefined } as unknown as typeof x.detalleVentas;
        y.detalleCompras = { ...x.detalleCompras, electronicos: undefined } as unknown as typeof x.detalleCompras;
        return y;
      });
      expect(JSON.parse(JSON.stringify(r))).toEqual(c.resultado);
    });
  }
  it('reajuste del remanente como el SII (ej. dic-2024)', () => {
    expect(reajustarRemanente(176181, 67429, 67294)).toEqual({ monto: 175637, utm: 2.61, reajustado: true });
  });
});

import { compensacionIVA, pagoF29, montosSugeridos } from '../asientos-f29';
describe('asientos del F29', () => {
  const caso = (oro as unknown as { casos: { resultado: unknown[] }[] }).casos[1];
  const meses = caso.resultado as Parameters<typeof compensacionIVA>[0][];
  it('la compensación cuadra en todos los meses (con y sin PPM)', () => {
    for (const m of meses) {
      expect(compensacionIVA(m, 2026, false).cuadra, `mes ${m.m}`).toBe(true);
      expect(compensacionIVA(m, 2026, true).cuadra).toBe(true);
    }
  });
  it('mayo: imputa el remanente y deja IVA a pagar en 2104002 cuando corresponde', () => {
    const may = meses[4];
    const c = compensacionIVA(may, 2026, false);
    expect(c.lineas.find((l) => l.cuenta === '2103003')?.debe).toBe(950000);
    const rem = c.lineas.find((l) => l.cuenta === '1108007');
    expect(rem && rem.haber > 0 ? rem.haber : rem?.debe).toBeDefined();
  });
  it('pago F29 suma conceptos y abona el banco', () => {
    const p = pagoF29(meses[0], 2026, montosSugeridos(meses[0]), '1101201');
    expect(p.lineas.at(-1)).toMatchObject({ cuenta: '1101201', haber: p.total });
    expect(p.total).toBe(meses[0].ppm + meses[0].retencionHon + meses[0].iusc + meses[0].ivaAPagar);
  });
});

describe('F29: declarado, retenciones e impuesto único', () => {
  const base: EntradaF29 = { anio: 2026, tasaPPM: 1, ventas: [], compras: [], honorarios: [], iusc: {}, declaraciones: {}, anteriores: {} };

  it('lee lo digitado con separador de miles', () => {
    expect(montoDeclarado('5.887.130')).toBe(5887130);
    expect(montoDeclarado('$ 1.234')).toBe(1234);
    expect(montoDeclarado(42)).toBe(42);
    expect(montoDeclarado('')).toBeNull();
    expect(montoDeclarado('abc')).toBeNull();
  });

  it('impuesto único y retención de honorarios entran solos al cód. 48, 151 y al total 91', () => {
    const r = calcularF29Anual({ ...base, iusc: { '2026-04': 35210 }, honorarios: [{ mes: 4, bruto: 1000000, tasaRetencion: 0.1525 }] })[3];
    expect(r.codigos[48]).toBe(35210);
    expect(r.codigos[151]).toBe(152500);
    expect(r.codigos[91]).toBe(35210 + 152500);
  });

  it('sin boletas en el mes, toma la retención contabilizada en 2103002; con boletas no la suma dos veces', () => {
    const sinBoletas = calcularF29Anual({ ...base, retencionLibro: { '2026-05': 76250 } })[4];
    expect(sinBoletas.codigos[151]).toBe(76250);
    const conBoletas = calcularF29Anual({ ...base, honorarios: [{ mes: 5, bruto: 500000, retencion: 76250 }], retencionLibro: { '2026-05': 76250 } })[4];
    expect(conBoletas.codigos[151]).toBe(76250);
  });
});

describe('F29: correcciones del remanente se arrastran a los meses siguientes', () => {
  const base = (declaraciones: EntradaF29['declaraciones'] = {}): EntradaF29 => ({
    anio: 2026, tasaPPM: 0, ventas: [], compras: [], honorarios: [], iusc: {}, declaraciones,
    anteriores: { '2025-12': { periodo: '2025-12', estado: 'presentado', declarado: { '77': 1000000 } } },
  });
  it('una corrección en marzo cambia marzo y todo lo que sigue (borradores)', () => {
    const sin = calcularF29Anual(base());
    const con = calcularF29Anual(base({ '2026-03': { periodo: '2026-03', estado: 'borrador', remanenteInicial: 3000000 } }));
    expect(con[1].remanente).toBe(sin[1].remanente);
    expect(con[2]).toMatchObject({ remanenteAnt: 3000000, remanenteCorregido: true });
    expect(con[11].remanente).toBeGreaterThan(sin[11].remanente + 1900000);
  });
  it('un mes presentado arrastra lo declarado mientras siga al día', () => {
    const r0 = calcularF29Anual(base());
    const feb = { periodo: '2026-02', estado: 'presentado', declarado: { '504': r0[1].remanenteReaj, '77': 1234567 }, calculado: { '504': r0[1].remanenteReaj } };
    const r = calcularF29Anual(base({ '2026-02': feb }));
    expect(r[1].desactualizado).toBe(false);
    expect(r[2].remanenteAnt).toBe(1234567);
  });
  it('si se corrige un mes anterior, el presentado queda desactualizado y se arrastra lo calculado', () => {
    const r0 = calcularF29Anual(base());
    const feb = { periodo: '2026-02', estado: 'presentado', declarado: { '504': r0[1].remanenteReaj, '77': r0[1].remanente }, calculado: { '504': r0[1].remanenteReaj } };
    const r = calcularF29Anual(base({ '2026-01': { periodo: '2026-01', estado: 'borrador', remanenteInicial: 5000000 }, '2026-02': feb }));
    expect(r[1].desactualizado).toBe(true);
    expect(r[2].remanenteAnt).toBe(r[1].remanente);
    expect(r[2].remanenteAnt).toBeGreaterThan(5000000);
  });
});

describe('F29: corrección en un mes ya presentado', () => {
  it('enero presentado con 77 viejo y remanente corregido: febrero recibe lo recalculado', () => {
    const r = calcularF29Anual({
      anio: 2025, tasaPPM: 0, ventas: [], compras: [], honorarios: [], iusc: {}, anteriores: {},
      declaraciones: { '2025-01': { periodo: '2025-01', estado: 'presentado', declarado: { '504': 0, '77': 0 }, calculado: { '504': 0 }, remanenteInicial: 174964 } },
    });
    expect(r[0]).toMatchObject({ remanenteCorregido: true, desactualizado: true });
    expect(r[1].remanenteAnt).toBe(r[0].remanente);
    expect(r[1].remanenteAnt).toBeGreaterThan(170000);
  });
});

import { tasaPPMPeriodo } from '../f29';
describe('F29: tasa PPM por mes, códigos a mano y anticipo cambio de sujeto', () => {
  const base = (x: Partial<EntradaF29> = {}): EntradaF29 => ({
    anio: 2026, tasaPPM: 1, ventas: [], compras: [], honorarios: [], iusc: {}, declaraciones: {}, anteriores: {}, ...x,
  });
  const venta = (fecha: string, neto: number, tipoDTE = 33) => ({ tipoDTE, fecha, neto, exento: 0, iva: Math.round(neto * 0.19), total: Math.round(neto * 1.19) });

  it('la tasa grabada o manual de un mes manda sobre la de la empresa', () => {
    const e = base({
      tasaPPM: 2, ventas: [venta('2026-01-10', 1_000_000), venta('2026-02-10', 1_000_000), venta('2026-03-10', 1_000_000)],
      declaraciones: {
        '2026-01': { periodo: '2026-01', estado: 'presentado', ajustes: { tasaPPM: 1 } },
        '2026-02': { periodo: '2026-02', estado: 'borrador', ajustes: { tasaPPM: 0.5, tasaPPMManual: true } },
      },
    });
    const [ene, feb, mar] = calcularF29Anual(e);
    expect([ene.ppm, ene.tasaPPMFuente]).toEqual([10_000, 'guardada']);
    expect([feb.ppm, feb.tasaPPMFuente, feb.codigos[115]]).toEqual([5_000, 'manual', 0.5]);
    expect([mar.ppm, mar.tasaPPMFuente]).toEqual([20_000, 'empresa']);
    expect(tasaPPMPeriodo(null, 0.125)).toEqual({ tasa: 0.125, fuente: 'empresa' });
  });

  it('boletas y comprobantes a mano recalculan débito, base PPM y total', () => {
    const e = base({
      ventas: [venta('2026-01-10', 100_000, 39), venta('2026-01-11', 50_000, 48)],
      declaraciones: { '2026-01': { periodo: '2026-01', estado: 'borrador', ajustes: { manual: { '110': 40, '111': 38_000, '758': 7, '759': 19_000 } } } },
    });
    const [ene] = calcularF29Anual(e);
    expect(ene.codigos[110]).toBe(40);
    expect(ene.codigos[111]).toBe(38_000);
    expect(ene.codigos[758]).toBe(7);
    expect(ene.codigos[759]).toBe(19_000);
    expect(ene.debito).toBe(57_000);
    expect(ene.basePPM).toBe(300_000); // 38.000/0,19 + 19.000/0,19
    expect(ene.manuales).toEqual(['110', '111', '758', '759']);
    expect(ene.codigos[91]).toBe(57_000 + 3_000);
  });

  it('sin ajustes, el voucher (tipo 48) alimenta 758/759', () => {
    const [ene] = calcularF29Anual(base({ ventas: [venta('2026-01-11', 50_000, 48)] }));
    expect([ene.codigos[758], ene.codigos[759], ene.debito]).toEqual([1, 9_500, 9_500]);
  });

  it('anticipo: 573 de diciembre reajustado por UTM pasa a 557 de enero (F29 reales dic-2025 / ene-2026)', () => {
    const e = base({
      tasaPPM: 0.125,
      ventas: [venta('2026-01-10', 10_000_000)],
      anteriores: { '2025-12': { periodo: '2025-12', estado: 'presentado', declarado: { '573': 3_703, '77': 0 }, utm: 69_542 } },
      declaraciones: { '2026-01': { periodo: '2026-01', estado: 'borrador', utm: 69_751, ajustes: { anticipo: { '556': 910 } } } },
      utmExtra: { '2026-02': 69_611 },
    });
    const [ene, feb] = calcularF29Anual(e);
    expect(ene.codigos[557]).toBe(3_481);
    expect(ene.c557Fuente).toBe('arrastre');
    expect(ene.codigos[543]).toBe(4_391);
    expect(ene.codigos[598]).toBe(4_391);
    expect(ene.codigos[573]).toBe(0);
    expect(ene.codigos[595]).toBe(ene.ivaAPagar + ene.ppm);
    expect(ene.codigos[91]).toBe(ene.codigos[595] - 4_391);
    expect(ene.codigos[547]).toBe(ene.codigos[91]);
    expect(feb.codigos[557]).toBe(0);
  });

  it('anticipo mayor al IVA: el sobrante (573) se arrastra; 543 y 573 a mano mandan', () => {
    const e = base({
      ventas: [venta('2026-01-10', 10_000)],
      declaraciones: {
        '2026-01': { periodo: '2026-01', estado: 'borrador', ajustes: { anticipo: { '556': 5_000 }, remanenteAnticipoInicial: 0 } },
        '2026-03': { periodo: '2026-03', estado: 'borrador', ajustes: { manual: { '543': 800, '573': 100 } } },
      },
    });
    const [ene, feb, mar] = calcularF29Anual(e);
    expect([ene.codigos[598], ene.codigos[573]]).toEqual([1_900, 3_100]);
    expect(feb.codigos[557]).toBe(reajustarRemanente(3_100, ene.utmImputacion, feb.utmImputacion).monto); // reajustado por UTM
    expect([mar.codigos[543], mar.codigos[598], mar.codigos[573]]).toEqual([800, 0, 100]);
  });

  it('enero sin F29 de diciembre: usa el remanente de anticipo inicial ingresado', () => {
    const e = base({ declaraciones: { '2026-01': { periodo: '2026-01', estado: 'borrador', ajustes: { remanenteAnticipoInicial: 1_200 } } } });
    const [ene] = calcularF29Anual(e);
    expect(ene.codigos[557]).toBe(reajustarRemanente(1_200, ene.utmRemanenteAnt || ene.utmPeriodo, ene.utmImputacion).monto);
    expect(ene.codigos[557]).toBeGreaterThan(0);
  });
});

describe('pago sugerido con anticipo', () => {
  it('el IVA a pagar se rebaja por el anticipo imputado (598)', () => {
    const e: EntradaF29 = { anio: 2026, tasaPPM: 0, ventas: [{ tipoDTE: 33, fecha: '2026-01-10', neto: 100_000, iva: 19_000, total: 119_000 }], compras: [], honorarios: [], iusc: {},
      declaraciones: { '2026-01': { periodo: '2026-01', estado: 'borrador', ajustes: { anticipo: { '556': 4_000 } } } }, anteriores: {} };
    expect(montosSugeridos(calcularF29Anual(e)[0]).iva).toBe(15_000);
  });
});

describe('F29: resúmenes de boletas y comprobantes de pago electrónico', () => {
  it('110/111, 758/759 y 586 cuentan la cantidad de documentos del resumen', () => {
    const e: EntradaF29 = { anio: 2026, tasaPPM: 0, compras: [], honorarios: [], iusc: {}, declaraciones: {}, anteriores: {},
      ventas: [
        { tipoDTE: 39, fecha: '2026-10-01', neto: 84034, iva: 15966, total: 100000, cantidad: 350 },
        { tipoDTE: 39, fecha: '2026-10-02', neto: 8403, iva: 1597, total: 10000, cantidad: 20 },
        { tipoDTE: 48, fecha: '2026-10-02', neto: 42017, iva: 7983, total: 50000, cantidad: 12 },
        { tipoDTE: 41, fecha: '2026-10-03', exento: 3000, total: 3000, cantidad: 4 },
        { tipoDTE: 39, fecha: '2026-10-04', neto: 840, iva: 160, total: 1000 }, // boleta suelta: cuenta 1
      ] };
    const oct = calcularF29Anual(e)[9];
    expect([oct.codigos[110], oct.codigos[111]]).toEqual([371, 17723]);
    expect([oct.codigos[758], oct.codigos[759]]).toEqual([12, 7983]);
    expect([oct.codigos[586], oct.codigos[142]]).toEqual([4, 3000]);
    expect(oct.codigos[538]).toBe(17723 + 7983);
  });
});
