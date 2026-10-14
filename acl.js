// acl.js — Lista de control de acceso por empresa (para las reglas de Firestore)
//
// ¿Por qué existe este módulo?
// El catálogo de empresas (`_empresas`) se guarda como un STRING JSON dentro de
// un documento. Las reglas de seguridad de Firestore no saben parsear JSON, así
// que no pueden preguntarle a ese documento quién es el dueño de "emp1".
//
// Solución: una colección paralela, legible por las reglas, con un documento
// por empresa y campos planos:
//
//   empresas_acl/emp1 = {
//     nombre:    'Vivero La Cabaña',
//     creadoPor: 'rodrigo@ejemplo.cl',
//     miembros:  ['rodrigo@ejemplo.cl','ana@ejemplo.cl'],   // dueño incluido
//     ts:        <serverTimestamp>
//   }
//
// Las reglas leen `empresas_acl/<empresa>` y comprueban que el email del usuario
// esté en `miembros`. Este módulo mantiene esos documentos sincronizados con el
// catálogo cada vez que se crea, comparte, reclama o elimina una empresa.
//
// El campo `miembros` es la fuente de verdad para las REGLAS; el catálogo lo
// sigue siendo para la INTERFAZ. Las ACL se actualizan automáticamente cada vez
// que el catálogo cambia; ya no existe una herramienta manual de migración.

import {FS} from './firebase.js';

const COLL='empresas_acl';

export const aclDisponible=()=>!!(FS.enabled&&FS.db);

// Miembros de una empresa = dueño + compartidos, en minúsculas y sin repetir
export function miembrosDe(e){
  const lista=[String(e.creadoPor||'').trim().toLowerCase(),
               ...((e.compartidaCon||[]).map(x=>String(x).trim().toLowerCase()))];
  return [...new Set(lista.filter(Boolean))];
}

// Último error de escritura, útil para diagnóstico técnico.
export const ACL_ERR={ultimo:null};
export const esErrorPermisos=msg=>/permission|insufficient|permisos/i.test(String(msg||''));

// Escribe (o actualiza) el documento ACL de una empresa
export async function guardarACLEmpresa(e){
  if(!aclDisponible()||!e||!e.id)return false;
  try{
    await FS.db.collection(COLL).doc(e.id).set({
      nombre:e.nombre||'',
      creadoPor:String(e.creadoPor||'').trim().toLowerCase(),
      miembros:miembrosDe(e),
      ts:firebase.firestore.FieldValue.serverTimestamp(),
    },{merge:true});
    return true;
  }catch(err){console.warn('ACL set',e.id,err);ACL_ERR.ultimo=err.message||String(err);return false;}
}

// Garantiza que la ficha de acceso de UNA empresa exista y te incluya ANTES de
// leer sus datos. Sin esto, una empresa recién creada se leía antes de que su
// ficha llegara a la nube (refrescarACL corre en segundo plano): las reglas
// respondían "sin permisos", storage lo tomaba como lectura fallida y bloqueaba
// el guardado de toda la sesión.
// Devuelve 'ok' | 'escrita' | 'sin-permiso' | 'error'.
export async function asegurarACLEmpresa(e,email,{puedeEscribir=false}={}){
  if(!aclDisponible()||!e||!e.id)return 'ok';
  const yo=String(email||'').trim().toLowerCase();
  const esperado=miembrosDe(e).slice().sort().join(',');
  try{
    const d=await FS.db.collection(COLL).doc(e.id).get();
    if(d.exists){
      const miembros=((d.data()||{}).miembros||[]).map(x=>String(x).toLowerCase());
      if(miembros.slice().sort().join(',')===esperado)return 'ok';
      if(!puedeEscribir)return miembros.includes(yo)?'ok':'sin-permiso';
    }else if(!puedeEscribir)return 'sin-permiso';
  }catch(err){
    // Las reglas niegan leer una ficha inexistente o ajena: si te corresponde
    // escribirla, se intenta igual; si no, no hay acceso.
    if(!puedeEscribir){ACL_ERR.ultimo=err.message||String(err);return esErrorPermisos(err.message)?'sin-permiso':'error';}
  }
  return (await guardarACLEmpresa(e))?'escrita':(esErrorPermisos(ACL_ERR.ultimo)?'sin-permiso':'error');
}

export async function borrarACLEmpresa(id){
  if(!aclDisponible()||!id)return false;
  try{await FS.db.collection(COLL).doc(id).delete();return true;}
  catch(err){console.warn('ACL del',id,err);return false;}
}
