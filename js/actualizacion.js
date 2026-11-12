/* ════════════════════════════════════════════════════════════════════
   SCI — Actualización Inventario Huerto (aih*)
   Flujo: TERRENO propone cambios de ESTADO de plantas → ADMIN revisa y
   aprueba/rechaza → al aprobar se guarda una VERSIÓN (respaldo) de la
   hilera antes de aplicar, recuperable en caso de error.
   Restricciones de diseño: SOLO se modifica el estado. No se agregan,
   eliminan ni cambian de tipo plantas desde este módulo.
   Stores: aihprop (propuestas, sincronizado) · aihver (versiones, local).
   ════════════════════════════════════════════════════════════════════ */

var _aihTab = 'terreno';
var _aihCuartel = null;
var _aihRegId = null;
var _aihDraft = {};       // idx → nuevo estado (borrador en pantalla)
var _aihInvertido = false; // solo orden VISUAL del listado (no altera datos)
var _aihPropAbierta = null;

function _aihEstados(){ return (typeof IP_ESTADOS!=='undefined') ? IP_ESTADOS : {
  'sano':{label:'Sano',color:'#1a7e3e'},'debil':{label:'Débil',color:'#f1c40f'},
  'muerto':{label:'Muerto',color:'#000000'},'replante':{label:'Replante',color:'#ffffff'},
  'falta':{label:'Falla/vacío',color:'#999999'} }; }

function _aihProps(){ return (STATE.cache.aihprop||[]).slice(); }
function _aihRegs(){ return (STATE.cache.invplantas||[]).slice(); }
function _aihReg(id){ return _aihRegs().find(function(x){ return String(x.id)===String(id); }); }
function _aihPendientes(){ return _aihProps().filter(function(p){ return p.estado==='pendiente'; }); }
function _aihFmtFecha(ts){ try{ return new Date(ts).toLocaleString('es-CL'); }catch(e){ return String(ts); } }

/* ── Render principal ── */
function renderAIH(main){
  if(!can('aih.ver')){ main.innerHTML='<div class="card" style="padding:20px">Sin acceso a este módulo.</div>'; return; }
  var pend=_aihPendientes().length;
  var tabs='';
  if(can('aih.proponer')) tabs+='<button onclick="aihTab(\'terreno\')" style="'+_aihTabCss(_aihTab==='terreno')+'">📱 Terreno</button>';
  if(can('aih.aprobar')){
    tabs+='<button onclick="aihTab(\'revision\')" style="'+_aihTabCss(_aihTab==='revision')+'">✅ Revisión'+(pend?' <span style="background:#e74c3c;color:#fff;border-radius:10px;padding:1px 7px;font-size:11px;margin-left:4px">'+pend+'</span>':'')+'</button>';
    tabs+='<button onclick="aihTab(\'versiones\')" style="'+_aihTabCss(_aihTab==='versiones')+'">🗄️ Versiones</button>';
  }
  var body='';
  if(_aihTab==='terreno' && can('aih.proponer')) body=_aihRenderTerreno();
  else if(_aihTab==='revision' && can('aih.aprobar')) body=_aihRenderRevision();
  else if(_aihTab==='versiones' && can('aih.aprobar')) body=_aihRenderVersiones();
  else body=_aihRenderTerreno();
  main.innerHTML =
    '<div class="card" style="padding:16px">'+
      '<div style="font-size:18px;font-weight:800;color:#1a3a5c;margin-bottom:2px">🔄 Actualización Inventario Huerto</div>'+
      '<div style="font-size:12px;color:#7a8794;margin-bottom:12px">Cambios de estado en terreno con revisión del administrador antes de aplicar. Solo estado: no agrega, elimina ni cambia el tipo de plantas.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+tabs+'</div>'+
      '<div id="aih-body">'+body+'</div>'+
    '</div>';
}
function _aihTabCss(act){
  return 'padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid '+(act?'#0a6ed1;background:#0a6ed1;color:#fff':'#d5dde5;background:#fff;color:#3a4a5a');
}
function aihTab(t){ _aihTab=t; _aihCuartel=null; _aihRegId=null; _aihDraft={}; _aihPropAbierta=null; _aihRefresh(); }
function _aihRefresh(){ var m=document.getElementById('main-content')||document.querySelector('main'); if(m) renderAIH(m); }

/* ════════ TAB TERRENO ════════ */
function _aihRenderTerreno(){
  var regs=_aihRegs();
  if(!regs.length) return '<div style="padding:20px;color:#7a8794">No hay hileras registradas en el Inventario de Huerto.</div>';
  // Nivel 1: cuarteles
  if(!_aihCuartel){
    var cus={};
    regs.forEach(function(r){ var c=r.cuartel||'—'; cus[c]=(cus[c]||0)+1; });
    return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">'+
      Object.keys(cus).sort().map(function(c){
        return '<div onclick="aihSelCuartel(\''+escapeHtml(c).replace(/'/g,"\\'")+'\')" style="padding:16px;background:#f4f8fc;border:1px solid #d5e3f0;border-radius:10px;cursor:pointer">'+
          '<div style="font-weight:800;color:#1a3a5c">📍 '+escapeHtml(c)+'</div>'+
          '<div style="font-size:12px;color:#7a8794">'+cus[c]+' hilera(s)</div></div>';
      }).join('')+'</div>';
  }
  // Nivel 2: hileras del cuartel
  if(!_aihRegId){
    var hs=regs.filter(function(r){ return r.cuartel===_aihCuartel; }).sort(function(a,b){
      return (parseInt(String(a.hilera).replace(/[^0-9]/g,''))||0)-(parseInt(String(b.hilera).replace(/[^0-9]/g,''))||0);
    });
    return '<div style="margin-bottom:10px"><button onclick="aihSelCuartel(null)" style="padding:7px 12px;border:1px solid #d5dde5;background:#fff;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">← Cuarteles</button> <span style="font-weight:800;color:#1a3a5c;margin-left:6px">'+escapeHtml(_aihCuartel)+'</span></div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px">'+
      hs.map(function(r){
        var n=(r.plantas||[]).length;
        return '<div onclick="aihSelHilera(\''+escapeHtml(String(r.id)).replace(/'/g,"\\'")+'\')" style="padding:12px;background:#fff;border:1px solid #d5e3f0;border-radius:10px;cursor:pointer">'+
          '<div style="font-weight:800;color:#0a5288">'+escapeHtml(r.hilera||'—')+'</div>'+
          '<div style="font-size:11px;color:#7a8794">'+n+' plantas</div></div>';
      }).join('')+'</div>';
  }
  // Nivel 3: plantas de la hilera — solo cambio de estado
  var reg=_aihReg(_aihRegId);
  if(!reg) return '<div style="padding:20px;color:#c0392b">Hilera no encontrada.</div>';
  var EST=_aihEstados();
  var plantas=reg.plantas||[];
  var nCambios=Object.keys(_aihDraft).length;
  var html='<div style="margin-bottom:10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+
    '<button onclick="aihSelHilera(null)" style="padding:7px 12px;border:1px solid #d5dde5;background:#fff;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">← Hileras</button>'+
    '<span style="font-weight:800;color:#1a3a5c">'+escapeHtml(reg.cuartel||'')+' · '+escapeHtml(reg.hilera||'')+'</span>'+
    '<span style="font-size:12px;color:#7a8794">'+plantas.length+' plantas</span>'+
    '<button onclick="aihInvertirVista()" style="margin-left:auto;padding:8px 14px;border:1px solid #f0c36d;background:#fff8e6;color:#8a6d1a;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer">🔄 '+(_aihInvertido?'Ver desde planta 1':'Ver desde la última')+'</button>'+
  '</div>';
  html+='<div style="font-size:11px;color:#7a8794;margin-bottom:8px">Recorrido: '+(_aihInvertido?('#'+plantas.length+' → #1 (desde el final de la hilera)'):('#1 → #'+plantas.length+' (desde el inicio de la hilera)'))+'. Solo cambia el orden en pantalla; la numeración de cada planta se mantiene.</div>';
  html+='<div style="display:flex;flex-direction:column;gap:6px">';
  // Orden VISUAL: se recorre invertido si corresponde, pero cada fila conserva
  // su índice real (i) para el borrador, la propuesta y la aplicación.
  var _orden=plantas.map(function(_,k){ return k; });
  if(_aihInvertido) _orden.reverse();
  _orden.forEach(function(i){
    var p=plantas[i];
    var estActual=p.estado||'sano';
    var borr=_aihDraft[i];
    var e=EST[estActual]||EST.sano;
    var esPol=(p.tipo==='poliniz');
    html+='<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:'+(borr!==undefined?'#fff8e6':'#fff')+';border:1px solid '+(borr!==undefined?'#f0c36d':'#e5ebf1')+';border-radius:8px;flex-wrap:wrap">'+
      '<span style="width:38px;font-weight:800;color:#3a4a5a;font-size:13px">#'+(i+1)+'</span>'+
      '<span style="width:14px;height:14px;border-radius:50%;background:'+e.color+';border:'+(esPol?'2.5px solid #000':'1px solid #aaa')+';display:inline-block"></span>'+
      (esPol?'<span style="font-size:11px;font-weight:700;color:#6b21a8">🐝 '+escapeHtml(p.polinizante||reg.polinizante||'POL')+'</span>':'')+
      '<span style="font-size:12px;color:#7a8794">'+(EST[estActual]?EST[estActual].label:estActual)+(borr!==undefined?' → <b style="color:#b45309">'+(EST[borr]?EST[borr].label:borr)+'</b>':'')+'</span>'+
      '<span style="margin-left:auto;display:flex;gap:4px;flex-wrap:wrap">'+
        Object.keys(EST).map(function(k){
          var sel=(borr!==undefined?borr:estActual)===k;
          return '<button onclick="aihSetEstado('+i+',\''+k+'\')" title="'+EST[k].label+'" style="width:26px;height:26px;border-radius:50%;cursor:pointer;background:'+EST[k].color+';border:'+(sel?'3px solid #0a6ed1':'1px solid #bbb')+'"></button>';
        }).join('')+
      '</span>'+
    '</div>';
  });
  html+='</div>';
  html+='<div style="position:sticky;bottom:0;margin-top:12px;padding:10px;background:#fff;border-top:2px solid #e5ebf1;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
    '<span style="font-weight:800;color:'+(nCambios?'#b45309':'#7a8794')+'">'+nCambios+' cambio(s) pendiente(s)</span>'+
    (nCambios?'<button onclick="aihLimpiarDraft()" style="padding:9px 14px;border:1px solid #d5dde5;background:#fff;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Descartar</button>':'')+
    (nCambios?'<button onclick="aihEnviarPropuesta()" style="padding:9px 16px;border:none;background:#0a6ed1;color:#fff;border-radius:8px;font-size:13px;font-weight:800;cursor:pointer">📤 Enviar a revisión</button>':'')+
  '</div>';
  return html;
}
function aihSelCuartel(c){ _aihCuartel=c; _aihRegId=null; _aihDraft={}; _aihRefresh(); }
function aihSelHilera(id){ _aihRegId=id; _aihDraft={}; _aihRefresh(); }
function aihSetEstado(i,k){
  var reg=_aihReg(_aihRegId); if(!reg) return;
  var actual=(reg.plantas[i]&&reg.plantas[i].estado)||'sano';
  if(k===actual){ delete _aihDraft[i]; } else { _aihDraft[i]=k; }
  _aihRefresh();
}
function aihLimpiarDraft(){ _aihDraft={}; _aihRefresh(); }
// Invierte SOLO el orden de lectura en pantalla, para recorrer la hilera en el
// sentido en que se camina en terreno. No altera datos ni la numeración.
function aihInvertirVista(){ _aihInvertido=!_aihInvertido; _aihRefresh(); }

async function aihEnviarPropuesta(){
  var reg=_aihReg(_aihRegId); if(!reg) return;
  var idxs=Object.keys(_aihDraft); if(!idxs.length) return;
  var cambios=idxs.map(function(i){
    i=parseInt(i,10);
    var p=reg.plantas[i]||{};
    return { i:i, seq:i+1, tipo:p.tipo||'planta', de:(p.estado||'sano'), a:_aihDraft[i] };
  });
  var prop={
    id:'AIH-'+Date.now()+'-'+Math.floor(Math.random()*1000),
    fecha:Date.now(),
    usuario:(STATE.user&&(STATE.user.nombre||STATE.user.username))||'?',
    regId:reg.id, cuartel:reg.cuartel||'', hilera:reg.hilera||'',
    nPlantas:(reg.plantas||[]).length,
    cambios:cambios, estado:'pendiente'
  };
  try{
    await dbPut('aihprop', prop);
    STATE.cache.aihprop=await dbAll('aihprop');
  }catch(e){ console.error(e); toast('Error','No se pudo guardar la propuesta','error'); return; }
  _aihDraft={};
  toast('Propuesta enviada','Quedó pendiente de revisión del administrador ('+cambios.length+' cambio(s))','success');
  _aihRefresh();
}

/* ════════ TAB REVISIÓN ════════ */
function _aihRenderRevision(){
  var props=_aihProps().sort(function(a,b){
    var pa=(a.estado==='pendiente')?0:1, pb=(b.estado==='pendiente')?0:1;
    return pa-pb || (b.fecha-a.fecha);
  });
  if(!props.length) return '<div style="padding:20px;color:#7a8794">No hay propuestas.</div>';
  var EST=_aihEstados();
  return props.map(function(pr){
    var badge = pr.estado==='pendiente' ? '<span style="background:#fff3cd;color:#8a6d1a;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:800">PENDIENTE</span>'
      : pr.estado==='aplicada' ? '<span style="background:#d4edda;color:#1a7e3e;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:800">APLICADA</span>'
      : '<span style="background:#f8d7da;color:#a02330;border-radius:6px;padding:2px 8px;font-size:11px;font-weight:800">RECHAZADA</span>';
    var abierta=(_aihPropAbierta===pr.id);
    var det='';
    if(abierta){
      det='<div style="margin-top:10px;border-top:1px solid #e5ebf1;padding-top:10px">'+
        '<table style="width:100%;font-size:12px;border-collapse:collapse">'+
        '<tr style="color:#7a8794;text-align:left"><th style="padding:4px">Planta</th><th>Tipo</th><th>Estado actual</th><th>→ Propuesto</th></tr>'+
        (pr.cambios||[]).map(function(c){
          var de=EST[c.de]?EST[c.de].label:c.de, a=EST[c.a]?EST[c.a].label:c.a;
          return '<tr style="border-top:1px solid #f0f4f8"><td style="padding:4px;font-weight:700">#'+c.seq+'</td><td>'+(c.tipo==='poliniz'?'🐝 Poliniz.':'Planta')+'</td><td>'+de+'</td><td style="font-weight:800;color:#b45309">'+a+'</td></tr>';
        }).join('')+'</table>'+
        (pr.estado==='pendiente' && can('aih.aprobar') ?
          '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">'+
          '<button onclick="aihAprobar(\''+pr.id+'\')" style="padding:9px 16px;border:none;background:#1a7e3e;color:#fff;border-radius:8px;font-size:13px;font-weight:800;cursor:pointer">✅ Aprobar y aplicar</button>'+
          '<button onclick="aihRechazar(\''+pr.id+'\')" style="padding:9px 16px;border:1px solid #e0a0a8;background:#fff;color:#a02330;border-radius:8px;font-size:13px;font-weight:800;cursor:pointer">✖ Rechazar</button>'+
          '</div>' : '')+
        (pr.motivo?'<div style="margin-top:8px;font-size:12px;color:#a02330">Motivo rechazo: '+escapeHtml(pr.motivo)+'</div>':'')+
        (pr.versionId?'<div style="margin-top:8px;font-size:12px;color:#7a8794">Respaldo previo: '+escapeHtml(pr.versionId)+' (pestaña Versiones)</div>':'')+
      '</div>';
    }
    return '<div style="padding:12px;background:#fff;border:1px solid #e5ebf1;border-radius:10px;margin-bottom:8px;cursor:pointer" onclick="aihToggleProp(\''+pr.id+'\')">'+
      '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
        badge+
        '<span style="font-weight:800;color:#1a3a5c">'+escapeHtml(pr.cuartel)+' · '+escapeHtml(pr.hilera)+'</span>'+
        '<span style="font-size:12px;color:#7a8794">'+(pr.cambios||[]).length+' cambio(s) · '+escapeHtml(pr.usuario)+' · '+_aihFmtFecha(pr.fecha)+'</span>'+
        '<span style="margin-left:auto;color:#0a6ed1;font-weight:800">'+(abierta?'▲':'▼')+'</span>'+
      '</div>'+det+'</div>';
  }).join('');
}
function aihToggleProp(id){ _aihPropAbierta=(_aihPropAbierta===id)?null:id; _aihRefresh(); }

async function aihAprobar(id){
  if(!can('aih.aprobar')) return;
  var pr=_aihProps().find(function(x){ return x.id===id; });
  if(!pr || pr.estado!=='pendiente') return;
  var reg=_aihReg(pr.regId);
  if(!reg){ toast('Error','La hilera de la propuesta ya no existe','error'); return; }
  if(!confirm('¿Aprobar y aplicar '+(pr.cambios||[]).length+' cambio(s) de estado en '+pr.cuartel+' '+pr.hilera+'?\nSe guardará un respaldo de la hilera antes de aplicar.')) return;
  // 1) Versión de respaldo (local, no sincronizada) ANTES de aplicar
  var ver={
    id:'VER-'+Date.now()+'-'+Math.floor(Math.random()*1000),
    fecha:Date.now(),
    usuario:(STATE.user&&(STATE.user.nombre||STATE.user.username))||'?',
    propId:pr.id, regId:reg.id, cuartel:reg.cuartel||'', hilera:reg.hilera||'',
    data:JSON.parse(JSON.stringify(reg))
  };
  // 2) Aplicar SOLO estado, verificando que la planta siga siendo la misma
  var aplicados=0, omitidos=0;
  (pr.cambios||[]).forEach(function(c){
    var p=reg.plantas && reg.plantas[c.i];
    if(p && (p.estado||'sano')===c.de && (p.tipo||'planta')===(c.tipo||'planta')){
      p.estado=c.a; aplicados++;
    } else { omitidos++; }  // la planta cambió desde la propuesta → no tocar
  });
  reg.sincronizado=false;
  try{
    await dbPutLocal('aihver', ver);
    await dbPut('invplantas', reg);
    pr.estado='aplicada'; pr.fechaRevision=Date.now();
    pr.revisor=(STATE.user&&(STATE.user.nombre||STATE.user.username))||'?';
    pr.versionId=ver.id; pr.aplicados=aplicados; pr.omitidos=omitidos;
    await dbPut('aihprop', pr);
    STATE.cache.invplantas=await dbAll('invplantas');
    STATE.cache.aihprop=await dbAll('aihprop');
  }catch(e){ console.error(e); toast('Error','No se pudo aplicar','error'); return; }
  toast('Propuesta aplicada', aplicados+' cambio(s) aplicado(s)'+(omitidos?' · '+omitidos+' omitido(s) por diferencias con el inventario actual':'')+'. Respaldo: '+ver.id,'success');
  _aihRefresh();
}

async function aihRechazar(id){
  if(!can('aih.aprobar')) return;
  var pr=_aihProps().find(function(x){ return x.id===id; });
  if(!pr || pr.estado!=='pendiente') return;
  var motivo=prompt('Motivo del rechazo (opcional):')||'';
  pr.estado='rechazada'; pr.fechaRevision=Date.now(); pr.motivo=motivo;
  pr.revisor=(STATE.user&&(STATE.user.nombre||STATE.user.username))||'?';
  try{
    await dbPut('aihprop', pr);
    STATE.cache.aihprop=await dbAll('aihprop');
  }catch(e){ console.error(e); toast('Error','No se pudo guardar','error'); return; }
  toast('Propuesta rechazada','','success');
  _aihRefresh();
}

/* ════════ TAB VERSIONES ════════ */
function _aihRenderVersiones(){
  setTimeout(_aihCargarVersiones, 0);
  return '<div id="aih-vers" style="color:#7a8794;padding:10px">Cargando versiones…</div>';
}
function _aihCargarVersiones(){
  dbAll('aihver').then(function(vers){
    var el=document.getElementById('aih-vers'); if(!el) return;
    vers=(vers||[]).sort(function(a,b){ return b.fecha-a.fecha; });
    if(!vers.length){ el.innerHTML='<div style="padding:10px;color:#7a8794">No hay versiones guardadas. Se crean automáticamente al aprobar propuestas.</div>'; return; }
    el.innerHTML='<div style="font-size:12px;color:#7a8794;margin-bottom:8px">Respaldos previos a cada aplicación (guardados en este dispositivo). Restaurar deja la hilera exactamente como estaba en ese momento.</div>'+
      vers.map(function(v){
        return '<div style="padding:12px;background:#fff;border:1px solid #e5ebf1;border-radius:10px;margin-bottom:8px;display:flex;align-items:center;gap:10px;flex-wrap:wrap">'+
          '<span style="font-weight:800;color:#1a3a5c">'+escapeHtml(v.cuartel)+' · '+escapeHtml(v.hilera)+'</span>'+
          '<span style="font-size:12px;color:#7a8794">'+_aihFmtFecha(v.fecha)+' · '+escapeHtml(v.usuario)+' · '+((v.data&&v.data.plantas)||[]).length+' plantas · '+escapeHtml(v.id)+'</span>'+
          '<button onclick="aihRestaurar(\''+v.id+'\')" style="margin-left:auto;padding:8px 14px;border:1px solid #f0c36d;background:#fff8e6;color:#8a6d1a;border-radius:8px;font-size:12px;font-weight:800;cursor:pointer">♻️ Restaurar</button>'+
        '</div>';
      }).join('');
  }).catch(function(e){ console.error(e); });
}
async function aihRestaurar(id){
  if(!can('aih.aprobar')) return;
  var vers=await dbAll('aihver');
  var v=(vers||[]).find(function(x){ return x.id===id; });
  if(!v || !v.data){ toast('Error','Versión no encontrada','error'); return; }
  if(!confirm('¿Restaurar '+v.cuartel+' '+v.hilera+' al estado del '+_aihFmtFecha(v.fecha)+'?\nEsto sobreescribe la hilera actual del inventario (y se sincroniza).')) return;
  var data=JSON.parse(JSON.stringify(v.data));
  data.sincronizado=false;
  try{
    await dbPut('invplantas', data);
    STATE.cache.invplantas=await dbAll('invplantas');
  }catch(e){ console.error(e); toast('Error','No se pudo restaurar','error'); return; }
  toast('Versión restaurada', v.cuartel+' '+v.hilera+' volvió al estado del '+_aihFmtFecha(v.fecha),'success');
  _aihRefresh();
}

/* Exposición global (patrón del proyecto) */
try{
  window.renderAIH=renderAIH; window.aihTab=aihTab;
  window.aihSelCuartel=aihSelCuartel; window.aihSelHilera=aihSelHilera;
  window.aihSetEstado=aihSetEstado; window.aihLimpiarDraft=aihLimpiarDraft;
  window.aihInvertirVista=aihInvertirVista;
  window.aihEnviarPropuesta=aihEnviarPropuesta; window.aihToggleProp=aihToggleProp;
  window.aihAprobar=aihAprobar; window.aihRechazar=aihRechazar;
  window.aihRestaurar=aihRestaurar;
}catch(e){}
