// storage.js — Shim de persistencia (Firestore + localStorage)
// Instala window.storage. Depende de firebase (FS).

import {FS, fsStatusSet} from './firebase.js';
import {DISPOSITIVO, initDispositivo} from './dispositivo.js';
initDispositivo();

// ═══ SHIM DE STORAGE — Firestore + localStorage fallback ═══
// Estrategia: siempre escribir a AMBOS (localStorage para velocidad + Firestore para nube).
// Lectura: prioriza Firestore si está online, cae a localStorage si no.
(function(){
  if(typeof window==='undefined')return;
  if(window.storage&&typeof window.storage.get==='function'&&typeof window.storage.set==='function')return;
  const prefix='cv:';
  const COLL='contabilidad_data'; // colección Firestore

  function getLocal(key){try{const v=localStorage.getItem(prefix+key);return v!==null?{key,value:v}:null;}catch(e){return null;}}
  function setLocal(key,value){try{localStorage.setItem(prefix+key,value);return true;}catch(e){return false;}}
  function delLocal(key){try{localStorage.removeItem(prefix+key);}catch(e){}}

  async function getRemote(key){
    if(!FS.enabled||!FS.db)return null;
    try{
      const doc=await FS.db.collection(COLL).doc(key).get();
      if(doc.exists){
        const d=doc.data();
        revs.set(key,+((d||{}).rev)||0);
        if(d&&d.borrados)tumbas.set(key,{...(tumbas.get(key)||{}),...d.borrados});
        if(d&&d.value!==undefined)fijarBaseline(key,d.value);
        return d&&d.value!==undefined?{key,value:d.value}:null;
      }
      revs.set(key,0);
      return null;
    }catch(e){console.warn('FS get',key,e);return null;}
  }
  // ── Campo `empresa` ──
  // Las reglas de Firestore no pueden leer el prefijo del id del documento en
  // una consulta, así que cada documento lleva además un campo `empresa` con
  // el id de la empresa dueña (o '_global' para el catálogo y la config).
  // Las reglas endurecidas exigen que este campo coincida con el prefijo del id.
  function empresaDeClave(key){
    if(!key||key[0]==='_')return '_global';
    const i=key.indexOf(':');
    return i>0?key.slice(0,i):'_global';
  }

  async function setRemote(key,value){
    if(!FS.enabled||!FS.db)return false;
    try{
      FS.pendingWrites++;fsStatusSet('syncing');
      await FS.db.collection(COLL).doc(key).set({value,empresa:empresaDeClave(key),ts:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
      FS.pendingWrites--;FS.lastSaveTs=Date.now();
      if(FS.pendingWrites===0)fsStatusSet('saved');
      return true;
    }catch(e){
      FS.pendingWrites--;
      fsStatusSet('error',e.code||e.message);
      console.warn('FS set',key,e);
      return false;
    }
  }
  async function delRemote(key){
    if(!FS.enabled||!FS.db)return;
    try{await FS.db.collection(COLL).doc(key).delete();}catch(e){console.warn('FS del',key,e);}
  }


  async function delRemoteVersionado(k){
    if(!FS.enabled||!FS.db)return {ok:true,soloLocal:true};
    const ref=FS.db.collection(COLL).doc(k);
    try{
      await FS.db.runTransaction(async t=>{
        const snap=await t.get(ref);
        if(!snap.exists)return;
        const actual=snap.data()||{};
        const revNube=+actual.rev||0;
        const revMia=revs.has(k)?revs.get(k):null;
        if(revMia!==null&&revNube!==revMia)throw new Error('__CONFLICTO_DELETE__');
        t.delete(ref);
      });
      revs.delete(k);baseline.delete(k);tumbas.delete(k);resucitados.delete(k);
      return {ok:true};
    }catch(e){
      if(e&&e.message==='__CONFLICTO_DELETE__')return {ok:false,motivo:'conflicto'};
      console.warn('FS del versionado',k,e);return {ok:false,motivo:e.message||String(e)};
    }
  }

  // ── Prefijo multiempresa ──
  // Todas las claves de datos se guardan como "<empresaId>:<clave>", de modo que
  // cada empresa queda aislada sin tocar los módulos que llaman a storage.
  // Las claves del catálogo (_empresas, _empresaActiva) usan getGlobal/setGlobal
  // y NO llevan prefijo.
  let empresaId='emp1';
  const K=key=>empresaId+':'+key;   // clave con prefijo de empresa

  // ── Candado de seguridad contra la pérdida silenciosa ──
  //
  // Toda lectura que falla se parece a "no hay datos": la app muestra la
  // sección vacía y, en cuanto se guarda cualquier cosa, escribe ese vacío
  // encima de lo que sí existía en la nube. Un problema de red de dos segundos
  // se convierte en borrar un libro entero.
  //
  // Por eso, cuando una clave NO se pudo leer, queda bloqueada para escritura
  // hasta que se lea bien. Es a nivel de storage a propósito: así protege a
  // todos los módulos y al autoguardado sin que cada uno tenga que acordarse.
  const bloqueadas=new Map();   // clave con prefijo → motivo
  const marcarNoLeida=(k,motivo)=>bloqueadas.set(k,motivo||'no se pudo leer');
  const liberar=k=>bloqueadas.delete(k);

  // ── Versión por documento: que un equipo no pise a otro ──
  //
  // El candado de arriba cubre "no pude leer". Falta el otro caso, más
  // silencioso todavía: dos equipos que SÍ leyeron bien y guardan encima el uno
  // del otro. Como cada documento guarda el libro COMPLETO (`ventas-2026` es el
  // arreglo entero), el último en guardar borraba el trabajo del primero sin
  // que nadie se enterara.
  //
  // Solución: cada documento lleva `rev` (un contador) y el `dispositivo` que
  // lo escribió. Al guardar se abre una transacción: si la rev de la nube ya no
  // es la que leímos, otro equipo escribió en el intermedio y NO se sobrescribe
  // — se FUSIONA.
  //
  // Fusión: los libros son listas de registros con `id`, así que se unen por id.
  // Lo que está sólo en la nube se conserva, lo que está sólo acá se agrega, y
  // si un id está en ambos gana la versión local (es lo que el usuario acaba de
  // editar). Lo que se borró NO revive: para eso están las lápidas, más abajo.
  //
  // Lo que no es una lista con id (la ficha de empresa, los indicadores) no se
  // puede fusionar solo: ahí se frena y se le pregunta al usuario.
  const revs=new Map();         // clave con prefijo → rev que leímos

  const esListaConId=v=>Array.isArray(v)&&v.length>0&&v.every(x=>x&&typeof x==='object'&&x.id!=null);

  // ── Lápidas: para que fusionar no reviva lo que se borró ──
  //
  // Fusionar por id tiene un agujero: si borraste una factura acá y el otro
  // equipo todavía la tenía, la unión la devuelve a la vida. El problema es que
  // "no está en mi lista" no distingue entre "nunca la tuve" y "la borré".
  //
  // Solución clásica: dejar constancia del borrado. Cada documento guarda un
  // mapa `borrados` {id: fecha}. Al fusionar, esos ids se excluyen aunque el
  // otro equipo los traiga.
  //
  // Y se detecta solo: `baseline` recuerda los ids que tenía el documento la
  // última vez que se leyó o guardó bien; lo que desaparece de una escritura a
  // la siguiente es, por definición, un borrado. Así ningún módulo tiene que
  // acordarse de avisar que borró.
  const baseline=new Map();     // clave con prefijo → Set de ids conocidos
  const tumbas=new Map();       // clave con prefijo → {id: fechaISO}
  const resucitados=new Map();  // clave con prefijo → Set de ids recreados a propósito

  function idsDe(valor){
    try{
      const v=JSON.parse(valor);
      if(!Array.isArray(v))return null;
      if(!v.length)return new Set();
      if(!v.every(x=>x&&typeof x==='object'&&x.id!=null))return null;
      return new Set(v.map(x=>String(x.id)));
    }catch(e){return null;}
  }

  // Registra como borrados los ids que estaban en la baseline y ya no vienen
  function detectarBorrados(k,valorNuevo){
    const previos=baseline.get(k);
    const ahora=idsDe(valorNuevo);
    if(!previos||!ahora)return;
    const t=tumbas.get(k)||{};
    let nuevas=0;
    previos.forEach(id=>{if(!ahora.has(id)&&!t[id]){t[id]=new Date().toISOString();nuevas++;}});
    // Si un id vuelve a aparecer, se recreó a propósito: su lápida deja de
    // aplicar. Hay que recordarlo aparte, porque al guardar se unen las lápidas
    // de la nube y, si no, la lápida de allá lo volvería a enterrar.
    const revividos=resucitados.get(k)||new Set();
    ahora.forEach(id=>{if(t[id]){delete t[id];revividos.add(id);}});
    if(revividos.size)resucitados.set(k,revividos);
    if(nuevas||Object.keys(t).length)tumbas.set(k,t);
  }

  const fijarBaseline=(k,valor)=>{const s=idsDe(valor);if(s)baseline.set(k,s);};

  function fusionar(valorNube,valorMio,borradosNube,borradosMios){
    let a,b;
    try{a=JSON.parse(valorNube);b=JSON.parse(valorMio);}catch(e){return {ok:false};}
    // Un id con lápida en CUALQUIERA de los dos lados no vuelve
    const muertos=new Set([...Object.keys(borradosNube||{}),...Object.keys(borradosMios||{})]);
    if(Array.isArray(a)&&Array.isArray(b)){
      // Un arreglo vacío a cualquiera de los dos lados no aporta información
      if(!a.length)return {ok:true,value:JSON.stringify(b),agregados:0};
      if(!b.length)return {ok:true,value:JSON.stringify(a),agregados:a.length};
      if(!esListaConId(a)||!esListaConId(b))return {ok:false};
      const porId=new Map();
      let sepultados=0;
      a.forEach(x=>{                                  // primero lo de la nube
        if(muertos.has(String(x.id))){sepultados++;return;}   // lo borrado no revive
        porId.set(String(x.id),x);
      });
      let agregados=0;
      b.forEach(x=>{                                  // lo local manda en empates
        if(muertos.has(String(x.id)))return;
        if(!porId.has(String(x.id)))agregados++;
        porId.set(String(x.id),x);
      });
      const unidos=[...porId.values()];
      const revividos=Math.max(0,unidos.length-b.filter(x=>!muertos.has(String(x.id))).length);
      return {ok:true,value:JSON.stringify(unidos),agregados,revividos,sepultados};
    }
    return {ok:false};
  }

  // Escritura con detección de concurrencia
  async function setRemoteVersionado(k,value){
    if(!FS.enabled||!FS.db)return {ok:false,motivo:'sin-nube'};
    const ref=FS.db.collection(COLL).doc(k);
    let salida={ok:true,fusionado:false};
    try{
      FS.pendingWrites++;fsStatusSet('syncing');
      await FS.db.runTransaction(async t=>{
        const snap=await t.get(ref);
        const actual=snap.exists?(snap.data()||{}):null;
        const revNube=actual?(+actual.rev||0):0;
        const revMia=revs.has(k)?revs.get(k):null;
        let aGuardar=value;

        // Hay conflicto si leímos una versión y la nube ya avanzó. La condición
        // es SÓLO la revisión, a propósito: comparar además el id del
        // dispositivo parecía más fino, pero fallaba justo cuando más importa
        // —dos pestañas del mismo navegador comparten el id y se habrían
        // pisado igual—. El id sirve para redactar el aviso, no para decidir.
        const otroEscribio=actual&&revMia!==null&&revNube!==revMia;
        if(otroEscribio&&actual.value!==undefined){
          const vivosDeNuevo=resucitados.get(k)||new Set();
          const filtrar=o=>{const r={...(o||{})};vivosDeNuevo.forEach(id=>delete r[id]);return r;};
          const f=fusionar(actual.value,value,filtrar(actual.borrados),filtrar(tumbas.get(k)));
          if(!f.ok){
            salida={ok:false,motivo:'conflicto',otro:actual.dispositivoNm||actual.dispositivo};
            throw new Error('__CONFLICTO__');
          }
          aGuardar=f.value;
          salida.fusionado=true;
          salida.agregados=f.agregados;
          salida.revividos=f.revividos;
          salida.otro=actual.dispositivoNm||actual.dispositivo;
          salida.value=aGuardar;
        }
        // Las lápidas viajan con el documento: unión de las de ambos lados,
        // menos lo que se recreó a propósito en este equipo.
        const lapidas={...((actual&&actual.borrados)||{}),...(tumbas.get(k)||{})};
        (resucitados.get(k)||new Set()).forEach(id=>{delete lapidas[id];});
        tumbas.set(k,lapidas);

        const claveLogica=String(k).slice(String(empresaId+':').length);
        const vgFinal=validarAsientosAntesDeEscribir(claveLogica,aGuardar,actual&&actual.value!==undefined?actual.value:null);
        if(vgFinal.ok===false){
          salida={ok:false,motivo:'validacion-contable',errores:vgFinal.errores||[],detalle:vgFinal.errores?.[0]||vgFinal.motivo};
          throw new Error('__VALIDACION_CONTABLE__');
        }
        const nuevaRev=revNube+1;
        t.set(ref,{value:aGuardar,empresa:empresaDeClave(k),rev:nuevaRev,
          borrados:lapidas,
          dispositivo:DISPOSITIVO.id,dispositivoNm:DISPOSITIVO.nombre,
          ts:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        revs.set(k,nuevaRev);
        fijarBaseline(k,aGuardar);                  // nueva referencia de borrados
        if(salida.fusionado)setLocal(k,aGuardar);   // el equipo queda al día
      });
      FS.pendingWrites--;FS.lastSaveTs=Date.now();
      if(FS.pendingWrites===0)fsStatusSet('saved');
      return salida;
    }catch(e){
      FS.pendingWrites--;
      if(e&&e.message==='__CONFLICTO__'){
        fsStatusSet('error','conflicto entre equipos');
        return salida;
      }
      if(e&&e.message==='__VALIDACION_CONTABLE__'){
        fsStatusSet('error','validación contable');
        return salida;
      }
      fsStatusSet('error',e.code||e.message);
      console.warn('FS set',k,e);
      return {ok:false,motivo:e.message||String(e)};
    }
  }

    // ── Cruce al iniciar sesión ──
  // Lee de la nube TODAS las claves de la empresa activa antes de que el
  // usuario empiece a trabajar. Suena a puro retraso, pero es lo que evita el
  // problema de raíz: un equipo que arranca con una foto vieja es el que
  // después genera conflictos y resucita registros borrados. Al terminar,
  // cada clave queda con su revisión, su baseline de ids y sus lápidas al
  // día, que es la base sobre la que funciona todo lo demás.
  async function cruzarConLaNube(claves,onProgreso){
    const res={leidas:0,fallidas:[],actualizadas:[],total:claves.length};
    for(let i=0;i<claves.length;i++){
      const clave=claves[i];
      const antes=getLocal(K(clave));
      const r=await window.storage.leerConEstado(clave);
      if(r.fuente==='error')res.fallidas.push({clave,motivo:r.error});
      else{
        res.leidas++;
        if(r.fuente==='nube'&&antes&&antes.value!==r.value)res.actualizadas.push(clave);
        else if(r.fuente==='nube'&&!antes&&r.value)res.actualizadas.push(clave);
      }
      if(onProgreso)onProgreso(i+1,claves.length,clave);
    }
    return res;
  }

  // Claves que vale la pena cruzar: las conocidas del ejercicio más lo que ya
  // exista en este equipo (por si hay algo de otro año o de un módulo nuevo).
  function clavesDeLaEmpresa(anio){
    const fijas=['empresa','pdc','pdc_v','activos','trabajadores','centros','cierresCC',
                 'comprobantesTipo','fichasAux','indicadores','previsional','libroRem'];
    const delAnio=['ventas-','compras-','honorarios-','asientos-','apertura-','f29-declaraciones-','cierresContables-','hardening-certificacion-','preproduccion-'].map(p=>p+anio);
    const set=new Set([...fijas,...delAnio]);
    try{
      const pref=prefix+empresaId+':';
      for(let i=0;i<localStorage.length;i++){
        const k=localStorage.key(i);
        if(k&&k.startsWith(pref))set.add(k.slice(pref.length));
      }
    }catch(e){}
    return [...set];
  }

  function validarAsientosAntesDeEscribir(key,value,prevRaw=null){
    if(!/^asientos-\d{4}$/.test(String(key||'')))return {ok:true};
    try{
      if(typeof window.__validarEscrituraAsientos!=='function')return {ok:true};
      const r=window.__validarEscrituraAsientos(key,value,prevRaw);
      return r&&typeof r==='object'?r:{ok:!!r};
    }catch(e){return {ok:false,motivo:e.message||String(e)};}
  }

  window.storage={
    // Cambia la empresa activa (lo llama empresas.js)
    setPrefijo(id){empresaId=id||'emp1';},
    getPrefijo(){return empresaId;},

    // ── API con prefijo (datos de la empresa activa) ──
    async get(key){
      const k=K(key);
      const local=getLocal(k);
      if(FS.enabled){
        const remote=await getRemote(k);
        if(remote){setLocal(k,remote.value);return {key,value:remote.value};}
      }
      return local?{key,value:local.value}:null;
    },
    async set(key,value){
      const k=K(key);
      const ge=typeof window.__autorizarEscrituraEntorno==='function'?window.__autorizarEscrituraEntorno(key):{ok:true};
      if(ge&&ge.ok===false)return {key,ok:false,bloqueada:true,motivo:ge.motivo||'entorno',detalle:ge.detalle||''};
      const vg=validarAsientosAntesDeEscribir(key,value);
      if(vg.ok===false){
        const motivo=vg.errores?.[0]||vg.motivo||'validacion-contable';
        console.error('Escritura de asientos RECHAZADA:',motivo);
        return {key,value,ok:false,bloqueada:true,motivo:'validacion-contable',detalle:motivo,errores:vg.errores||[]};
      }
      if(bloqueadas.has(k)){
        const motivo=bloqueadas.get(k);
        console.error('Escritura BLOQUEADA en',k,'—',motivo);
        try{window.__avisarBloqueo&&window.__avisarBloqueo(key,motivo);}catch(e){}
        return {key,ok:false,bloqueada:true,motivo};
      }

      // Sin nube inicializada se conserva el modo offline, pero se declara
      // explícitamente que el guardado quedó sólo en este dispositivo.
      if(!FS.enabled||!FS.db){
        detectarBorrados(k,value);
        setLocal(k,value);fijarBaseline(k,value);
        try{ if(window.__marcarGuardado)window.__marcarGuardado(); }catch(e){}
        return {key,value,ok:true,soloLocal:true};
      }

      // V2.10: NO tocar localStorage antes de saber que la escritura remota
      // terminó bien. Antes, una falla de Firestore podía mostrar "no guardado"
      // pero dejar igualmente el valor nuevo en localStorage; al recargar parecía
      // que sí se había guardado y más tarde podía volver a sincronizarse.
      detectarBorrados(k,value);
      const r=await setRemoteVersionado(k,value);
      if(r.motivo==='conflicto'){
        try{window.__avisarConflicto&&window.__avisarConflicto(key,r.otro);}catch(e){}
        return {key,value,ok:false,conflicto:true,otro:r.otro};
      }
      if(r.ok===false)return {key,value,ok:false,motivo:r.motivo};
      const definitivo=r.value!==undefined?r.value:value;
      setLocal(k,definitivo);fijarBaseline(k,definitivo);
      if(r.fusionado){
        try{window.__avisarFusion&&window.__avisarFusion(key,r);}catch(e){}
      }
      try{ if(window.__marcarGuardado)window.__marcarGuardado(); }catch(e){}
      return {key,value:definitivo,ok:true,fusionado:!!r.fusionado};
    },

    // Escritura atómica de varias claves críticas de la misma empresa.
    // Se usa cuando un hecho económico debe persistir en más de un documento
    // de Firestore (ej.: libro de compras + asientos). O se guardan todas, o no
    // se modifica ninguna ni en la nube ni en localStorage.
    async setMany(entries){
      const lista=(entries||[]).filter(x=>x&&x.key!=null).map(x=>({key:String(x.key),value:String(x.value??'')}));
      if(!lista.length)return {ok:true};
      for(const e of lista){const ge=typeof window.__autorizarEscrituraEntorno==='function'?window.__autorizarEscrituraEntorno(e.key):{ok:true};if(ge&&ge.ok===false)return {ok:false,bloqueada:true,clave:e.key,motivo:ge.motivo||'entorno',detalle:ge.detalle||''};}
      for(const e of lista){
        const vg=validarAsientosAntesDeEscribir(e.key,e.value);
        if(vg.ok===false)return {ok:false,bloqueada:true,clave:e.key,motivo:'validacion-contable',detalle:vg.errores?.[0]||vg.motivo,errores:vg.errores||[]};
      }
      for(const e of lista){
        const k=K(e.key);
        if(bloqueadas.has(k))return {ok:false,bloqueada:true,clave:e.key,motivo:bloqueadas.get(k)};
      }
      if(!FS.enabled||!FS.db){
        for(const e of lista){const k=K(e.key);detectarBorrados(k,e.value);setLocal(k,e.value);fijarBaseline(k,e.value);}
        try{ if(window.__marcarGuardado)window.__marcarGuardado(); }catch(e){}
        return {ok:true,soloLocal:true};
      }
      FS.pendingWrites++;fsStatusSet('syncing');
      try{
        const refs=lista.map(e=>FS.db.collection(COLL).doc(K(e.key)));
        const nuevos=[];
        await FS.db.runTransaction(async t=>{
          const snaps=[];
          for(const ref of refs)snaps.push(await t.get(ref));
          for(let i=0;i<lista.length;i++){
            const e=lista[i],k=K(e.key),snap=snaps[i];
            const actual=snap.exists?(snap.data()||{}):null;
            const revNube=actual?(+actual.rev||0):0;
            const revMia=revs.has(k)?revs.get(k):null;
            if(actual&&revMia===null)throw new Error('__SIN_BASELINE__:'+e.key);
            if(revMia!==null&&revNube!==revMia)throw new Error('__CONFLICTO_MULTI__:'+e.key);

            // Preparar lápidas sin modificar el estado global antes del commit.
            const prev=baseline.get(k), ahora=idsDe(e.value);
            const lapidas={...((actual&&actual.borrados)||{}),...(tumbas.get(k)||{})};
            if(prev&&ahora){
              prev.forEach(id=>{if(!ahora.has(id)&&!lapidas[id])lapidas[id]=new Date().toISOString();});
              ahora.forEach(id=>{if(lapidas[id])delete lapidas[id];});
            }
            const vgFinal=validarAsientosAntesDeEscribir(e.key,e.value,actual&&actual.value!==undefined?actual.value:null);
            if(vgFinal.ok===false)throw new Error('__VALIDACION_MULTI__:'+e.key+':'+(vgFinal.errores?.[0]||vgFinal.motivo||'validación contable'));
            const nuevaRev=revNube+1;
            t.set(refs[i],{value:e.value,empresa:empresaDeClave(k),rev:nuevaRev,borrados:lapidas,
              dispositivo:DISPOSITIVO.id,dispositivoNm:DISPOSITIVO.nombre,
              ts:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
            nuevos.push({k,value:e.value,rev:nuevaRev,lapidas});
          }
        });
        nuevos.forEach(x=>{revs.set(x.k,x.rev);tumbas.set(x.k,x.lapidas);resucitados.delete(x.k);setLocal(x.k,x.value);fijarBaseline(x.k,x.value);});
        FS.pendingWrites--;FS.lastSaveTs=Date.now();if(FS.pendingWrites===0)fsStatusSet('saved');
        try{ if(window.__marcarGuardado)window.__marcarGuardado(); }catch(e){}
        return {ok:true};
      }catch(e){
        FS.pendingWrites--;
        const msg=e&&e.message||String(e);
        if(msg.startsWith('__CONFLICTO_MULTI__')){
          const clave=msg.split(':').slice(1).join(':');fsStatusSet('error','conflicto entre equipos');
          try{window.__avisarConflicto&&window.__avisarConflicto(clave,'otro dispositivo');}catch(_e){}
          return {ok:false,conflicto:true,clave,motivo:'conflicto'};
        }
        if(msg.startsWith('__VALIDACION_MULTI__')){
          const partes=msg.split(':');const clave=partes[1]||'asientos';const detalle=partes.slice(2).join(':');
          fsStatusSet('error','validación contable');
          return {ok:false,clave,motivo:'validacion-contable',detalle};
        }
        if(msg.startsWith('__SIN_BASELINE__')){
          const clave=msg.split(':').slice(1).join(':');fsStatusSet('error','clave no sincronizada');
          return {ok:false,clave,motivo:'clave-no-sincronizada'};
        }
        fsStatusSet('error',e.code||msg);console.warn('FS setMany',e);
        return {ok:false,motivo:msg};
      }
    },
    async delete(key){
      const k=K(key);
      const ge=typeof window.__autorizarEscrituraEntorno==='function'?window.__autorizarEscrituraEntorno(key):{ok:true};
      if(ge&&ge.ok===false)return {key,ok:false,bloqueada:true,motivo:ge.motivo||'entorno',detalle:ge.detalle||''};
      const r=await delRemoteVersionado(k);
      if(!r.ok){
        try{window.__avisarConflicto&&r.motivo==='conflicto'&&window.__avisarConflicto(key,'otro dispositivo');}catch(e){}
        return {key,ok:false,deleted:false,motivo:r.motivo};
      }
      delLocal(k);
      return {key,ok:true,deleted:true};
    },

    // Lectura de una clave de la empresa que distingue "no hay" de "no pude
    // leer". Si falla, la clave queda bloqueada para escritura.
    async leerConEstado(key){
      const k=K(key);
      const local=getLocal(k);
      const vLocal=local?local.value:null;
      if(!FS.enabled||!FS.db){
        liberar(k);
        return {value:vLocal,fuente:vLocal!==null?'local':'vacio',huboNube:false};
      }
      try{
        const doc=await FS.db.collection(COLL).doc(k).get();
        if(doc.exists){
          const d=doc.data();
          revs.set(k,+((d||{}).rev)||0);   // versión sobre la que trabajamos
          if(d&&d.borrados)tumbas.set(k,{...(tumbas.get(k)||{}),...d.borrados});
          if(d&&d.value!==undefined){
            setLocal(k,d.value);liberar(k);fijarBaseline(k,d.value);
            return {value:d.value,fuente:'nube',huboNube:true,rev:revs.get(k),
                    dispositivo:d.dispositivoNm||d.dispositivo||''};
          }
        }else{
          revs.set(k,0);                   // no existe: partimos de cero
        }
        liberar(k);   // la nube respondió: de verdad no hay nada
        return {value:vLocal,fuente:vLocal!==null?'local':'vacio',huboNube:true};
      }catch(e){
        const motivo=e.message||String(e);
        marcarNoLeida(k,motivo);
        console.warn('FS get',k,e);
        return {value:vLocal,fuente:'error',huboNube:true,error:motivo};
      }
    },

    // Estado del candado, para que la interfaz pueda explicarlo
    cruzarConLaNube(claves,onProgreso){return cruzarConLaNube(claves,onProgreso);},
    clavesDeLaEmpresa(anio){return clavesDeLaEmpresa(anio);},
    lapidas(){const pref=empresaId+':';const o={};
      [...tumbas.entries()].forEach(([k,v])=>{if(k.startsWith(pref))o[k.slice(pref.length)]=Object.keys(v).length;});
      return o;},

    clavesBloqueadas(){
      const pref=empresaId+':';
      return [...bloqueadas.entries()]
        .filter(([k])=>k.startsWith(pref))
        .map(([k,motivo])=>({clave:k.slice(pref.length),motivo}));
    },
    hayBloqueos(){return this.clavesBloqueadas().length>0;},

    // V2.15.3 — reserva atómica de correlativos contables definitivos.
    // El contador vive en un documento separado por empresa/año y se incrementa
    // dentro de una transacción Firestore. Así dos equipos no pueden recibir el
    // mismo número. Para proteger la secuencia, NO se asignan correlativos nuevos
    // sin conexión a la nube; las ediciones de asientos ya numerados sí pueden
    // seguir usando el mecanismo normal de persistencia.
    async reservarCorrelativos(clave,cantidad=1,minimo=0){
      cantidad=Math.max(0,Math.trunc(+cantidad||0));
      minimo=Math.max(0,Math.trunc(+minimo||0));
      if(!cantidad)return {ok:true,inicio:minimo+1,fin:minimo};
      if(!FS.enabled||!FS.db)return {ok:false,motivo:'sin-nube-correlativo'};
      const seqKey=K('_seq_'+String(clave||'asientos'));
      const ref=FS.db.collection(COLL).doc(seqKey);
      try{
        let inicio=0,fin=0;
        await FS.db.runTransaction(async t=>{
          const snap=await t.get(ref);
          let ultimo=0;
          if(snap.exists){
            const d=snap.data()||{};
            try{ultimo=Math.max(0,+((JSON.parse(d.value||'{}')||{}).ultimo)||0);}catch(_e){ultimo=0;}
          }
          ultimo=Math.max(ultimo,minimo);
          inicio=ultimo+1;fin=ultimo+cantidad;
          t.set(ref,{value:JSON.stringify({ultimo:fin}),empresa:empresaDeClave(seqKey),rev:(snap.exists?(+(snap.data()?.rev||0)):0)+1,
            dispositivo:DISPOSITIVO.id,dispositivoNm:DISPOSITIVO.nombre,
            ts:firebase.firestore.FieldValue.serverTimestamp()},{merge:true});
        });
        return {ok:true,inicio,fin};
      }catch(e){
        console.warn('Reserva correlativo contable',e);
        return {ok:false,motivo:e.message||String(e)};
      }
    },

    // ── API sin prefijo (catálogo de empresas, config global) ──
    // Lectura global que DISTINGUE "no existe" de "no se pudo leer".
    //
    // `getGlobal` devuelve null en los dos casos, y eso es peligroso para el
    // catálogo de empresas: si la nube falla al abrir en un equipo nuevo, el
    // catálogo se ve vacío, la app crea una empresa por defecto y la guarda —
    // pisando en la nube el catálogo real de todos los equipos.
    //
    // fuente: 'nube' | 'local' | 'vacio' | 'error'
    async leerGlobalConEstado(key){
      const local=getLocal(key);
      const vLocal=local?local.value:null;
      if(!FS.enabled||!FS.db){
        return {value:vLocal,fuente:vLocal!==null?'local':'vacio',huboNube:false};
      }
      try{
        const doc=await FS.db.collection(COLL).doc(key).get();
        if(doc.exists){
          const d=doc.data();
          revs.set(key,+((d||{}).rev)||0);
          if(d&&d.borrados)tumbas.set(key,{...(tumbas.get(key)||{}),...d.borrados});
          if(d&&d.value!==undefined){
            setLocal(key,d.value);fijarBaseline(key,d.value);
            return {value:d.value,fuente:'nube',huboNube:true,rev:revs.get(key)};
          }
        }else{
          revs.set(key,0);
        }
        // La nube respondió y de verdad no hay nada
        return {value:vLocal,fuente:vLocal!==null?'local':'vacio',huboNube:true};
      }catch(e){
        console.warn('FS getGlobal',key,e);
        return {value:vLocal,fuente:'error',huboNube:true,error:e.message||String(e)};
      }
    },

    async getGlobal(key){
      const local=getLocal(key);
      if(FS.enabled){
        const remote=await getRemote(key);
        if(remote){setLocal(key,remote.value);return remote;}
      }
      return local;
    },
    // `fusionar:true` para las claves globales que escriben TODOS los usuarios.
    // El caso concreto es `_empresas`: cada usuario guarda el catálogo COMPLETO,
    // así que dos personas creando su empresa a la vez se borraban la del otro
    // del listado (los datos sobrevivían, pero la empresa desaparecía de la
    // lista). Con versión + fusión por id, se conservan las dos.
    //
    // Las demás claves globales son de un solo usuario (`_empresaActiva:<email>`)
    // o se escriben una vez (`_migrado_multiempresa`): ahí gana la última
    // escritura, que es lo correcto para una preferencia.
    async setGlobal(key,value,opciones){
      const fusionar=!!(opciones&&opciones.fusionar);
      setLocal(key,value);
      if(!fusionar){const ok=await setRemote(key,value);return {key,value,ok:ok||!FS.enabled};}
      detectarBorrados(key,value);
      const r=await setRemoteVersionado(key,value);
      if(r.motivo==='conflicto'){
        try{window.__avisarConflicto&&window.__avisarConflicto(key,r.otro);}catch(e){}
        return {key,value,conflicto:true,otro:r.otro};
      }
      if(r.fusionado){
        try{window.__avisarFusion&&window.__avisarFusion(key,r);}catch(e){}
        return {key,value:r.value,fusionado:true};
      }
      return {key,value};
    },

    async list(prefixArg){
      try{const keys=[];const pref=empresaId+':';for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(prefix)){let base=k.slice(prefix.length);if(!base.startsWith(pref))continue;base=base.slice(pref.length);if(!prefixArg||base.startsWith(prefixArg))keys.push(base);}}return {keys};}
      catch(e){return {keys:[]};}
    },
    // Sincronizar todo local → remoto (usado tras conectar por primera vez)
    async syncAllToRemote(){
      if(!FS.enabled)return {count:0,fallos:0};
      let count=0,fallos=0;
      const claves=[];
      for(let i=0;i<localStorage.length;i++){const k=localStorage.key(i);if(k&&k.startsWith(prefix))claves.push(k);}
      for(const k of claves){
        const base=k.slice(prefix.length),v=localStorage.getItem(k);
        if(v===null)continue;
        detectarBorrados(base,v);
        const r=await setRemoteVersionado(base,v);
        if(r.ok)count++;else fallos++;
      }
      return {count,fallos,ok:fallos===0};
    },
    // Sincronizar todo remoto → local (usado al abrir en un dispositivo nuevo)
    //
    // `ids` = empresas que el usuario puede ver. Se consulta una vez por empresa
    // (más '_global' para el catálogo) en vez de traer la colección completa:
    // con las reglas endurecidas una consulta sin filtro se rechaza entera,
    // porque Firestore no puede garantizar que todos los resultados sean legibles.
    // Si no se pasan ids se cae a la consulta antigua (reglas permisivas).
    async syncAllFromRemote(ids){
      if(!FS.enabled||!FS.db)return {count:0};
      const guardar=snap=>{let n=0;snap.forEach(doc=>{const d=doc.data();if(d&&d.value!==undefined){setLocal(doc.id,d.value);n++;}});return n;};
      try{
        if(Array.isArray(ids)&&ids.length){
          let count=0;
          for(const emp of ['_global',...ids]){
            const snap=await FS.db.collection(COLL).where('empresa','==',emp).get();
            count+=guardar(snap);
          }
          return {count};
        }
        return {count:guardar(await FS.db.collection(COLL).get())};
      }catch(e){console.error('syncAllFromRemote',e);return {count:0,error:e.message};}
    },

    // Recorre la colección y devuelve los documentos SIN campo `empresa`.
    // Sólo funciona con las reglas antiguas (hace un list sin filtro): se usa
    // exactamente una vez, en la migración previa a publicar las reglas nuevas.
    async docsSinEmpresa(){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      const snap=await FS.db.collection(COLL).get();
      const faltan=[];let total=0;
      snap.forEach(doc=>{total++;const d=doc.data()||{};if(d.empresa===undefined)faltan.push(doc.id);});
      return {total,faltan};
    },

    // ── Verificación con las reglas endurecidas ya publicadas ──
    // Ahí `docsSinEmpresa()` deja de funcionar a propósito: una consulta sin
    // filtro se rechaza entera, porque Firestore no puede garantizar de antemano
    // que todos los resultados sean legibles. Es la señal de que el aislamiento
    // está activo, no un error.
    //
    // En ese modo se cuenta lo ALCANZABLE (una consulta filtrada por empresa) y
    // se contrasta con lo que hay en este dispositivo: si algo está guardado
    // acá pero no aparece en la nube, es un documento sin marcar que quedó
    // fuera del alcance de las reglas.
    async docsAlcanzables(ids){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      const porEmpresa={};let total=0;
      for(const emp of ['_global',...(ids||[])]){
        const snap=await FS.db.collection(COLL).where('empresa','==',emp).get();
        const vistos=new Set();snap.forEach(d=>vistos.add(d.id));
        porEmpresa[emp]=[...vistos];total+=vistos.size;
      }
      return {total,porEmpresa};
    },
    // Claves guardadas en este dispositivo que corresponden a esas empresas
    clavesLocales(ids){
      const set=new Set(ids||[]);const claves=[];
      try{
        for(let i=0;i<localStorage.length;i++){
          const k=localStorage.key(i);
          if(!k||!k.startsWith(prefix))continue;
          const base=k.slice(prefix.length);
          const emp=empresaDeClave(base);
          if(emp==='_global'||set.has(emp))claves.push(base);
        }
      }catch(e){}
      return claves;
    },
    // Repara documentos que existen en este dispositivo pero no se alcanzan en
    // la nube: los vuelve a subir, y al subirlos quedan marcados con su empresa.
    async repararDocs(claves,onProgreso){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      let hechos=0,fallos=0;
      for(const clave of claves){
        const local=getLocal(clave);
        if(local===null||local.value===undefined){fallos++;continue;}
        if(await setRemote(clave,local.value))hechos++;else fallos++;
        if(onProgreso)onProgreso(hechos+fallos,claves.length);
      }
      return {hechos,fallos};
    },

    // Estampa el campo `empresa` en los documentos que no lo tienen.
    async estamparEmpresa(ids,onProgreso){
      if(!FS.enabled||!FS.db)throw new Error('Firestore no está disponible');
      let hechos=0;
      for(let i=0;i<ids.length;i+=400){
        const lote=FS.db.batch();
        ids.slice(i,i+400).forEach(id=>lote.update(FS.db.collection(COLL).doc(id),{empresa:empresaDeClave(id)}));
        await lote.commit();
        hechos+=Math.min(400,ids.length-i);
        if(onProgreso)onProgreso(hechos,ids.length);
      }
      return {hechos};
    }
  };
})();
