// Catálogo de documentos tributarios del SII (traslado de core.js del sistema actual).

export interface DteInfo {
  cod: number;
  nm: string;
  afecto: boolean;
  signo?: number;
  cuenta?: string;
  honorario?: boolean;
  retencion?: boolean;
}

export const IVA = 0.19;

export const DTE_VENTAS: DteInfo[] = [
  { cod: 33, nm: 'Factura Electrónica', afecto: true, cuenta: '4101002', signo: 1 },
  { cod: 34, nm: 'Factura Exenta Electrónica', afecto: false, cuenta: '4101002', signo: 1 },
  { cod: 39, nm: 'Boleta Electrónica', afecto: true, cuenta: '4101003', signo: 1 },
  { cod: 41, nm: 'Boleta Exenta Electrónica', afecto: false, cuenta: '4101003', signo: 1 },
  { cod: 48, nm: 'Comprobante de Pago Electrónico', afecto: true, cuenta: '4101003', signo: 1 },
  { cod: 56, nm: 'Nota de Débito', afecto: true, cuenta: '4101002', signo: 1 },
  { cod: 61, nm: 'Nota de Crédito', afecto: true, cuenta: '4101002', signo: -1 },
];

/** Boletas (35/39/41) y comprobantes de pago electrónico (48): en ventas se registran como resumen del día o del mes. */
export const TIPOS_RESUMEN_VENTA = [35, 39, 41, 48];

export const DTE_COMPRAS: DteInfo[] = [
  { cod: 30, nm: 'Factura', afecto: true },
  { cod: 32, nm: 'Factura Exenta', afecto: false },
  { cod: 33, nm: 'Factura Electrónica', afecto: true },
  { cod: 34, nm: 'Factura Exenta Electrónica', afecto: false },
  { cod: 45, nm: 'Factura de Compra', afecto: true },
  { cod: 46, nm: 'Factura de Compra Electrónica', afecto: true },
  { cod: 56, nm: 'Nota de Débito', afecto: true, signo: 1 },
  { cod: 61, nm: 'Nota de Crédito', afecto: true, signo: -1 },
  // Honorarios tratados como documento de proveedor: sin IVA, contra Honorarios por Pagar (2102006).
  { cod: 70, nm: 'Boleta de Honorarios (con retención)', afecto: false, signo: 1, honorario: true, retencion: true },
  { cod: 71, nm: 'Boleta de Honorarios (sin retención)', afecto: false, signo: 1, honorario: true, retencion: false },
];

export const dteV = (cod: number | string): DteInfo | null => DTE_VENTAS.find((d) => d.cod === +cod) ?? null;
export const dteC = (cod: number | string): DteInfo | null => DTE_COMPRAS.find((d) => d.cod === +cod) ?? null;
export const esDteHonorario = (cod: number | string): boolean => !!dteC(cod)?.honorario;
