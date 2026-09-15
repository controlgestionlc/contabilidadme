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

export async function borrarACLEmpresa(id){
  if(!aclDisponible()||!id)return false;
  try{await FS.db.collection(COLL).doc(id).delete();return true;}
  catch(err){console.warn('ACL del',id,err);return false;}
}
