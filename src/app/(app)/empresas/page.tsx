import type { Metadata } from 'next';
import Link from 'next/link';
import { requerirUsuario, empresasDelUsuario, miAcceso, puedeCrearEmpresas } from '@/lib/auth';
import { permisoDe } from '@/lib/modulos';
import { NOMBRE_ROL } from '@/lib/formato';
import { BarraUsuario } from '../barra-usuario';

export const metadata: Metadata = { title: 'Empresas' };

export default async function EmpresasPage() {
  const [usuario, empresas, acceso] = await Promise.all([requerirUsuario(), empresasDelUsuario(), miAcceso()]);
  const crea = puedeCrearEmpresas(acceso);
  // Al elegir una empresa se entra directo a Comprobantes (si el perfil puede registrarlos; si no, al Inicio)
  const destino = (id: string) => (permisoDe(acceso, 'comprobantes') === 'editar' ? `/e/${id}/asientos/nuevo` : `/e/${id}`);
  return (
    <>
      <BarraUsuario usuario={usuario} />
      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Tus empresas</h1>
            <p className="text-sm text-tenue">{acceso.admin ? 'Como administrador del sistema ves todas las empresas.' : 'Elige con cuál trabajar.'}</p>
          </div>
          {crea && <Link href="/empresas/nueva" className="boton">+ Nueva empresa</Link>}
        </div>
        {empresas.length === 0 ? (
          <div className="tarjeta p-8 text-center text-tenue">
            {crea ? 'Aún no tienes empresas. Crea la primera o pide que te agreguen con tu correo' : acceso.perfil ? 'Aún no tienes empresas asignadas. Pide al dueño de la empresa o al administrador que te agregue con tu correo' : 'Tu cuenta aún no tiene un perfil de acceso. Pide al administrador del sistema que te asigne uno; tu correo es'}
            <span className="text-texto"> {usuario.email}</span>.
          </div>
        ) : (
          <ul className="grid gap-3">
            {empresas.map((e) => (
              <li key={e.id}>
                <Link href={destino(e.id)} className="tarjeta flex items-center justify-between gap-4 p-4 hover:border-acento">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{e.razon_social}</div>
                    <div className="text-sm text-tenue"><span className="num">{e.rut}</span>{e.giro ? ` · ${e.giro}` : ''}</div>
                  </div>
                  <span className="text-xs whitespace-nowrap text-tenue">{acceso.admin ? '🛡️ Administrador' : NOMBRE_ROL[e.rol]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
