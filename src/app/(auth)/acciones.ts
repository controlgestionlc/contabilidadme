'use server';

import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { z } from 'zod';
import { crearClienteServidor } from '@/lib/supabase/server';

export interface EstadoForm {
  error?: string;
  ok?: string;
  /** Valores para reponer en el formulario tras un error (nunca contraseñas) */
  valores?: Record<string, string>;
}

const reponer = (fd: FormData, ...campos: string[]) =>
  Object.fromEntries(campos.map((c) => [c, String(fd.get(c) ?? '')]));

const email = z.string().trim().email('Correo no válido');
const clave = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres');

async function urlSitio() {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, '');
  const h = await headers();
  return `${h.get('x-forwarded-proto') ?? 'http'}://${h.get('host')}`;
}

function traducir(msg: string | undefined) {
  if (!msg || msg === '{}' || /fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(msg)) {
    return 'No se pudo conectar con el servidor de autenticación. Revisa tu conexión o la configuración de Supabase.';
  }
  if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos';
  if (/email not confirmed/i.test(msg)) return 'Debes confirmar tu correo antes de ingresar (revisa tu bandeja)';
  if (/already registered/i.test(msg)) return 'Ese correo ya tiene una cuenta. Ingresa o recupera tu contraseña.';
  if (/rate limit/i.test(msg)) return 'Demasiados intentos. Espera unos minutos.';
  return msg;
}

export async function ingresar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z.object({ email, clave: z.string().min(1, 'Ingresa tu contraseña') }).safeParse({
    email: fd.get('email'),
    clave: fd.get('clave'),
  });
  if (!p.success) return { error: p.error.issues[0].message, valores: reponer(fd, 'email') };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: p.data.email, password: p.data.clave });
  if (error) return { error: traducir(error.message), valores: reponer(fd, 'email') };
  // Sesión nueva: parte el reloj de inactividad
  (await cookies()).set('cme_actividad', String(Date.now()), { path: '/', maxAge: 60 * 60 * 24, sameSite: 'lax' });
  // Siempre a la pantalla de empresas: desde ahí se elige con cuál trabajar
  redirect('/empresas');
}

export async function registrar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z
    .object({ nombre: z.string().trim().min(2, 'Ingresa tu nombre'), email, clave, clave2: z.string() })
    .refine((d) => d.clave === d.clave2, { message: 'Las contraseñas no coinciden' })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message, valores: reponer(fd, 'nombre', 'email') };
  const supabase = await crearClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: p.data.email,
    password: p.data.clave,
    options: { data: { nombre: p.data.nombre }, emailRedirectTo: `${await urlSitio()}/auth/confirm?next=/empresas` },
  });
  if (error) return { error: traducir(error.message), valores: reponer(fd, 'nombre', 'email') };
  if (data.session) redirect('/empresas');
  return { ok: 'Cuenta creada. Te enviamos un correo para confirmarla.' };
}

export async function recuperar(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = email.safeParse(fd.get('email'));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(p.data, {
    redirectTo: `${await urlSitio()}/auth/confirm?next=/auth/actualizar-clave`,
  });
  if (error) return { error: traducir(error.message) };
  return { ok: 'Si el correo está registrado, te llegará un enlace para crear una nueva contraseña.' };
}

export async function actualizarClave(_: EstadoForm, fd: FormData): Promise<EstadoForm> {
  const p = z
    .object({ clave, clave2: z.string() })
    .refine((d) => d.clave === d.clave2, { message: 'Las contraseñas no coinciden' })
    .safeParse(Object.fromEntries(fd));
  if (!p.success) return { error: p.error.issues[0].message };
  const supabase = await crearClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: p.data.clave });
  if (error) return { error: traducir(error.message) };
  redirect('/empresas');
}

export async function salir() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect('/login');
}

/** Cierre de sesión por inactividad (30 minutos sin usar la app). */
export async function salirPorInactividad() {
  const supabase = await crearClienteServidor();
  await supabase.auth.signOut();
  redirect('/login?motivo=inactividad');
}
