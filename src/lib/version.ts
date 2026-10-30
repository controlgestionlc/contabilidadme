// Versión de la app. En cada entrega se sube "version" en package.json y se anotan aquí las novedades:
// el aviso de actualización las muestra a quienes tengan abierta una versión anterior.
export const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev';
export const BUILD_FECHA = process.env.NEXT_PUBLIC_BUILD_FECHA ?? '';

export const NOVEDADES: string[] = [
  'Libro de ventas: botones 🧾 Ventas con boleta y 💳 Medios electrónicos para registrar el resumen del día o del mes con la cantidad de documentos y el total (neto e IVA se calculan solos). Usan la misma cuenta de ingreso que las demás ventas.',
  'F29: los códigos 110 y 111 (boletas), 758 y 759 (comprobantes de pago electrónico) y 586 (boletas exentas) se llenan solos desde esos resúmenes; ingresarlos a mano sigue disponible.',
];

/** "27-10-2026 22:30" en hora de Chile. */
export function fechaCompilacion(iso = BUILD_FECHA) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('es-CL', { timeZone: 'America/Santiago', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })
    .format(d).replace(',', '');
}
