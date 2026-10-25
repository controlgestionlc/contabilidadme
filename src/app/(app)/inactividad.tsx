'use client';

import { useEffect, useState } from 'react';
import { salirPorInactividad } from '../(auth)/acciones';

const LIMITE = 30 * 60 * 1000;
const AVISO = 60 * 1000;
// Misma cookie que renueva el proxy en cada request (src/lib/supabase/proxy.ts)
const COOKIE = 'cme_actividad';

const leer = () => Number(document.cookie.match(/(?:^|; )cme_actividad=(\d+)/)?.[1]) || 0;
const marcar = () => { document.cookie = `${COOKIE}=${Date.now()}; path=/; max-age=86400; samesite=lax`; };

/**
 * Cierra la sesión tras 30 minutos sin actividad (mouse, teclado, toques o desplazamiento). La última actividad va en
 * una cookie compartida entre pestañas y con el servidor: trabajar en una mantiene viva la otra, y si se vuelve
 * después de mucho rato el proxy cierra la sesión antes de mostrar nada. Un minuto antes avisa.
 */
export function CierreInactividad() {
  const [restante, setRestante] = useState<number | null>(null);
  useEffect(() => {
    let local = Date.now();
    marcar();
    let ultimoGuardado = Date.now();
    const actividad = () => {
      local = Date.now();
      if (local - ultimoGuardado > 5000) { marcar(); ultimoGuardado = local; } // no escribir en cada movimiento
      setRestante(null);
    };
    const eventos = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'] as const;
    eventos.forEach((e) => window.addEventListener(e, actividad, { passive: true }));
    let saliendo = false;
    const revisar = () => {
      const ultima = Math.max(local, leer());
      const falta = LIMITE - (Date.now() - ultima);
      if (falta <= 0 && !saliendo) { saliendo = true; salirPorInactividad(); }
      else setRestante(falta <= AVISO ? Math.ceil(falta / 1000) : null);
    };
    const t = setInterval(revisar, 5000);
    document.addEventListener('visibilitychange', revisar);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', revisar); eventos.forEach((e) => window.removeEventListener(e, actividad)); };
  }, []);
  if (restante == null) return null;
  return (
    <div role="alert" className="no-print fixed right-4 bottom-4 z-[60] max-w-xs rounded-lg border border-aviso/50 bg-panel p-3 text-sm shadow-xl">
      <div className="font-semibold text-aviso">⏳ Tu sesión se cerrará en {restante} s</div>
      <div className="text-xs text-tenue">Por 30 minutos sin actividad. Mueve el mouse o presiona una tecla para seguir.</div>
    </div>
  );
}
