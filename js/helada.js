/* ════════════════════════════════════════════════════════════════════
   SCI — Control de Heladas (hel*)
   Registro de los eventos de helada de la temporada y del funcionamiento
   de las torres de control.
   Estructura: UN REGISTRO POR TORRE Y POR NOCHE (plano). Una misma noche
   con 3 torres operando = 3 registros con la misma fecha.
   Stores: heladas (sincronizado) · catálogo de torres en config/helTorres.
   ════════════════════════════════════════════════════════════════════ */

var _helTab      = 'registros';
var _helEditId   = null;      // id del registro en edición (null = nuevo)
var _helFTemp    = '';        // filtro temporada
var _helFTorre   = '';        // filtro torre

var HEL_TORRES_DEFAULT = ['TORRE CONTROL HELADA 1','TORRE CONTROL HELADA 2'];
function _helNorm(n){ return (typeof normEquipo==='function') ? normEquipo(n) : String(n==null?'':n).replace(/\s+/g,' ').trim().toUpperCase(); }

/* ─────────────── Datos ─────────────── */
function _helRegs(){ return (STATE.cache.heladas||[]).slice(); }

// Catálogo de torres (configurable). Vive en config → se sincroniza.
function _helTorres(){
  try{
    var c=STATE.cache.config||{};
    var cfg=c.helTorres;
    if(cfg && Array.isArray(cfg.lista) && cfg.lista.length) return cfg.lista.slice();
  }catch(e){}
  return HEL_TORRES_DEFAULT.slice();
}
async function _helGuardarTorres(lista){
  await dbPut('config',{key:'helTorres', lista:lista});
  STATE.cache.config=STATE.cache.config||{};
  STATE.cache.config.helTorres={key:'helTorres', lista:lista};
}

/* Temporada agrícola a partir de una fecha ISO (mayo–abril, igual que el resto
   del sistema). Se guarda en el registro para poder agrupar por temporada. */
function _helTemporada(fechaISO){
  try{
    if(typeof temporadaDeMesAnio==='function'){
      var d=new Date(fechaISO+'T12:00:00');
      var m=d.getMonth(), y=d.getFullYear();
      var inicio=(m>=4)?y:(y-1);
      return inicio+'-'+(inicio+1);
    }
  }catch(e){}
  return '';
}

/* Horas de control por reloj. El control de heladas cruza la medianoche
   (ej. inicio 23:30 → término 06:00), así que un término menor que el inicio
   se interpreta como del día siguiente, no como un error. */
function _helHorasReloj(hIni,hFin){
  if(!hIni||!hFin) return null;
  var a=hIni.split(':'), b=hFin.split(':');
  if(a.length<2||b.length<2) return null;
  var m1=parseInt(a[0],10)*60+parseInt(a[1],10);
  var m2=parseInt(b[0],10)*60+parseInt(b[1],10);
  if(isNaN(m1)||isNaN(m2)) return null;
  var dif=m2-m1;
  if(dif<0) dif+=24*60;            // cruzó la medianoche
  return dif/60;
}
function _helHorasHorom(r){
  var hi=parseFloat(r.horometroInicial), hf=parseFloat(r.horometroFinal);
  if(isNaN(hi)||isNaN(hf)) return null;
  return hf-hi;
}
/* Registros vecinos en el tiempo para una torre.
   El horómetro es acumulativo, así que la lectura de un registro debe caber
   ENTRE la del registro anterior y la del siguiente. Comparar contra el máximo
   global solo funciona al agregar al final: al editar un registro antiguo (o al
   cargar uno con fecha retroactiva) el máximo pertenece a una noche POSTERIOR y
   la validación fallaba aunque el dato fuera correcto. */
function _helHoromVecinos(torre, fecha, excluirId){
  var antes=null, despues=null;
  _helRegs().forEach(function(r){
    if(r.torre!==torre) return;
    if(excluirId && String(r.id)===String(excluirId)) return;
    var f=String(r.fecha||'');
    if(!f || !fecha) return;
    if(f < fecha){
      var vf=parseFloat(r.horometroFinal);
      if(!isNaN(vf) && (!antes || f>antes.fecha || (f===antes.fecha && vf>antes.valor))){
        antes={valor:vf, fecha:f};
      }
    }else if(f > fecha){
      var vi=parseFloat(r.horometroInicial);
      if(!isNaN(vi) && (!despues || f<despues.fecha || (f===despues.fecha && vi<despues.valor))){
        despues={valor:vi, fecha:f};
      }
    }
  });
  return {antes:antes, despues:despues};
}
function _helFmtH(n){ return (n===null||n===undefined||isNaN(n))?'—':(typeof fmtNum==='function'?fmtNum(n,2):Number(n).toFixed(2)); }
function _helFmtFecha(iso){
  if(!iso) return '—';
  try{ var p=String(iso).split('-'); return p[2]+'-'+p[1]+'-'+p[0]; }catch(e){ return String(iso); }
}
function _helEsc(s){ return (typeof escapeHtml==='function')?escapeHtml(s==null?'':String(s)):String(s==null?'':s); }

/* ─────────────── Render principal ─────────────── */
function renderHelada(main){
  if(!can('helada.ver')){
    main.innerHTML='<div class="card" style="padding:20px">Sin acceso a este módulo.</div>';
    return;
  }
  var puedeReg=can('helada.registrar');
  var esAdmin=can('config.editar');
  try{ _helAutoActualizar(); }catch(e){}   // una vez al día, en segundo plano
  var riesgo=_helRiesgoHelada();
  var tabs='';
  tabs+='<button onclick="helTab(0)" style="'+_helTabCss(_helTab==='registros')+'">❄️ Registros</button>';
  if(puedeReg) tabs+='<button onclick="helTab(1)" style="'+_helTabCss(_helTab==='form')+'">📝 '+(_helEditId?'Editando':'Nuevo registro')+'</button>';
  tabs+='<button onclick="helTab(4)" style="'+_helTabCss(_helTab==='clima')+'">🌤️ Clima'+
        (riesgo?'<span style="background:'+(riesgo.minima<=0?'#b91c1c':'#b45309')+';color:#fff;border-radius:9px;padding:1px 6px;font-size:10px;margin-left:6px">'+riesgo.dias.length+'</span>':'')+
        '</button>';
  tabs+='<button onclick="helTab(3)" style="'+_helTabCss(_helTab==='diesel')+'">⛽ Diésel</button>';
  if(esAdmin)  tabs+='<button onclick="helTab(2)" style="'+_helTabCss(_helTab==='torres')+'">🗼 Torres</button>';

  var body='';
  if(_helTab==='form' && puedeReg)       body=_helRenderForm();
  else if(_helTab==='torres' && esAdmin) body=_helRenderTorres();
  else if(_helTab==='diesel')            body=_helRenderDiesel();
  else if(_helTab==='clima')             body=_helRenderClima();
  else                                   body=_helBannerRiesgo()+_helRenderLista();

  main.innerHTML=
    '<div class="card" style="padding:16px">'+
      '<div style="font-size:18px;font-weight:800;color:#1a3a5c;margin-bottom:2px">❄️ Control de Heladas</div>'+
      '<div style="font-size:12px;color:#7a8794;margin-bottom:12px">Eventos de helada de la temporada y funcionamiento de las torres de control. Un registro por torre y por noche.</div>'+
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">'+tabs+'</div>'+
      '<div id="hel-body">'+body+'</div>'+
    '</div>';
}
function _helTabCss(act){
  return 'padding:9px 16px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer;border:1px solid '+
    (act?'#0a6ed1;background:#0a6ed1;color:#fff':'#d5dde5;background:#fff;color:#3a4a5a');
}
// Índices numéricos en el onclick: evita problemas de escape con textos.
function helTab(i){
  _helTab=(i===1)?'form':(i===2)?'torres':(i===3)?'diesel':(i===4)?'clima':'registros';
  if(i!==1) _helEditId=null;
  _helRefresh();
}
function _helRefresh(){
  var m=document.getElementById('mainContent')||document.getElementById('main-content')||document.querySelector('main');
  if(m) renderHelada(m);
}

/* ════════ TAB REGISTROS ════════ */
function _helRenderLista(){
  var regs=_helRegs();
  var temporadas=[]; regs.forEach(function(r){ if(r.temporada && temporadas.indexOf(r.temporada)<0) temporadas.push(r.temporada); });
  temporadas.sort().reverse();
  if(!_helFTemp && temporadas.length) _helFTemp=temporadas[0];   // por defecto, la más reciente
  var torres=_helTorres();

  var filtrados=regs.filter(function(r){
    if(_helFTemp && r.temporada!==_helFTemp) return false;
    if(_helFTorre && r.torre!==_helFTorre) return false;
    return true;
  }).sort(function(a,b){
    return String(b.fecha||'').localeCompare(String(a.fecha||'')) || String(a.torre||'').localeCompare(String(b.torre||''));
  });

  // ── Resumen de la temporada filtrada ──
  var noches={}, horas=0, tMin=null, nAuto=0;
  filtrados.forEach(function(r){
    if(r.fecha) noches[r.fecha]=1;
    var h=_helHorasHorom(r); if(h!==null && h>0) horas+=h;
    var t=parseFloat(r.tempMinima); if(!isNaN(t) && (tMin===null||t<tMin)) tMin=t;
    if(r.partida==='auto') nAuto++;
  });
  var nNoches=Object.keys(noches).length;
  // Saldo vigente: última lectura de cada torre (tomada al terminar el evento)
  var saldo=_helSaldoEstanques(_helFTemp||null);
  var ultPorTorre=saldo.porTorre, nTorresEst=saldo.nTorres;

  var cards=
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:14px">'+
      _helCard('Noches de helada', nNoches, 'eventos con control', '#0a6ed1')+
      _helCard('Horas de torre', _helFmtH(horas), 'suma por horómetro', '#7c3aed')+
      _helCard('Temp. mínima', (tMin===null?'—':_helFmtH(tMin)+' °C'), 'de la temporada', '#b91c1c')+
      _helCard('Registros', filtrados.length, nAuto+' con partida automática', '#15803d')+
      _helCardEstanque(ultPorTorre, nTorresEst)+
    '</div>';

  // ── Filtros ──
  var optTemp='<option value="">Todas</option>'+temporadas.map(function(t,i){
    return '<option value="'+_helEsc(t)+'"'+(t===_helFTemp?' selected':'')+'>'+_helEsc(t)+'</option>'; }).join('');
  var optTorre='<option value="">Todas</option>'+torres.map(function(t){
    return '<option value="'+_helEsc(t)+'"'+(t===_helFTorre?' selected':'')+'>'+_helEsc(t)+'</option>'; }).join('');
  var filtros=
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px">'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">TEMPORADA</label>'+
        '<select id="hel-f-temp" onchange="helFiltrar()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+optTemp+'</select></div>'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">TORRE</label>'+
        '<select id="hel-f-torre" onchange="helFiltrar()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+optTorre+'</select></div>'+
      (can('helada.registrar')?'<button class="btn btn-primary" onclick="helNuevo()">➕ Nuevo registro</button>':'')+
      (filtrados.length?'<button class="btn btn-secondary" onclick="helExportar()">📊 Exportar CSV</button>':'')+
    '</div>';

  if(!filtrados.length){
    return cards+filtros+'<div style="color:#999;padding:26px;text-align:center;font-size:13px">No hay registros de helada'+(_helFTemp?(' para la temporada '+_helEsc(_helFTemp)):'')+'.</div>';
  }

  var filas=filtrados.map(function(r,i){
    // El índice es del arreglo FILTRADO: se resuelve el id real antes de usarlo.
    var hH=_helHorasHorom(r), hR=_helHorasReloj(r.horaInicio,r.horaTermino);
    var badge=(r.partida==='auto')
      ? '<span style="background:#dcfce7;color:#15803d;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700">AUTO</span>'
      : '<span style="background:#fef3c7;color:#92600a;padding:2px 7px;border-radius:6px;font-size:10px;font-weight:700">MANUAL</span>';
    var acc='';
    if(can('helada.registrar')) acc+='<button onclick="helEditar('+i+')" title="Editar" style="background:#0a6ed1;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px">✎</button>';
    if(can('config.editar'))    acc+='<button onclick="helEliminar('+i+')" title="Eliminar" style="background:#b91c1c;color:#fff;border:none;border-radius:6px;padding:4px 8px;font-size:11px;font-weight:700;cursor:pointer">🗑</button>';
    return '<tr style="border-bottom:1px solid #eee">'+
      '<td style="padding:7px 9px;white-space:nowrap;font-weight:700">'+_helFmtFecha(r.fecha)+'</td>'+
      '<td style="padding:7px 9px">'+_helEsc(r.torre)+'<div style="font-size:10px;color:#888">'+_helEsc(r.responsable||'')+'</div></td>'+
      '<td style="padding:7px 9px;text-align:center;white-space:nowrap">'+_helEsc(r.horaInicio||'—')+' → '+_helEsc(r.horaTermino||'—')+
        (hR!==null?('<div style="font-size:10px;color:#888">'+_helFmtH(hR)+' h reloj</div>'):'')+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+
        (r.tempInicio!==''&&r.tempInicio!=null?_helFmtH(parseFloat(r.tempInicio))+' °C':'—')+
        (r.tempApagado!==''&&r.tempApagado!=null?(' → '+_helFmtH(parseFloat(r.tempApagado))+' °C'):'')+
        (r.tempMinima!==''&&r.tempMinima!=null?('<div style="font-size:10px;color:#b91c1c">mín '+_helFmtH(parseFloat(r.tempMinima))+' °C</div>'):'')+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+_helFmtH(hH)+' h'+
        '<div style="font-size:10px;color:#888">'+_helFmtH(parseFloat(r.horometroInicial))+' → '+_helFmtH(parseFloat(r.horometroFinal))+'</div></td>'+
      '<td style="padding:7px 9px;text-align:center">'+badge+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+(r.litrosEstanque!==''&&r.litrosEstanque!=null?_helFmtH(parseFloat(r.litrosEstanque))+' L':'—')+'</td>'+
      '<td style="padding:7px 9px;text-align:center;white-space:nowrap">'+(acc||'—')+'</td>'+
    '</tr>';
  }).join('');

  // Guardar el orden mostrado para resolver los índices de los botones
  _helVista=filtrados;

  return cards+filtros+
    '<div style="overflow-x:auto">'+
    '<table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:820px">'+
      '<thead><tr style="background:#f5f7fa;border-bottom:2px solid #e3e8ee">'+
        '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">FECHA</th>'+
        '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">TORRE / RESPONSABLE</th>'+
        '<th style="padding:8px 9px;text-align:center;font-size:11px;color:#64748b">CONTROL</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">TEMPERATURA</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">HORÓMETRO</th>'+
        '<th style="padding:8px 9px;text-align:center;font-size:11px;color:#64748b">PARTIDA</th>'+
        '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">ESTANQUE</th>'+
        '<th style="padding:8px 9px;text-align:center;font-size:11px;color:#64748b"></th>'+
      '</tr></thead><tbody>'+filas+'</tbody></table></div>';
}
var _helVista=[];   // registros tal como se muestran (para resolver índices)

/* Saldo en estanques: última lectura informada de CADA torre.
   El campo "litros disponibles" del registro es el saldo AL TERMINAR el evento,
   así que la lectura más reciente de cada torre es el saldo vigente.
   Filtra por temporada si se indica. */
function _helSaldoEstanques(temporada){
  var porTorre={};
  _helRegs().forEach(function(r){
    if(temporada && r.temporada!==temporada) return;
    var l=parseFloat(r.litrosEstanque);
    if(isNaN(l)) return;
    var k=_helNorm(r.torre)||'—', prev=porTorre[k];
    if(!prev || _helEsPosterior(r, prev.reg)) porTorre[k]={litros:l, fecha:r.fecha, reg:r};
  });
  var total=0, n=0;
  Object.keys(porTorre).forEach(function(k){ total+=porTorre[k].litros; n++; });
  return {porTorre:porTorre, total:total, nTorres:n};
}

/* Consumo por hora de una torre (v148).
   Regla: cada salida de diésel registrada en SCI es una carga a la torre y
   todo lo cargado se quema. Por lo tanto:
     L/h = suma de cargas ÷ (horómetro final − horómetro inicial)
   Las lecturas de horómetro salen de las cargas y de los registros de helada.
   El saldo declarado en el último registro de helada NO entra al cálculo:
   solo se informa como validador (cargas posteriores a esa lectura deberían
   cuadrar con lo que queda en el estanque).
   cargas: [{fecha:'YYYY-MM-DD', litros:n, horom:n}]                        */
function helConsumoHoraTorre(torre, cargas, temporada){
  var k=_helNorm(torre), lect=[], litros=0;
  (cargas||[]).forEach(function(c){
    litros+=(Number(c.litros)||0);
    var h=Number(c.horom); if(h>0) lect.push(h);
  });
  var ult=null;
  _helRegs().forEach(function(r){
    if(_helNorm(r.torre)!==k) return;
    if(temporada && r.temporada!==temporada) return;
    var hi=parseFloat(r.horometroInicial), hf=parseFloat(r.horometroFinal);
    if(hi>0) lect.push(hi);
    if(hf>0) lect.push(hf);
    if(!isNaN(parseFloat(r.litrosEstanque)) && (!ult || _helEsPosterior(r, ult))) ult=r;
  });
  var hIni=lect.length?Math.min.apply(null,lect):0;
  var hFin=lect.length?Math.max.apply(null,lect):0;
  var horas=hFin-hIni;
  var val=null;
  if(ult){
    var fu=String(ult.fecha||''), post=0;
    (cargas||[]).forEach(function(c){ if(String(c.fecha||'').slice(0,10)>fu) post+=(Number(c.litros)||0); });
    val={fecha:fu, saldo:parseFloat(ult.litrosEstanque), cargasPost:post};
  }
  return {litros:litros, horas:horas, lh:(horas>0&&litros>0)?litros/horas:null,
          hIni:hIni, hFin:hFin, validador:val};
}
try{ window.helConsumoHoraTorre=helConsumoHoraTorre; }catch(e){}

/* ¿El registro a es posterior a b? Compara fecha (ISO, comparable como texto)
   y desempata por hora de término y por marca de creación. */
function _helEsPosterior(a,b){
  var fa=String(a.fecha||''), fb=String(b.fecha||'');
  if(fa!==fb) return fa>fb;
  var ha=String(a.horaTermino||''), hb=String(b.horaTermino||'');
  if(ha!==hb) return ha>hb;
  return String(a.createdAt||'')>String(b.createdAt||'');
}

/* Tarjeta de estanque: una línea por torre con su última lectura y la fecha.
   Ocupa dos columnas cuando hay más de una torre, para que no se comprima. */
function _helCardEstanque(ultPorTorre, nTorres){
  var keys=Object.keys(ultPorTorre).sort();
  var cuerpo;
  if(!keys.length){
    cuerpo='<div style="font-size:20px;font-weight:800;color:#c2831a;margin:2px 0">—</div>'+
           '<div style="font-size:10px;color:#94a3b8">sin lecturas informadas</div>';
  }else{
    cuerpo=keys.map(function(k){
      var v=ultPorTorre[k];
      return '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;padding:3px 0;border-top:1px solid #f1f5f9">'+
          '<span style="font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_helEsc(k)+
            '<span style="color:#94a3b8;font-size:9.5px"> · '+_helFmtFecha(v.fecha)+'</span></span>'+
          '<span style="font-size:15px;font-weight:800;color:#c2831a;white-space:nowrap">'+_helFmtH(v.litros)+' L</span>'+
        '</div>';
    }).join('');
    cuerpo='<div style="margin-top:2px">'+cuerpo+'</div>';
  }
  return '<div style="border:1px solid #e3e8ee;border-radius:9px;padding:10px 12px;background:#fff'+
      (nTorres>1?';grid-column:span 2':'')+'">'+
    '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Estanque · saldo al terminar el último evento</div>'+
    cuerpo+
  '</div>';
}

function _helCard(titulo,valor,sub,color){
  // El valor no debe partirse: sin `nowrap`, en móvil el "$" y la "L" caían a
  // una línea aparte del número. Como no puede quebrarse, se reduce el tamaño
  // cuando el texto es largo para que igual entre en la columna.
  var txt=String(valor==null?'':valor);
  var fs = (txt.length<=9) ? 20 : (txt.length<=13 ? 17 : 15);
  return '<div style="border:1px solid #e3e8ee;border-radius:9px;padding:10px 12px;background:#fff;min-width:0">'+
    '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">'+_helEsc(titulo)+'</div>'+
    '<div style="font-size:'+fs+'px;font-weight:800;color:'+color+';margin:2px 0;white-space:nowrap">'+_helEsc(valor)+'</div>'+
    '<div style="font-size:10px;color:#94a3b8">'+_helEsc(sub)+'</div></div>';
}
function helFiltrar(){
  var t=document.getElementById('hel-f-temp'), o=document.getElementById('hel-f-torre');
  _helFTemp=t?t.value:''; _helFTorre=o?o.value:'';
  _helRefresh();
}
function helNuevo(){ _helEditId=null; _helTab='form'; _helRefresh(); }
function helEditar(i){
  var r=_helVista[i]; if(!r) return;
  _helEditId=r.id; _helTab='form'; _helRefresh();
}
function helEliminar(i){
  var r=_helVista[i]; if(!r) return;
  if(!can('config.editar')){ toast('Sin permiso','Solo un administrador puede eliminar registros','error'); return; }
  confirmDialog('Eliminar registro',
    'Se eliminará el registro de <strong>'+_helEsc(r.torre)+'</strong> del <strong>'+_helFmtFecha(r.fecha)+'</strong>. Esta acción no se puede deshacer.',
    async function(){
      try{
        await dbDel('heladas', r.id);
        STATE.cache.heladas=await dbAll('heladas');
        if(typeof audit==='function') audit('helada.eliminar','Registro '+r.torre+' '+r.fecha, r.id);
        toast('Registro eliminado', r.torre+' · '+_helFmtFecha(r.fecha),'success');
        closeModal(); _helRefresh();
      }catch(e){ console.error(e); toast('Error','No se pudo eliminar','error'); }
    },'Eliminar',true);
}

/* ════════ TAB FORMULARIO ════════ */
function _helRenderForm(){
  var r=_helEditId ? _helRegs().find(function(x){ return String(x.id)===String(_helEditId); }) : null;
  var esNuevo=!r;
  if(!r) r={};
  var torres=_helTorres();
  var hoy=new Date().toISOString().slice(0,10);

  var optTorre='<option value="">— Seleccione —</option>'+torres.map(function(t){
    return '<option value="'+_helEsc(t)+'"'+(r.torre===t?' selected':'')+'>'+_helEsc(t)+'</option>'; }).join('');

  var respDef=r.responsable || ((STATE.user&&(STATE.user.nombre||STATE.user.id))||'');

  return ''+
  '<div style="max-width:840px">'+
    '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:9px;padding:10px 13px;margin-bottom:14px;font-size:12px;color:#1e40af">'+
      (esNuevo?'Nuevo registro. ':'Editando un registro existente. ')+
      'Cada torre se registra por separado. Si la noche de helada operaron varias torres, cree un registro por cada una con la misma fecha.'+
    '</div>'+

    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:12px">'+

      '<div class="form-field"><label>Fecha del evento *</label>'+
        '<input type="date" id="hel-fecha" value="'+_helEsc(r.fecha||hoy)+'" onchange="helHintHorometro()"></div>'+

      '<div class="form-field"><label>Torre *</label>'+
        '<select id="hel-torre" onchange="helHintHorometro()">'+optTorre+'</select></div>'+

      '<div class="form-field"><label>Responsable *</label>'+
        '<input type="text" id="hel-resp" value="'+_helEsc(respDef)+'" placeholder="Nombre de quien controla"></div>'+

      '<div class="form-field"><label>Tipo de partida *</label>'+
        '<select id="hel-partida">'+
          '<option value="auto"'+(r.partida==='auto'?' selected':'')+'>Automática</option>'+
          '<option value="manual"'+(r.partida==='manual'||!r.partida?' selected':'')+'>Manual</option>'+
        '</select></div>'+

      '<div class="form-field"><label>Hora de inicio del control</label>'+
        '<input type="time" id="hel-hini" value="'+_helEsc(r.horaInicio||'')+'" oninput="helHintHoras()"></div>'+

      '<div class="form-field"><label>Hora de término del control</label>'+
        '<input type="time" id="hel-hfin" value="'+_helEsc(r.horaTermino||'')+'" oninput="helHintHoras()">'+
        '<div class="hint" id="hel-hint-horas" style="display:none"></div></div>'+

      '<div class="form-field"><label>Temperatura al iniciar (°C)</label>'+
        '<input type="number" step="0.1" id="hel-tini" value="'+_helEsc(r.tempInicio!=null?r.tempInicio:'')+'" placeholder="Ej: -1.5"></div>'+

      '<div class="form-field"><label>Temperatura al apagar (°C)</label>'+
        '<input type="number" step="0.1" id="hel-tfin" value="'+_helEsc(r.tempApagado!=null?r.tempApagado:'')+'" placeholder="Ej: 2.0"></div>'+

      '<div class="form-field"><label>Temperatura mínima de la noche (°C)</label>'+
        '<input type="number" step="0.1" id="hel-tmin" value="'+_helEsc(r.tempMinima!=null?r.tempMinima:'')+'" placeholder="Ej: -3.2"></div>'+

      '<div class="form-field"><label>Horómetro inicial</label>'+
        '<input type="number" step="0.1" min="0" id="hel-hom-ini" value="'+_helEsc(r.horometroInicial!=null?r.horometroInicial:'')+'" oninput="helHintHoras()">'+
        '<div class="hint" id="hel-hint-hom" style="display:none"></div></div>'+

      '<div class="form-field"><label>Horómetro de término</label>'+
        '<input type="number" step="0.1" min="0" id="hel-hom-fin" value="'+_helEsc(r.horometroFinal!=null?r.horometroFinal:'')+'" oninput="helHintHoras()">'+
        '<div class="hint" id="hel-hint-run" style="display:none"></div></div>'+

      '<div class="form-field"><label>Litros en estanque al terminar</label>'+
        '<input type="number" step="0.1" min="0" id="hel-litros" value="'+_helEsc(r.litrosEstanque!=null?r.litrosEstanque:'')+'" placeholder="Saldo al finalizar el control">'+
        '<div class="hint">Saldo que queda en el estanque de esta torre al apagarla.</div></div>'+

    '</div>'+

    '<div class="form-field" style="margin-top:12px"><label>Observaciones</label>'+
      '<textarea id="hel-obs" rows="2" placeholder="Condiciones, incidencias, sectores afectados...">'+_helEsc(r.observaciones||'')+'</textarea></div>'+

    '<div id="hel-err" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:10px 12px;font-size:12.5px;margin-top:12px"></div>'+

    '<div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">'+
      '<button class="btn btn-primary" onclick="helGuardar()">💾 '+(esNuevo?'Guardar registro':'Actualizar registro')+'</button>'+
      '<button class="btn btn-secondary" onclick="helTab(0)">Cancelar</button>'+
    '</div>'+
  '</div>';
}

/* Muestra las lecturas vecinas de la torre elegida para la fecha del registro. */
function helHintHorometro(){
  var el=document.getElementById('hel-hint-hom'); if(!el) return;
  var torre=(document.getElementById('hel-torre')||{}).value||'';
  var fecha=(document.getElementById('hel-fecha')||{}).value||'';
  if(!torre||!fecha){ el.style.display='none'; return; }
  var vec=_helHoromVecinos(torre, fecha, _helEditId);
  var partes=[];
  if(vec.antes)   partes.push('noche anterior: '+_helFmtH(vec.antes.valor)+' ('+_helFmtFecha(vec.antes.fecha)+')');
  if(vec.despues) partes.push('noche siguiente: '+_helFmtH(vec.despues.valor)+' ('+_helFmtFecha(vec.despues.fecha)+')');
  el.style.display='block';
  if(!partes.length){ el.style.color='#64748b'; el.textContent='Primer registro de esta torre.'; }
  else{ el.style.color='#0a6ed1'; el.textContent='Horómetro · '+partes.join(' · '); }
  helHintHoras();
}
/* Calcula en vivo las horas por reloj y por horómetro. */
function helHintHoras(){
  var hr=_helHorasReloj((document.getElementById('hel-hini')||{}).value,(document.getElementById('hel-hfin')||{}).value);
  var eh=document.getElementById('hel-hint-horas');
  if(eh){
    if(hr===null){ eh.style.display='none'; }
    else{ eh.style.display='block'; eh.style.color='#0a6ed1';
      eh.textContent='Duración del control: '+_helFmtH(hr)+' h'+(hr>0&&_esCruceMedianoche()?' (cruza la medianoche)':''); }
  }
  var hi=parseFloat((document.getElementById('hel-hom-ini')||{}).value);
  var hf=parseFloat((document.getElementById('hel-hom-fin')||{}).value);
  var er=document.getElementById('hel-hint-run');
  if(er){
    if(isNaN(hi)||isNaN(hf)){ er.style.display='none'; }
    else{
      var d=hf-hi;
      er.style.display='block';
      er.style.color=(d<0)?'#b91c1c':'#15803d';
      er.textContent=(d<0)?'El horómetro de término es menor al inicial.':('Funcionamiento: '+_helFmtH(d)+' h');
    }
  }
}
function _esCruceMedianoche(){
  var a=(document.getElementById('hel-hini')||{}).value, b=(document.getElementById('hel-hfin')||{}).value;
  if(!a||!b) return false;
  return b<a;
}

async function helGuardar(){
  var err=document.getElementById('hel-err');
  function setErr(m){ if(err){ err.style.display='block'; err.innerHTML=m; err.scrollIntoView({block:'center',behavior:'smooth'}); } }
  if(err) err.style.display='none';

  var g=function(id){ var e=document.getElementById(id); return e?e.value.trim():''; };
  var fecha=g('hel-fecha'), torre=g('hel-torre'), resp=g('hel-resp');
  var partida=g('hel-partida')||'manual';
  var hIni=g('hel-hini'), hFin=g('hel-hfin');
  var tIni=g('hel-tini'), tFin=g('hel-tfin'), tMin=g('hel-tmin');
  var homIni=g('hel-hom-ini'), homFin=g('hel-hom-fin');
  var litros=g('hel-litros'), obs=g('hel-obs');

  if(!fecha)  return setErr('Indique la <strong>fecha</strong> del evento.');
  if(!torre)  return setErr('Seleccione la <strong>torre</strong>.');
  if(!resp)   return setErr('Indique el <strong>responsable</strong> del control.');

  var hi=parseFloat(homIni), hf=parseFloat(homFin);
  if(homIni!=='' && homFin!=='' && !isNaN(hi) && !isNaN(hf) && hf<hi){
    return setErr('El horómetro de término ('+_helFmtH(hf)+') no puede ser menor al inicial ('+_helFmtH(hi)+').');
  }
  // El horómetro es acumulativo: la lectura debe caber entre la noche anterior
  // y la siguiente de esa misma torre (no contra el máximo global).
  var vec=_helHoromVecinos(torre, fecha, _helEditId);
  if(vec.antes && homIni!=='' && !isNaN(hi) && hi<vec.antes.valor){
    return setErr('El horómetro inicial ('+_helFmtH(hi)+') es menor al de la noche anterior de '+_helEsc(torre)+
      ' ('+_helFmtH(vec.antes.valor)+' del '+_helFmtFecha(vec.antes.fecha)+'). Verifique la lectura.');
  }
  if(vec.despues && homFin!=='' && !isNaN(hf) && hf>vec.despues.valor){
    return setErr('El horómetro de término ('+_helFmtH(hf)+') es mayor al inicial de la noche siguiente de '+_helEsc(torre)+
      ' ('+_helFmtH(vec.despues.valor)+' del '+_helFmtFecha(vec.despues.fecha)+'). Verifique la lectura.');
  }
  // Aviso de duplicado: misma torre, misma noche.
  var dup=_helRegs().find(function(x){
    return x.fecha===fecha && x.torre===torre && String(x.id)!==String(_helEditId||'');
  });
  if(dup) return setErr('Ya existe un registro de <strong>'+_helEsc(torre)+'</strong> para el '+_helFmtFecha(fecha)+'. Edite ese registro en vez de crear uno nuevo.');

  var reg={
    id: _helEditId || ('HEL-'+Date.now()+'-'+Math.floor(Math.random()*1000)),
    fecha: fecha,
    temporada: _helTemporada(fecha),
    torre: torre,
    responsable: resp,
    partida: (partida==='auto')?'auto':'manual',
    horaInicio: hIni, horaTermino: hFin,
    tempInicio: tIni===''?null:parseFloat(tIni),
    tempApagado: tFin===''?null:parseFloat(tFin),
    tempMinima: tMin===''?null:parseFloat(tMin),
    horometroInicial: homIni===''?null:parseFloat(homIni),
    horometroFinal:  homFin===''?null:parseFloat(homFin),
    litrosEstanque:  litros===''?null:parseFloat(litros),
    observaciones: obs,
    usuario: (STATE.user&&(STATE.user.nombre||STATE.user.id))||'?',
    updatedAt: new Date().toISOString()
  };
  if(!_helEditId) reg.createdAt=reg.updatedAt;
  else{
    var prev=_helRegs().find(function(x){ return String(x.id)===String(_helEditId); });
    if(prev && prev.createdAt) reg.createdAt=prev.createdAt;
  }

  try{
    await dbPut('heladas', reg);
    STATE.cache.heladas=await dbAll('heladas');
  }catch(e){ console.error(e); return setErr('No se pudo guardar el registro.'); }

  if(typeof audit==='function'){
    audit(_helEditId?'helada.editar':'helada.crear', torre+' · '+fecha, reg.id);
  }
  toast(_helEditId?'Registro actualizado':'Registro guardado', torre+' · '+_helFmtFecha(fecha),'success');
  _helEditId=null; _helFTemp=reg.temporada||_helFTemp; _helTab='registros';
  _helRefresh();
}

/* ════════ TAB TORRES (catálogo configurable) ════════ */
function _helRenderTorres(){
  var torres=_helTorres();
  var filas=torres.map(function(t,i){
    var usos=_helRegs().filter(function(r){ return r.torre===t; }).length;
    return '<tr style="border-bottom:1px solid #eee">'+
      '<td style="padding:8px 10px;font-weight:600">'+_helEsc(t)+'</td>'+
      '<td style="padding:8px 10px;text-align:right;color:#64748b;font-size:12px">'+usos+' registro(s)</td>'+
      '<td style="padding:8px 10px;text-align:center">'+
        '<button onclick="helRenombrarTorre('+i+')" style="background:#0a6ed1;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer;margin-right:4px">✎ Renombrar</button>'+
        '<button onclick="helQuitarTorre('+i+')" style="background:#b91c1c;color:#fff;border:none;border-radius:6px;padding:4px 9px;font-size:11px;font-weight:700;cursor:pointer">🗑</button>'+
      '</td></tr>';
  }).join('');

  return '<div style="max-width:620px">'+
    '<div style="font-size:12px;color:#64748b;margin-bottom:12px">Torres disponibles al registrar un control. Renombrar una torre actualiza también los registros históricos, para no perder su continuidad de horómetro.</div>'+
    '<div style="display:flex;gap:8px;margin-bottom:14px">'+
      '<input type="text" id="hel-torre-nueva" placeholder="Nombre de la torre" style="flex:1;padding:9px 11px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+
      '<button class="btn btn-primary" onclick="helAgregarTorre()">➕ Agregar</button>'+
    '</div>'+
    (torres.length
      ? '<table style="width:100%;border-collapse:collapse;font-size:13px"><tbody>'+filas+'</tbody></table>'
      : '<div style="color:#999;padding:20px;text-align:center;font-size:13px">No hay torres configuradas.</div>')+
  '</div>';
}
async function helAgregarTorre(){
  var el=document.getElementById('hel-torre-nueva');
  var nom=el?el.value.trim():'';
  if(!nom){ toast('Falta el nombre','Escriba el nombre de la torre','error'); return; }
  var torres=_helTorres();
  if(torres.some(function(t){ return t.toLowerCase()===nom.toLowerCase(); })){
    toast('Ya existe','Esa torre ya está en la lista','error'); return;
  }
  torres.push(nom);
  await _helGuardarTorres(torres);
  toast('Torre agregada',nom,'success');
  _helRefresh();
}
async function helQuitarTorre(i){
  var torres=_helTorres(); var nom=torres[i]; if(!nom) return;
  var usos=_helRegs().filter(function(r){ return r.torre===nom; }).length;
  if(usos){ toast('No se puede quitar',nom+' tiene '+usos+' registro(s) asociado(s)','error'); return; }
  torres.splice(i,1);
  await _helGuardarTorres(torres);
  toast('Torre eliminada',nom,'info');
  _helRefresh();
}
async function helRenombrarTorre(i){
  var torres=_helTorres(); var actual=torres[i]; if(!actual) return;
  var nuevo=prompt('Nuevo nombre para la torre:',actual);
  if(nuevo===null) return;
  nuevo=String(nuevo).trim();
  if(!nuevo || nuevo===actual) return;
  if(torres.some(function(t,j){ return j!==i && t.toLowerCase()===nuevo.toLowerCase(); })){
    toast('Ya existe','Otra torre usa ese nombre','error'); return;
  }
  torres[i]=nuevo;
  await _helGuardarTorres(torres);
  // Arrastrar el cambio a los registros históricos: el horómetro es por torre,
  // así que dejar registros con el nombre viejo rompería su continuidad.
  var afectados=_helRegs().filter(function(r){ return r.torre===actual; });
  for(var k=0;k<afectados.length;k++){
    var r=afectados[k]; r.torre=nuevo; r.updatedAt=new Date().toISOString();
    try{ await dbPut('heladas', r); }catch(e){ console.error(e); }
  }
  try{ STATE.cache.heladas=await dbAll('heladas'); }catch(e){}
  toast('Torre renombrada', actual+' → '+nuevo+(afectados.length?(' · '+afectados.length+' registro(s) actualizado(s)'):''),'success');
  _helRefresh();
}

/* ════════ TAB DIÉSEL ════════
   Compras y consumos del diésel destinado al control de heladas.
   Los datos NO se duplican: se derivan del SCI.
     · Compras  → movimientos de ENTRADA de los productos marcados como diésel.
     · Consumos → registros del store `combustible` cuyo equipo es una torre.
   El impuesto específico ya está modelado en el SCI: cada línea de entrada
   guarda `costoNeto`, `montoEspecifico` y `costo` (neto + parte NO recuperable),
   y el % de recuperación vive en config.empresa.recupIEC.                      */

// % del impuesto específico que la empresa NO recupera (0–1).
function _helPctNoRecup(){
  try{
    var emp=(STATE.cache.config && STATE.cache.config.empresa) || {};
    var r=(emp.recupIEC!=null?emp.recupIEC:100)/100;
    return 1-r;
  }catch(e){ return 0; }
}

// Código del producto con que se compra el diésel de las torres.
// La empresa lo tiene separado del diésel general, así que la tarjeta de
// compras no mezcla el consumo de tractores ni de otros equipos.
var HEL_DIESEL_DEFAULT = ['P000161'];   // "DIESEL CONTROL HELADAS"

// Códigos de producto considerados "diésel de control de heladas".
// SOLO P000161: es el código dedicado a las torres. Antes, si ese código no
// aparecía, se caía a una detección por descripción que podía arrastrar el
// diésel de tractores y otros equipos, mezclando consumos que no corresponden.
function _helCodigosDiesel(){
  try{
    var cfg=(STATE.cache.config||{}).helDiesel;
    if(cfg && Array.isArray(cfg.codigos) && cfg.codigos.length) return cfg.codigos.slice();
  }catch(e){}
  return HEL_DIESEL_DEFAULT.slice();
}
async function _helGuardarCodigosDiesel(codigos){
  await dbPut('config',{key:'helDiesel', codigos:codigos});
  STATE.cache.config=STATE.cache.config||{};
  STATE.cache.config.helDiesel={key:'helDiesel', codigos:codigos};
}

// Descripción legible de los códigos de diésel activos (para los subtítulos).
function _helNombresDiesel(){
  var cods=_helCodigosDiesel();
  if(!cods.length) return 'sin productos configurados';
  var prods=STATE.cache.products||[];
  return cods.map(function(c){
    var p=prods.find(function(x){ return x.codigoInterno===c; });
    return (p?(p.descripcion||''):'(no existe)')+' · '+c;
  }).join('  |  ');
}

/* Compras: una fila por línea de entrada de un producto diésel. */
function _helComprasDiesel(){
  var cods=_helCodigosDiesel();
  var pctNo=_helPctNoRecup();
  var out=[];
  (STATE.cache.movements||[]).forEach(function(m){
    if(!m || m.tipo!=='ENT' || m.anulado) return;
    (m.detalles||[]).forEach(function(d){
      if(cods.indexOf(d.codigoInterno)<0) return;
      var cant=Number(d.cantidad)||0;
      if(cant<=0) return;
      var netoUnit=Number(d.costoNeto!=null?d.costoNeto:d.costo)||0;
      var espTotal=Number(d.montoEspecifico)||0;
      var espNoRecup=espTotal*pctNo;              // parte que es COSTO
      // `costo` ya viene con los no recuperables incorporados; si falta, se calcula.
      var costoUnit=(d.costo!=null)?Number(d.costo):(netoUnit+espNoRecup/cant);
      var prod=(STATE.cache.products||[]).find(function(p){ return p.codigoInterno===d.codigoInterno; });
      out.push({
        fecha:_helFechaLocal(m.fecha),
        numero:m.numero||'',
        documento:[m.tipoDoc,m.numeroDoc].filter(Boolean).join(' ') || m.documento || '',
        proveedor:m.proveedorNombre||m.proveedor||'—',
        producto:(prod&&prod.descripcion)||d.codigoInterno,
        cantidad:cant,
        netoUnit:netoUnit,
        espNoRecupUnit:cant>0?(espNoRecup/cant):0,
        costoUnit:costoUnit,
        totalNeto:netoUnit*cant,
        totalCosto:costoUnit*cant
      });
    });
  });
  return out.sort(function(a,b){ return String(b.fecha).localeCompare(String(a.fecha)); });
}

/* Consumos: registros de `combustible` cuyo equipo es una de las torres.
   Se usa getCombustibleReal() (inventario.js), que ya reconcilia cantidad,
   fecha y costo contra el movimiento y descarta los anulados. */
/* Fecha LOCAL de un ISO. `slice(0,10)` toma la fecha UTC, y una salida de las
   20:00 en Chile cae al día siguiente en UTC: la tarjeta mostraba un día más
   que la lista de Movimientos. */
function _helFechaLocal(iso){
  if(!iso) return '';
  try{
    var d=new Date(iso);
    if(isNaN(d.getTime())) return String(iso).slice(0,10);
    return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  }catch(e){ return String(iso).slice(0,10); }
}

/* Consumos de diésel de las torres.
   La FUENTE es el movimiento de salida del producto diésel, no el store
   `combustible`. Ese store solo lo crea el formulario de combustible; una
   salida hecha desde el módulo Inventario no genera registro y quedaba
   invisible aquí, descuadrando la comparación con el saldo de estanques.
   El registro de `combustible`, cuando existe, aporta la torre y el horómetro. */
function _helConsumosDiesel(){
  var torres=_helTorres();
  var cods=_helCodigosDiesel();
  // Índice de metadatos por número de movimiento
  var meta={};
  var base=(typeof getCombustibleReal==='function')
    ? getCombustibleReal()
    : (STATE.cache.combustible||[]);
  base.forEach(function(r){ if(r && r.movNumero) meta[r.movNumero]=r; });

  var out=[];
  (STATE.cache.movements||[]).forEach(function(m){
    if(!m || m.tipo!=='SAL' || m.anulado) return;
    if(m.tipoMovimiento==='TRASPASO BODEGA') return;      // no es consumo
    (m.detalles||[]).forEach(function(d){
      if(cods.indexOf(d.codigoInterno)<0) return;         // solo diésel de heladas
      var cant=Number(d.cantidad)||0;
      if(cant<=0) return;
      var r=meta[m.numero];
      var cu=Number(d.costo)||0;
      var prod=(STATE.cache.products||[]).find(function(p){ return p.codigoInterno===d.codigoInterno; });
      // Si se cargó contra un equipo que no es torre se muestra igual, marcado.
      // Excluirlo en silencio hacía que el total no cuadrara con el estanque y
      // no había forma de saber por qué faltaba.
      var otroEquipo=!!(r && r.equipo && torres.map(_helNorm).indexOf(_helNorm(r.equipo))<0);
      out.push({
        fecha:_helFechaLocal(m.fecha),
        torre:(r&&r.equipo)?_helNorm(r.equipo):'Sin torre asignada',
        sinTorre:!(r&&r.equipo),
        otroEquipo:otroEquipo,
        producto:(prod&&prod.descripcion)||d.codigoInterno,
        codigoProducto:d.codigoInterno,
        cantidad:cant,
        costoUnit:cu,
        neto:cu*cant,
        km:(r?r.km:null),
        movNumero:m.numero||''
      });
    });
  });
  return out.sort(function(a,b){ return String(b.fecha).localeCompare(String(a.fecha)); });
}

function _helMon(n){
  n=Number(n)||0;
  return '$ '+n.toLocaleString('es-CL',{minimumFractionDigits:0,maximumFractionDigits:0});
}
function _helMon2(n){
  n=Number(n)||0;
  return '$ '+n.toLocaleString('es-CL',{minimumFractionDigits:2,maximumFractionDigits:2});
}

/* Tarjeta: consumo por hora de funcionamiento, una línea por torre.
   Litros vienen de las salidas de combustible; horas del horómetro de los
   registros de helada. Si a una torre le falta una de las dos fuentes, se
   indica en vez de mostrar un número engañoso. */
function _helCardConsumoHora(litros, horas, costo){
  var keys=[];
  Object.keys(litros).forEach(function(k){ if(keys.indexOf(k)<0) keys.push(k); });
  Object.keys(horas).forEach(function(k){ if(keys.indexOf(k)<0) keys.push(k); });
  keys.sort();

  var totL=0, totH=0;
  keys.forEach(function(k){ totL+=(litros[k]||0); totH+=(horas[k]||0); });
  var promGlobal=(totH>0)?(totL/totH):null;

  var cuerpo;
  if(!keys.length){
    cuerpo='<div style="font-size:20px;font-weight:800;color:#0e7490;margin:2px 0">—</div>'+
           '<div style="font-size:10px;color:#94a3b8">sin datos de consumo ni horómetro</div>';
  }else{
    cuerpo=keys.map(function(k){
      var L=litros[k]||0, H=horas[k]||0, C=costo[k]||0;
      var valor, sub;
      if(H>0 && L>0){
        valor='<span style="font-size:16px;font-weight:800;color:#0e7490;white-space:nowrap">'+_helFmtH(L/H)+' L/h</span>';
        sub=_helFmtH(L)+' L en '+_helFmtH(H)+' h · '+_helMon(C/H)+'/h';
      }else if(H>0){
        valor='<span style="font-size:13px;font-weight:700;color:#92600a;white-space:nowrap">sin consumo</span>';
        sub=_helFmtH(H)+' h registradas, sin salidas de diésel';
      }else{
        valor='<span style="font-size:13px;font-weight:700;color:#92600a;white-space:nowrap">sin horas</span>';
        sub=_helFmtH(L)+' L consumidos, sin horómetro registrado';
      }
      return '<div style="padding:4px 0;border-top:1px solid #f1f5f9">'+
          '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px">'+
            '<span style="font-size:11px;color:#475569;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_helEsc(k)+'</span>'+
            valor+
          '</div>'+
          '<div style="font-size:9.5px;color:#94a3b8">'+sub+'</div>'+
        '</div>';
    }).join('');
    if(promGlobal!==null && keys.length>1){
      cuerpo+='<div style="padding:4px 0;border-top:1px solid #e3e8ee;display:flex;justify-content:space-between;align-items:baseline">'+
        '<span style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.3px">Promedio</span>'+
        '<span style="font-size:14px;font-weight:800;color:#0e7490">'+_helFmtH(promGlobal)+' L/h</span></div>';
    }
    cuerpo='<div style="margin-top:2px">'+cuerpo+'</div>';
  }
  return '<div style="border:1px solid #e3e8ee;border-radius:9px;padding:10px 12px;background:#fff'+
      (keys.length>1?';grid-column:span 2':'')+'">'+
    '<div style="font-size:10px;color:#64748b;text-transform:uppercase;letter-spacing:.4px">Consumo por hora de funcionamiento</div>'+
    cuerpo+
  '</div>';
}

/* Contraste entre los dos modos de medir el consumo:
   por diferencia de estanques (compras − saldo) y por salidas cargadas en SCI.
   Una brecha grande indica salidas sin registrar o lecturas de estanque
   desactualizadas; conviene verla, no esconderla. */
function _helCuadratura(calc, registrado){
  var dif=calc-registrado;
  var pct=(calc>0)?Math.abs(dif/calc*100):0;
  var ok=(Math.abs(dif)<0.5)||(pct<=5);
  var col=ok?'#15803d':'#92600a';
  var fondo=ok?'#f0fdf4':'#fffbeb';
  var borde=ok?'#bbf7d0':'#fde68a';
  return '<div style="background:'+fondo+';border:1px solid '+borde+';border-radius:8px;padding:8px 11px;margin-bottom:10px;font-size:11.5px;color:'+col+'">'+
    '<strong>Cuadratura:</strong> por diferencia de estanques '+_helFmtH(calc)+' L · registrado en SCI '+_helFmtH(registrado)+' L · '+
    'diferencia '+(dif>=0?'+':'')+_helFmtH(dif)+' L'+(calc>0?(' ('+_helFmtH(pct)+'%)'):'')+
    (ok?'' : ' — revise si faltan salidas por registrar o si alguna lectura de estanque está desactualizada.')+
  '</div>';
}

function _helRenderDiesel(){
  var compras=_helComprasDiesel();
  var consumos=_helConsumosDiesel();
  var pctNo=_helPctNoRecup();
  var esAdmin=can('config.editar');

  // Filtro por temporada (reutiliza el mismo filtro de la pestaña Registros)
  if(_helFTemp){
    compras =compras .filter(function(x){ return _helTemporada(x.fecha)===_helFTemp; });
    consumos=consumos.filter(function(x){ return _helTemporada(x.fecha)===_helFTemp; });
  }

  var litComp=0, totNeto=0, totCosto=0;
  compras.forEach(function(c){ litComp+=c.cantidad; totNeto+=c.totalNeto; totCosto+=c.totalCosto; });
  var litCons=0, totCons=0;
  consumos.forEach(function(c){ litCons+=c.cantidad; totCons+=c.neto; });

  // Consumo por diferencia de estanques: lo comprado menos lo que aún queda.
  // El saldo es la última lectura de cada torre (registrada al terminar el
  // evento), sumando las torres.
  var saldo=_helSaldoEstanques(_helFTemp||null);
  var consumoCalc=litComp-saldo.total;
  var costoLitroProm=(litComp>0)?(totCosto/litComp):0;
  var costoCalc=consumoCalc*costoLitroProm;
  var detSaldo=Object.keys(saldo.porTorre).sort().map(function(k){
    return _helEsc(k)+' '+_helFmtH(saldo.porTorre[k].litros)+' L';
  }).join(' · ')||'sin lecturas';

  // Consumo por hora de funcionamiento, por torre.
  // Litros: de las salidas de combustible cargadas a esa torre.
  // Horas: del horómetro de los registros de helada de esa torre.
  // Ambas fuentes respetan el mismo filtro de temporada.
  var horasPorTorre={}, litrosPorTorre={}, costoPorTorre={};
  _helRegs().forEach(function(r){
    if(_helFTemp && r.temporada!==_helFTemp) return;
    var h=_helHorasHorom(r);
    if(h!==null && h>0){
      var k=_helNorm(r.torre)||'—';
      horasPorTorre[k]=(horasPorTorre[k]||0)+h;
    }
  });
  consumos.forEach(function(c){
    var k=_helNorm(c.torre)||'—';
    litrosPorTorre[k]=(litrosPorTorre[k]||0)+c.cantidad;
    costoPorTorre[k]=(costoPorTorre[k]||0)+c.neto;
  });
  // v148: horas = horómetro final − inicial de la torre (mismo cálculo que
  // Rendimiento de combustible); litros = suma de cargas registradas.
  Object.keys(litrosPorTorre).forEach(function(k){
    var cargas=consumos.filter(function(c){ return _helNorm(c.torre)===k; })
                       .map(function(c){ return {fecha:c.fecha, litros:c.cantidad, horom:c.km}; });
    var r=helConsumoHoraTorre(k, cargas, _helFTemp||null);
    if(r.horas>0) horasPorTorre[k]=r.horas;
  });

  var temporadas=[];
  _helRegs().forEach(function(r){ if(r.temporada && temporadas.indexOf(r.temporada)<0) temporadas.push(r.temporada); });
  temporadas.sort().reverse();
  var optTemp='<option value="">Todas</option>'+temporadas.map(function(t){
    return '<option value="'+_helEsc(t)+'"'+(t===_helFTemp?' selected':'')+'>'+_helEsc(t)+'</option>'; }).join('');

  var head=
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">TEMPORADA</label>'+
        '<select id="hel-f-temp" onchange="helFiltrarDiesel()" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px">'+optTemp+'</select></div>'+
      '<div style="flex:1"></div>'+
      (esAdmin?'<button class="btn btn-secondary" onclick="helConfigDiesel()">⚙️ Productos diésel</button>':'')+
    '</div>'+
    '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px">'+
      _helCard('Litros comprados', _helFmtH(litComp)+' L', compras.length+' compra(s)', '#0a6ed1')+
      _helCard('Costo de compras', _helMon(totCosto), 'neto + específico no recup.', '#7c3aed')+
      _helCard('Saldo en estanques', _helFmtH(saldo.total)+' L', detSaldo, '#c2831a')+
      _helCard('Consumo del período', _helFmtH(consumoCalc)+' L',
               _helFmtH(litComp)+' comprados − '+_helFmtH(saldo.total)+' en estanque', '#b45309')+
      _helCard('Costo del consumo', _helMon(costoCalc),
               'a '+_helMon2(costoLitroProm)+'/L promedio de compra', '#15803d')+
      _helCardConsumoHora(litrosPorTorre, horasPorTorre, costoPorTorre)+
    '</div>';

  // ── Tarjeta 1: COMPRAS ──
  var filasC=compras.map(function(c){
    return '<tr style="border-bottom:1px solid #eee">'+
      '<td style="padding:7px 9px;white-space:nowrap;font-weight:700">'+_helFmtFecha(c.fecha)+'</td>'+
      '<td style="padding:7px 9px">'+_helEsc(c.proveedor)+
        (c.documento?'<div style="font-size:10px;color:#888">'+_helEsc(c.documento)+'</div>':'')+'</td>'+
      '<td style="padding:7px 9px;font-size:11px;color:#475569">'+_helEsc(c.producto)+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap;font-weight:700">'+_helFmtH(c.cantidad)+' L</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+_helMon2(c.costoUnit)+
        '<div style="font-size:10px;color:#888">neto '+_helMon2(c.netoUnit)+
        (c.espNoRecupUnit>0?(' + '+_helMon2(c.espNoRecupUnit)):'')+'</div></td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap;font-weight:700">'+_helMon(c.totalNeto)+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+_helMon(c.totalCosto)+'</td>'+
    '</tr>';
  }).join('');

  var cardCompras=
    '<div style="border:1px solid #e3e8ee;border-radius:10px;padding:14px;margin-bottom:16px;background:#fff">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:4px">'+
        '<div style="font-size:15px;font-weight:800;color:#1a3a5c">🛒 Compras de Diésel · Control Heladas</div>'+
        (compras.length?'<button class="btn btn-secondary" onclick="helExportarDiesel(0)" style="font-size:12px;padding:5px 10px">📊 CSV</button>':'')+
      '</div>'+
      '<div style="font-size:11px;color:#7a8794;margin-bottom:10px">'+
        'Producto: '+_helEsc(_helNombresDiesel())+' · '+
        'Precio por litro = neto + la parte NO recuperable del impuesto específico ('+
        _helFmtH(pctNo*100)+'% no recuperable según la configuración de la empresa).</div>'+
      (compras.length
        ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:780px">'+
          '<thead><tr style="background:#f5f7fa;border-bottom:2px solid #e3e8ee">'+
            '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">FECHA</th>'+
            '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">PROVEEDOR / DOC.</th>'+
            '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">PRODUCTO</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">CANTIDAD</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">PRECIO / LITRO</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">TOTAL NETO</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">TOTAL C/IEC</th>'+
          '</tr></thead><tbody>'+filasC+'</tbody>'+
          '<tfoot><tr style="background:#f5f7fa;font-weight:800;border-top:2px solid #e3e8ee">'+
            '<td colspan="3" style="padding:8px 9px">Total '+compras.length+' compra(s)</td>'+
            '<td style="padding:8px 9px;text-align:right">'+_helFmtH(litComp)+' L</td>'+
            '<td style="padding:8px 9px;text-align:right;font-weight:400;font-size:11px;color:#64748b">prom. '+
              (litComp>0?_helMon2(totCosto/litComp):'—')+'</td>'+
            '<td style="padding:8px 9px;text-align:right">'+_helMon(totNeto)+'</td>'+
            '<td style="padding:8px 9px;text-align:right">'+_helMon(totCosto)+'</td>'+
          '</tr></tfoot></table></div>'
        : '<div style="color:#999;padding:22px;text-align:center;font-size:13px">Sin compras de diésel registradas'+(_helFTemp?(' en la temporada '+_helEsc(_helFTemp)):'')+'.</div>')+
    '</div>';

  // ── Tarjeta 2: CONSUMOS ──
  var filasK=consumos.map(function(c){
    return '<tr style="border-bottom:1px solid #eee'+((c.sinTorre||c.otroEquipo)?';background:#fffbeb':'')+'">'+
      '<td style="padding:7px 9px;white-space:nowrap;font-weight:700">'+_helFmtFecha(c.fecha)+'</td>'+
      '<td style="padding:7px 9px">'+_helEsc(c.torre)+
        (c.otroEquipo?'<div style="font-size:9.5px;color:#92600a;font-weight:700">⚠ no es una torre</div>':'')+
        (c.movNumero?'<div style="font-size:10px;color:#888">'+_helEsc(c.movNumero)+'</div>':'')+'</td>'+
      '<td style="padding:7px 9px;font-size:11px;color:#475569">'+_helEsc(c.producto)+
        '</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+(c.km?_helFmtH(c.km):'—')+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap;font-weight:700">'+_helFmtH(c.cantidad)+' L</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap">'+_helMon2(c.costoUnit)+'</td>'+
      '<td style="padding:7px 9px;text-align:right;white-space:nowrap;font-weight:700">'+_helMon(c.neto)+'</td>'+
    '</tr>';
  }).join('');
  var nOtro=consumos.filter(function(c){ return c.sinTorre; }).length;
  var nEquipo=consumos.filter(function(c){ return c.otroEquipo; }).length;

  var cardConsumos=
    '<div style="border:1px solid #e3e8ee;border-radius:10px;padding:14px;background:#fff">'+
      '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:4px">'+
        '<div style="font-size:15px;font-weight:800;color:#1a3a5c">⛽ Consumos de Diésel · Control Heladas</div>'+
        (consumos.length?'<button class="btn btn-secondary" onclick="helExportarDiesel(1)" style="font-size:12px;padding:5px 10px">📊 CSV</button>':'')+
      '</div>'+
      '<div style="font-size:11px;color:#7a8794;margin-bottom:10px">Salidas de combustible registradas contra una torre de control. Valorizadas al costo promedio ponderado del momento del consumo.'+
        (nOtro?(' <span style="color:#92600a;font-weight:700">'+nOtro+' salida(s) sin torre asignada: se registraron desde Inventario y no desde el formulario de combustible, por lo que no tienen equipo ni horómetro.</span>'):'')+
        (nEquipo?(' <span style="color:#92600a;font-weight:700">'+nEquipo+' salida(s) cargada(s) a un equipo que no es torre.</span>'):'')+'</div>'+
      _helCuadratura(consumoCalc, litCons)+
      (consumos.length
        ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:720px">'+
          '<thead><tr style="background:#f5f7fa;border-bottom:2px solid #e3e8ee">'+
            '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">FECHA</th>'+
            '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">TORRE / MOVIMIENTO</th>'+
            '<th style="padding:8px 9px;text-align:left;font-size:11px;color:#64748b">PRODUCTO</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">HORÓMETRO</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">CANTIDAD</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">COSTO / LITRO</th>'+
            '<th style="padding:8px 9px;text-align:right;font-size:11px;color:#64748b">NETO</th>'+
          '</tr></thead><tbody>'+filasK+'</tbody>'+
          '<tfoot><tr style="background:#f5f7fa;font-weight:800;border-top:2px solid #e3e8ee">'+
            '<td colspan="4" style="padding:8px 9px">Total '+consumos.length+' consumo(s)</td>'+
            '<td style="padding:8px 9px;text-align:right">'+_helFmtH(litCons)+' L</td>'+
            '<td style="padding:8px 9px;text-align:right;font-weight:400;font-size:11px;color:#64748b">prom. '+
              (litCons>0?_helMon2(totCons/litCons):'—')+'</td>'+
            '<td style="padding:8px 9px;text-align:right">'+_helMon(totCons)+'</td>'+
          '</tr></tfoot></table></div>'
        : '<div style="color:#999;padding:22px;text-align:center;font-size:13px">Sin consumos de diésel de torres registrados'+(_helFTemp?(' en la temporada '+_helEsc(_helFTemp)):'')+'.</div>')+
    '</div>';

  return head+cardCompras+cardConsumos;
}

function helFiltrarDiesel(){
  var t=document.getElementById('hel-f-temp');
  _helFTemp=t?t.value:'';
  _helRefresh();
}

/* Configuración: qué productos cuentan como diésel de control de heladas. */
function helConfigDiesel(){
  if(!can('config.editar')){ toast('Sin permiso','Solo un administrador puede configurar','error'); return; }
  var sel=_helCodigosDiesel();
  var prods=(STATE.cache.products||[]).filter(function(p){ return p && p.activo!==false; })
    .sort(function(a,b){ return String(a.descripcion||'').localeCompare(String(b.descripcion||'')); });
  var opts=prods.map(function(p){
    var s=(sel.indexOf(p.codigoInterno)>=0)?' selected':'';
    return '<option value="'+_helEsc(p.codigoInterno)+'"'+s+'>'+_helEsc(p.descripcion||'')+' · '+_helEsc(p.codigoInterno)+'</option>';
  }).join('');
  showModal('⚙️ Productos de diésel · Control Heladas',
    '<div style="font-size:12.5px;color:#475569;margin-bottom:10px">Seleccione los productos del catálogo que corresponden al diésel usado en las torres. '+
    'Las compras de estos productos alimentan la tarjeta de compras. Mantenga Ctrl (o Cmd) para elegir varios.</div>'+
    '<select id="hel-diesel-sel" multiple size="10" style="width:100%;padding:6px;border:1px solid #cdd5df;border-radius:7px;font-size:13px;box-sizing:border-box">'+opts+'</select>'+
    '<div style="font-size:11px;color:#888;margin-top:8px">Si no selecciona ninguno, se detectan automáticamente los productos cuya descripción contiene «diésel» o «petróleo».</div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="helGuardarConfigDiesel()">Guardar</button>','md');
}
async function helGuardarConfigDiesel(){
  var sel=document.getElementById('hel-diesel-sel');
  if(!sel) return;
  var cods=Array.prototype.filter.call(sel.options,function(o){ return o.selected; })
                .map(function(o){ return o.value; });
  await _helGuardarCodigosDiesel(cods);
  closeModal();
  toast('Configuración guardada', cods.length?(cods.length+' producto(s) de diésel'):'Detección automática','success');
  _helRefresh();
}

/* Exportar: 0 = compras · 1 = consumos */
function helExportarDiesel(cual){
  var q=function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  var lineas=[], nombre='';
  if(cual===0){
    var compras=_helComprasDiesel();
    if(_helFTemp) compras=compras.filter(function(x){ return _helTemporada(x.fecha)===_helFTemp; });
    if(!compras.length){ toast('Sin datos','No hay compras para exportar','error'); return; }
    lineas.push(['Fecha','Movimiento','Documento','Proveedor','Producto','Cantidad (L)',
                 'Neto por litro','Especifico no recuperable por litro','Precio por litro',
                 'Total neto','Total con IEC no recuperable'].map(q).join(';'));
    compras.forEach(function(c){
      lineas.push([c.fecha,c.numero,c.documento,c.proveedor,c.producto,
        c.cantidad.toFixed(2),c.netoUnit.toFixed(2),c.espNoRecupUnit.toFixed(2),
        c.costoUnit.toFixed(2),Math.round(c.totalNeto),Math.round(c.totalCosto)].map(q).join(';'));
    });
    nombre='compras_diesel_heladas';
  }else{
    var cons=_helConsumosDiesel();
    if(_helFTemp) cons=cons.filter(function(x){ return _helTemporada(x.fecha)===_helFTemp; });
    if(!cons.length){ toast('Sin datos','No hay consumos para exportar','error'); return; }
    lineas.push(['Fecha','Torre','Producto','Codigo','Movimiento','Horometro','Cantidad (L)','Costo por litro','Neto'].map(q).join(';'));
    cons.forEach(function(c){
      lineas.push([c.fecha,c.torre,c.producto,c.codigoProducto,c.movNumero,(c.km||''),
        c.cantidad.toFixed(2),c.costoUnit.toFixed(2),Math.round(c.neto)].map(q).join(';'));
    });
    nombre='consumos_diesel_heladas';
  }
  var blob=new Blob(['\ufeff'+lineas.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download=nombre+'_'+(_helFTemp||'todas')+'.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  toast('Exportado',(lineas.length-1)+' fila(s)','success');
}

/* ════════════════ CLIMA Y PRONÓSTICO DE HELADAS ════════════════
   Fuente: Open-Meteo (open-meteo.com). Se eligió porque no exige clave de API
   ni backend y permite CORS, así que funciona desde esta PWA estática.
     · Pronóstico  → api.open-meteo.com          (7 días)
     · Histórico   → archive-api.open-meteo.com  (reanálisis, desde 1940)
   La configuración (coordenadas y umbral) va en `config` y se sincroniza.
   El último pronóstico se guarda en localStorage —NO en config— para no
   generar tráfico de sincronización con un dato que caduca en horas; sirve
   además para mostrar algo cuando el equipo está sin señal en terreno.        */

var HEL_CLIMA_DEFAULT = { lat:-37.7958, lon:-72.7167, nombre:'Angol, La Araucanía', umbral:2,
                          motor:'open-meteo', apiKey:'' };

/* Tomorrow.io usa su propia tabla de códigos, distinta de la WMO de Open-Meteo.
   Se traduce al ingresar para que todo lo que sigue —iconos y el histórico ya
   guardado— quede en un solo sistema, sin importar qué motor generó el dato. */
function _helTioAWmo(c){
  var m={1000:0,1100:1,1101:2,1102:3,1001:3,2000:45,2100:45,
         4000:51,4200:61,4001:63,4201:65,
         5001:71,5100:71,5000:73,5101:75,
         6000:56,6200:66,6001:66,6201:67,
         7000:77,7101:77,7102:77,8000:95};
  return (c!=null && m[c]!=null) ? m[c] : null;
}
function _helNombreMotor(m){ return (m==='tomorrow') ? 'Tomorrow.io' : 'Open-Meteo'; }
var _helClimaCargando = false;
var _helHistCargando  = false;
var _helHistRango     = null;   // {ini,fin} del rango que se está mirando

/* Días guardados dentro del rango visible, ordenados por fecha. La fuente es
   siempre el store `clima`: lo descargado ya quedó persistido, así que el
   histórico se ve igual sin conexión. */
function _helHistDias(){
  var r=_helHistRango; if(!r) return [];
  return _helClimaRegs()
    .filter(function(x){ return x.fecha>=r.ini && x.fecha<=r.fin; })
    .sort(function(a,b){ return String(a.fecha).localeCompare(String(b.fecha)); });
}

function _helClimaCfg(){
  try{
    var c=(STATE.cache.config||{}).helClima;
    if(c && c.lat!=null && c.lon!=null){
      return { lat:Number(c.lat), lon:Number(c.lon),
               nombre:c.nombre||'', umbral:(c.umbral!=null?Number(c.umbral):2),
               motor:c.motor||'open-meteo', apiKey:c.apiKey||'' };
    }
  }catch(e){}
  return Object.assign({}, HEL_CLIMA_DEFAULT);
}
async function _helGuardarClimaCfg(cfg){
  var reg={key:'helClima', lat:cfg.lat, lon:cfg.lon, nombre:cfg.nombre, umbral:cfg.umbral,
           motor:cfg.motor||'open-meteo', apiKey:cfg.apiKey||''};
  await dbPut('config', reg);
  STATE.cache.config=STATE.cache.config||{};
  STATE.cache.config.helClima=reg;
}

/* Cache local del PRONÓSTICO (días futuros). Sigue en localStorage porque
   caduca en horas y no tiene sentido sincronizarlo. Los días ya transcurridos
   sí se guardan en el store `clima`, que es persistente y se sincroniza. */
function _helPronCache(){
  try{ return JSON.parse(localStorage.getItem('sci_hel_pronostico')||'null'); }catch(e){ return null; }
}
function _helPronGuardar(obj){
  try{ localStorage.setItem('sci_hel_pronostico', JSON.stringify(obj)); }catch(e){}
}

/* ── Histórico persistente (store `clima`, clave = fecha) ──
   Cada fila es un día observado. Se guarda lat/lon para no mezclar datos si
   alguna vez se corrigen las coordenadas del huerto. */
function _helClimaRegs(){
  var c=_helClimaCfg();
  var lat=Number(c.lat).toFixed(3), lon=Number(c.lon).toFixed(3);
  var todos=(STATE.cache.clima||[]);
  var propios=todos.filter(function(r){
    if(r.lat==null||r.lon==null) return true;               // registros antiguos sin coords
    return Number(r.lat).toFixed(3)===lat && Number(r.lon).toFixed(3)===lon;
  });
  propios._otros = todos.length - propios.length;
  return propios;
}

/* Guarda o refresca los días indicados. Los datos se van afinando: un día
   pronosticado se reemplaza luego por el observado, por eso se sobrescribe
   siempre en vez de conservar el primero que llegó. */
async function _helGuardarDias(dias, fuente){
  var c=_helClimaCfg();
  var n=0;
  for(var i=0;i<dias.length;i++){
    var d=dias[i];
    if(!d || !d.fecha || d.min==null) continue;
    try{
      await dbPut('clima', {
        fecha:d.fecha, min:d.min, max:(d.max==null?null:d.max),
        lluvia:(d.lluvia==null?null:d.lluvia), cod:(d.cod==null?null:d.cod),
        fuente:fuente||'', lat:c.lat, lon:c.lon,
        updatedAt:new Date().toISOString()
      });
      n++;
    }catch(e){ console.error('[SCI] clima:',e); }
  }
  if(n){ try{ STATE.cache.clima=await dbAll('clima'); }catch(e){} }
  return n;
}

/* ── Actualización diaria automática ──
   Se ejecuta al abrir el módulo. Solo consulta si cambió el día respecto de la
   última vez y hay conexión; el resto de las veces usa lo guardado, para no
   gastar datos ni pegarle a la API en cada navegación. */
function _helUltAuto(){
  try{ return localStorage.getItem('sci_hel_ult_auto')||''; }catch(e){ return ''; }
}
function _helMarcarAuto(){
  try{ localStorage.setItem('sci_hel_ult_auto', new Date().toISOString().slice(0,10)); }catch(e){}
}
function _helAutoActualizar(){
  var hoy=new Date().toISOString().slice(0,10);
  if(_helUltAuto()===hoy) return;      // ya se actualizó hoy en este dispositivo
  if(!navigator.onLine) return;
  _helMarcarAuto();
  helCargarPronostico(true);
}

/* Noches con riesgo según el pronóstico vigente. Se usa tanto en la pestaña
   Clima como en el aviso que aparece sobre cualquier pestaña del módulo. */
function _helRiesgoHelada(){
  var p=_helPronCache();
  if(!p || !p.dias || !p.dias.length) return null;
  var umbral=_helClimaCfg().umbral;
  var hoy=new Date().toISOString().slice(0,10);
  var riesgo=p.dias.filter(function(d){ return d.fecha>=hoy && d.min!=null && d.min<=umbral; });
  if(!riesgo.length) return null;
  return { dias:riesgo, umbral:umbral, actualizado:p.ts, motor:p.motor||'open-meteo',
           minima:riesgo.reduce(function(m,d){ return (m===null||d.min<m)?d.min:m; }, null) };
}

function _helBannerRiesgo(){
  var r=_helRiesgoHelada();
  if(!r) return '';
  var critico=(r.minima<=0);
  var col=critico?'#b91c1c':'#b45309';
  var fondo=critico?'#fef2f2':'#fffbeb';
  var borde=critico?'#fecaca':'#fde68a';
  var lista=r.dias.slice(0,7).map(function(d){
    var c=(d.min<=0)?'#b91c1c':'#b45309';
    var ic=_helIconoClima(d.cod);
    return '<span style="display:inline-block;background:#fff;border:1px solid '+borde+';border-radius:7px;padding:3px 9px;margin:2px 4px 2px 0;font-size:11.5px" title="'+_helEsc(ic.t)+'">'+
      (ic.i?ic.i+' ':'')+_helEsc(_helDiaCorto(d.fecha))+' <strong style="color:'+c+'">'+_helFmtH(d.min)+' °C</strong>'+
      (d.horaMin?'<span style="color:#94a3b8"> · '+_helEsc(d.horaMin)+'</span>':'')+'</span>';
  }).join('');
  return '<div style="background:'+fondo+';border:1px solid '+borde+';border-radius:10px;padding:12px 14px;margin-bottom:14px">'+
    '<div style="font-weight:800;color:'+col+';font-size:14px;margin-bottom:5px">'+
      (critico?'🚨':'⚠️')+' Riesgo de helada · '+r.dias.length+' noche(s) con mínima ≤ '+_helFmtH(r.umbral)+' °C</div>'+
    '<div>'+lista+'</div>'+
    '<div style="font-size:10.5px;color:#94a3b8;margin-top:6px">Pronóstico actualizado '+_helHace(r.actualizado)+' · '+_helEsc(_helNombreMotor(r.motor))+'</div>'+
  '</div>';
}

function _helDiaCorto(iso){
  try{
    var d=new Date(iso+'T12:00:00');
    var dias=['dom','lun','mar','mié','jue','vie','sáb'];
    return dias[d.getDay()]+' '+String(d.getDate()).padStart(2,'0')+'-'+String(d.getMonth()+1).padStart(2,'0');
  }catch(e){ return iso; }
}
function _helHace(ts){
  if(!ts) return 'hace un momento';
  var min=Math.round((Date.now()-ts)/60000);
  if(min<1) return 'recién';
  if(min<60) return 'hace '+min+' min';
  var h=Math.round(min/60);
  if(h<24) return 'hace '+h+' h';
  return 'hace '+Math.round(h/24)+' día(s)';
}

/* ── Descarga del pronóstico ── */
/* Motor Open-Meteo. Sin clave, cuota amplia; es también el respaldo. */
async function _helPronOpenMeteo(cfg){
  var url='https://api.open-meteo.com/v1/forecast'+
    '?latitude='+encodeURIComponent(cfg.lat)+'&longitude='+encodeURIComponent(cfg.lon)+
    '&daily=weathercode,temperature_2m_min,temperature_2m_max,precipitation_sum,windspeed_10m_max'+
    '&hourly=temperature_2m,relativehumidity_2m'+
    // past_days trae los días ya transcurridos con valores observados: es lo
    // que alimenta el histórico sin depender del archivo, que va 5 días atrás.
    '&timezone=auto&forecast_days=7&past_days=14';
  var r=await fetch(url,{cache:'no-store'});
  if(!r.ok) throw new Error('Open-Meteo HTTP '+r.status);
  var j=await r.json();
  var d=j.daily||{};
  return { tz:j.timezone||'', dias:(d.time||[]).map(function(f,i){
    return { fecha:f,
             cod:(d.weathercode||[])[i],
             min:(d.temperature_2m_min||[])[i],
             max:(d.temperature_2m_max||[])[i],
             lluvia:(d.precipitation_sum||[])[i],
             viento:(d.windspeed_10m_max||[])[i],
             horaMin:_helHoraMinima(j.hourly, f) };
  })};
}

/* Motor Tomorrow.io. Exige clave. Se piden los pasos diario y horario en UNA
   sola llamada: el plan gratuito permite 25 por hora y dos llamadas por
   actualización agotarían la cuota una mañana de heladas con varios equipos. */
async function _helPronTomorrow(cfg){
  if(!cfg.apiKey) throw new Error('Falta la clave de Tomorrow.io');
  var url='https://api.tomorrow.io/v4/weather/forecast'+
    '?location='+encodeURIComponent(cfg.lat+','+cfg.lon)+
    '&timesteps=1d&timesteps=1h&units=metric&apikey='+encodeURIComponent(cfg.apiKey);
  var r=await fetch(url,{cache:'no-store'});
  if(r.status===401 || r.status===403) throw new Error('Clave de Tomorrow.io rechazada');
  if(r.status===429) throw new Error('Cuota de Tomorrow.io agotada');
  if(!r.ok) throw new Error('Tomorrow.io HTTP '+r.status);
  var j=await r.json();
  var tl=(j.timelines||{});
  var horas=(tl.hourly||[]).map(function(h){
    return { t:h.time, v:(h.values||{}).temperature };
  });
  function horaMin(fecha){
    var mejor=null, hora='';
    horas.forEach(function(h){
      if(!h.t || String(h.t).slice(0,10)!==fecha || h.v==null) return;
      if(mejor===null || h.v<mejor){ mejor=h.v; hora=String(h.t).slice(11,16); }
    });
    return hora;
  }
  return { tz:'', dias:(tl.daily||[]).map(function(d){
    var v=d.values||{};
    var f=String(d.time||'').slice(0,10);
    return { fecha:f,
             cod:_helTioAWmo(v.weatherCodeMax!=null?v.weatherCodeMax:v.weatherCodeMin),
             min:(v.temperatureMin!=null?v.temperatureMin:null),
             max:(v.temperatureMax!=null?v.temperatureMax:null),
             lluvia:(v.rainAccumulationSum!=null?v.rainAccumulationSum:null),
             viento:(v.windSpeedMax!=null?v.windSpeedMax:null),
             horaMin:horaMin(f) };
  })};
}

/* ── Descarga del pronóstico ──
   Si el motor elegido falla (clave inválida, cuota agotada, caída), se recurre
   automáticamente a Open-Meteo: quedarse sin pronóstico en plena temporada de
   heladas es peor que usar una fuente alternativa, y se avisa cuál se usó. */
async function helCargarPronostico(silencioso){
  if(_helClimaCargando) return;
  var cfg=_helClimaCfg();
  if(!navigator.onLine){
    if(!silencioso && typeof toast==='function') toast('Sin conexión','Se muestra el último pronóstico guardado','info');
    return;
  }
  _helClimaCargando=true;
  if(!silencioso) _helRefresh();
  var motorUsado=cfg.motor||'open-meteo', aviso='';
  try{
    var res=null;
    if(motorUsado==='tomorrow'){
      try{
        res=await _helPronTomorrow(cfg);
      }catch(eT){
        console.warn('[SCI] Tomorrow.io falló, se usa Open-Meteo:', eT);
        aviso=String(eT.message||eT);
        motorUsado='open-meteo';
        res=await _helPronOpenMeteo(cfg);
      }
    }else{
      res=await _helPronOpenMeteo(cfg);
    }
    var todos=res.dias.filter(function(x){ return x.fecha; });
    var hoy=new Date().toISOString().slice(0,10);
    var dias   = todos.filter(function(x){ return x.fecha>=hoy; });   // pronóstico
    var pasados= todos.filter(function(x){ return x.fecha< hoy; });   // observado
    _helPronGuardar({ ts:Date.now(), lat:cfg.lat, lon:cfg.lon, tz:res.tz||'',
                      motor:motorUsado, aviso:aviso, dias:dias });
    var guardados=await _helGuardarDias(pasados,'observado');
    // El día de hoy también se registra: sirve para no perderlo si mañana no
    // se abre la app, aunque su mínima todavía puede afinarse.
    var deHoy=todos.filter(function(x){ return x.fecha===hoy; });
    if(deHoy.length) await _helGuardarDias(deHoy,'parcial');
    _helMarcarAuto();
    if(typeof toast==='function'){
      if(aviso) toast('Pronóstico desde Open-Meteo', 'Tomorrow.io no respondió: '+aviso,'info');
      else if(!silencioso) toast('Pronóstico actualizado',
        dias.length+' días · '+_helNombreMotor(motorUsado)+' · '+guardados+' día(s) al histórico','success');
    }
  }catch(e){
    console.error('[SCI] Pronóstico:',e);
    if(!silencioso && typeof toast==='function') toast('No se pudo obtener el pronóstico', String(e.message||e),'error');
  }finally{
    _helClimaCargando=false;
    _helRefresh();
  }
}

// Hora en que se produce la mínima de esa noche (útil para programar el control)
function _helHoraMinima(hourly, fecha){
  try{
    if(!hourly || !hourly.time) return '';
    var mejor=null, hora='';
    for(var i=0;i<hourly.time.length;i++){
      var t=hourly.time[i];
      if(t.slice(0,10)!==fecha) continue;
      var v=hourly.temperature_2m[i];
      if(v==null) continue;
      if(mejor===null || v<mejor){ mejor=v; hora=t.slice(11,16); }
    }
    return hora;
  }catch(e){ return ''; }
}

/* ── Descarga del histórico ── */
async function helCargarHistorico(){
  if(_helHistCargando) return;
  var cfg=_helClimaCfg();
  var ini=(document.getElementById('hel-hist-ini')||{}).value||'';
  var fin=(document.getElementById('hel-hist-fin')||{}).value||'';
  if(!ini||!fin){ if(typeof toast==='function') toast('Faltan fechas','Indique el rango a consultar','error'); return; }
  if(ini>fin){ if(typeof toast==='function') toast('Rango inválido','La fecha inicial es posterior a la final','error'); return; }
  if(!navigator.onLine){ if(typeof toast==='function') toast('Sin conexión','El histórico requiere internet','error'); return; }
  _helHistCargando=true; _helRefresh();
  try{
    var url='https://archive-api.open-meteo.com/v1/archive'+
      '?latitude='+encodeURIComponent(cfg.lat)+'&longitude='+encodeURIComponent(cfg.lon)+
      '&start_date='+ini+'&end_date='+fin+
      '&daily=weathercode,temperature_2m_min,temperature_2m_max,precipitation_sum&timezone=auto';
    var r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var j=await r.json();
    var d=j.daily||{};
    var dias=(d.time||[]).map(function(f,i){
      return { fecha:f, cod:(d.weathercode||[])[i],
               min:(d.temperature_2m_min||[])[i], max:(d.temperature_2m_max||[])[i],
               lluvia:(d.precipitation_sum||[])[i] };
    });
    // Se persiste lo descargado: así el rango queda disponible sin internet y
    // se puede ir completando el histórico año por año.
    var n=await _helGuardarDias(dias,'archivo');
    _helHistRango={ini:ini, fin:fin};
    if(typeof toast==='function') toast('Histórico cargado', dias.length+' día(s) · '+n+' guardado(s)','success');
  }catch(e){
    console.error('[SCI] Histórico:',e);
    if(typeof toast==='function') toast('No se pudo obtener el histórico','El archivo tiene ~5 días de rezago','error');
  }finally{
    _helHistCargando=false; _helRefresh();
  }
}

/* Código WMO (weathercode de Open-Meteo) → icono y descripción.
   Los rangos siguen la tabla estándar WMO 4677 que usa la API. */
function _helIconoClima(cod){
  if(cod==null || isNaN(cod)) return { i:'', t:'' };
  var c=Number(cod);
  if(c===0)                      return { i:'☀️', t:'Despejado' };
  if(c===1)                      return { i:'🌤️', t:'Mayormente despejado' };
  if(c===2)                      return { i:'⛅', t:'Parcialmente nublado' };
  if(c===3)                      return { i:'☁️', t:'Nublado' };
  if(c===45||c===48)             return { i:'🌫️', t:'Niebla' };
  if(c>=51&&c<=55)               return { i:'🌦️', t:'Llovizna' };
  if(c===56||c===57)             return { i:'🌧️', t:'Llovizna helada' };
  if(c>=61&&c<=65)               return { i:'🌧️', t:'Lluvia' };
  if(c===66||c===67)             return { i:'🧊', t:'Lluvia helada' };
  if(c>=71&&c<=75)               return { i:'🌨️', t:'Nieve' };
  if(c===77)                     return { i:'🌨️', t:'Granos de nieve' };
  if(c>=80&&c<=82)               return { i:'🌦️', t:'Chubascos' };
  if(c===85||c===86)             return { i:'🌨️', t:'Chubascos de nieve' };
  if(c===95)                     return { i:'⛈️', t:'Tormenta' };
  if(c===96||c===99)             return { i:'⛈️', t:'Tormenta con granizo' };
  return { i:'🌡️', t:'' };
}

/* Qué hay guardado ya, para que se note que el histórico se acumula solo. */
function _helResumenGuardado(){
  var regs=_helClimaRegs();
  var base='Los días consultados quedan guardados y se ven sin conexión. El archivo de reanálisis tiene unos 5 días de rezago.';
  if(!regs.length) return base;
  var fechas=regs.map(function(r){ return r.fecha; }).sort();
  var extra=' <strong>'+regs.length+' día(s) guardado(s)</strong> entre '+
    _helFmtFecha(fechas[0])+' y '+_helFmtFecha(fechas[fechas.length-1])+'.';
  if(regs._otros) extra+=' <span style="color:#94a3b8">('+regs._otros+' de otra ubicación, ocultos)</span>';
  return base+extra;
}

/* ── Render de la pestaña ── */
function _helRenderClima(){
  var cfg=_helClimaCfg();
  var esAdmin=can('config.editar');
  var pron=_helPronCache();
  var umbral=cfg.umbral;

  var cabecera=
    '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:14px">'+
      '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">UBICACIÓN</label>'+
        '<div style="font-size:13px;font-weight:700;color:#1a3a5c">'+_helEsc(cfg.nombre||'(sin nombre)')+
        '<div style="font-size:10.5px;color:#94a3b8;font-weight:400">'+cfg.lat.toFixed(4)+', '+cfg.lon.toFixed(4)+' · umbral '+_helFmtH(umbral)+' °C · motor '+_helEsc(_helNombreMotor(cfg.motor))+'</div></div></div>'+
      '<div style="flex:1"></div>'+
      (esAdmin?'<button class="btn btn-secondary" onclick="helConfigClima()">📍 Coordenadas</button>':'')+
      '<button class="btn btn-primary" onclick="helCargarPronostico()" '+(_helClimaCargando?'disabled':'')+'>'+
        (_helClimaCargando?'Consultando…':'🔄 Actualizar pronóstico')+'</button>'+
    '</div>';

  // ── Pronóstico 7 días ──
  var pronHtml;
  if(!pron || !pron.dias || !pron.dias.length){
    pronHtml='<div style="color:#999;padding:26px;text-align:center;font-size:13px">'+
      'Sin pronóstico descargado. Pulse «Actualizar pronóstico».</div>';
  }else{
    var tarjetas=pron.dias.map(function(d){
      var riesgo=(d.min!=null && d.min<=umbral);
      var critico=(d.min!=null && d.min<=0);
      var borde=critico?'#fecaca':(riesgo?'#fde68a':'#e3e8ee');
      var fondo=critico?'#fef2f2':(riesgo?'#fffbeb':'#fff');
      var colMin=critico?'#b91c1c':(riesgo?'#b45309':'#0a6ed1');
      var ic=_helIconoClima(d.cod);
      return '<div style="border:1px solid '+borde+';background:'+fondo+';border-radius:9px;padding:9px 10px;text-align:center">'+
        '<div style="font-size:11px;color:#64748b;font-weight:700">'+_helEsc(_helDiaCorto(d.fecha))+'</div>'+
        (ic.i?'<div style="font-size:26px;line-height:1.15" title="'+_helEsc(ic.t)+'">'+ic.i+'</div>':'')+
        '<div style="font-size:20px;font-weight:800;color:'+colMin+';margin:1px 0">'+_helFmtH(d.min)+'°</div>'+
        '<div style="font-size:10.5px;color:#94a3b8">máx '+_helFmtH(d.max)+'°</div>'+
        (ic.t?'<div style="font-size:9.5px;color:#94a3b8;margin-top:1px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+_helEsc(ic.t)+'</div>':'')+
        (d.lluvia>0?'<div style="font-size:9.5px;color:#0a6ed1">💧 '+_helFmtH(d.lluvia)+' mm</div>':'')+
        (d.horaMin?'<div style="font-size:10px;color:#64748b;margin-top:2px">mín '+_helEsc(d.horaMin)+'</div>':'')+
        (riesgo?'<div style="font-size:9.5px;font-weight:700;color:'+colMin+';margin-top:3px">'+(critico?'❄️ HELADA':'⚠️ RIESGO')+'</div>':'')+
      '</div>';
    }).join('');
    pronHtml='<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(92px,1fr));gap:8px">'+tarjetas+'</div>'+
      '<div style="font-size:10.5px;color:#94a3b8;margin-top:8px">Actualizado '+_helHace(pron.ts)+
        ' · Temperatura a 2 m · Fuente: '+_helEsc(_helNombreMotor(pron.motor))+'</div>'+
      (pron.aviso?('<div style="font-size:10.5px;color:#92600a;margin-top:3px">Se usó Open-Meteo como respaldo: '+_helEsc(pron.aviso)+'</div>'):'');
  }

  // ── Histórico ──
  var hoy=new Date();
  var haceUnMes=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  // El archivo de reanálisis tiene ~5 días de rezago
  var finSug=new Date(Date.now()-6*86400000).toISOString().slice(0,10);
  var iniVal=(_helHistRango?_helHistRango.ini:haceUnMes);
  var finVal=(_helHistRango?_helHistRango.fin:finSug);
  // Sin rango elegido se muestra todo lo guardado: al entrar ya hay algo que
  // ver, sin depender de una consulta ni de tener señal.
  if(!_helHistRango){
    var todas=_helClimaRegs().map(function(r){ return r.fecha; }).sort();
    if(todas.length){
      _helHistRango={ini:todas[0], fin:todas[todas.length-1]};
      iniVal=todas[0]; finVal=todas[todas.length-1];
    }
  }
  var histDias=_helHistDias();

  var histHtml='';
  if(histDias.length){
    var nHel=0,nRiesgo=0,minAbs=null,sum=0,n=0;
    histDias.forEach(function(d){
      if(d.min==null) return;
      n++; sum+=d.min;
      if(d.min<=0) nHel++;
      if(d.min<=umbral) nRiesgo++;
      if(minAbs===null||d.min<minAbs) minAbs=d.min;
    });
    histHtml=
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin:12px 0">'+
        _helCard('Noches ≤ 0 °C', nHel, 'heladas efectivas', '#b91c1c')+
        _helCard('Noches ≤ '+_helFmtH(umbral)+' °C', nRiesgo, 'bajo el umbral', '#b45309')+
        _helCard('Mínima absoluta', (minAbs===null?'—':_helFmtH(minAbs)+' °C'), 'del período', '#0a6ed1')+
        _helCard('Mínima promedio', (n?_helFmtH(sum/n)+' °C':'—'), n+' día(s) con dato', '#15803d')+
      '</div>'+
      '<div style="max-height:320px;overflow-y:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">'+
        '<thead><tr style="background:#f5f7fa;border-bottom:2px solid #e3e8ee;position:sticky;top:0">'+
          '<th style="padding:7px 9px;text-align:left;font-size:11px;color:#64748b">FECHA</th>'+
          '<th style="padding:7px 9px;text-align:center;font-size:11px;color:#64748b">TIEMPO</th>'+
          '<th style="padding:7px 9px;text-align:right;font-size:11px;color:#64748b">MÍNIMA</th>'+
          '<th style="padding:7px 9px;text-align:right;font-size:11px;color:#64748b">MÁXIMA</th>'+
          '<th style="padding:7px 9px;text-align:right;font-size:11px;color:#64748b">LLUVIA</th>'+
          '<th style="padding:7px 9px;text-align:center;font-size:11px;color:#64748b">EVENTO</th>'+
        '</tr></thead><tbody>'+
        histDias.slice().reverse().map(function(d){
          var critico=(d.min!=null&&d.min<=0), riesgo=(d.min!=null&&d.min<=umbral);
          var ic=_helIconoClima(d.cod);
          return '<tr style="border-bottom:1px solid #eee'+(critico?';background:#fef2f2':(riesgo?';background:#fffbeb':''))+'">'+
            '<td style="padding:6px 9px;white-space:nowrap">'+_helFmtFecha(d.fecha)+'</td>'+
            '<td style="padding:6px 9px;text-align:center;font-size:16px" title="'+_helEsc(ic.t)+'">'+(ic.i||'')+'</td>'+
            '<td style="padding:6px 9px;text-align:right;font-weight:700;color:'+(critico?'#b91c1c':(riesgo?'#b45309':'#1f2d3d'))+'">'+_helFmtH(d.min)+' °C</td>'+
            '<td style="padding:6px 9px;text-align:right;color:#64748b">'+_helFmtH(d.max)+' °C</td>'+
            '<td style="padding:6px 9px;text-align:right;color:#64748b">'+(d.lluvia!=null?_helFmtH(d.lluvia)+' mm':'—')+'</td>'+
            '<td style="padding:6px 9px;text-align:center;font-size:10.5px;font-weight:700;color:'+(critico?'#b91c1c':'#b45309')+'">'+
              (critico?'❄️ HELADA':(riesgo?'riesgo':''))+'</td>'+
          '</tr>';
        }).join('')+
      '</tbody></table></div>'+
      '<button class="btn btn-secondary" onclick="helExportarHistorico()" style="margin-top:10px;font-size:12px;padding:6px 11px">📊 Exportar CSV</button>';
  }else{
    histHtml='<div style="color:#999;padding:22px;text-align:center;font-size:13px">'+
      'Elija un rango y pulse «Consultar» para ver el histórico de temperaturas.</div>';
  }

  return _helBannerRiesgo()+cabecera+
    '<div style="border:1px solid #e3e8ee;border-radius:10px;padding:14px;margin-bottom:16px;background:#fff">'+
      '<div style="font-size:15px;font-weight:800;color:#1a3a5c;margin-bottom:3px">🌤️ Pronóstico · próximos 7 días</div>'+
      '<div style="font-size:11px;color:#7a8794;margin-bottom:10px">Se marcan en ámbar las noches con mínima ≤ '+_helFmtH(umbral)+' °C y en rojo las de 0 °C o menos.</div>'+
      pronHtml+
    '</div>'+
    '<div style="border:1px solid #e3e8ee;border-radius:10px;padding:14px;background:#fff">'+
      '<div style="font-size:15px;font-weight:800;color:#1a3a5c;margin-bottom:3px">📈 Histórico de temperaturas</div>'+
      '<div style="font-size:11px;color:#7a8794;margin-bottom:10px">'+_helResumenGuardado()+'</div>'+
      '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:8px">'+
        '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">DESDE</label>'+
          '<input type="date" id="hel-hist-ini" value="'+iniVal+'" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px"></div>'+
        '<div><label style="font-size:11px;color:#64748b;display:block;margin-bottom:3px">HASTA</label>'+
          '<input type="date" id="hel-hist-fin" value="'+finVal+'" style="padding:7px 10px;border:1px solid #cdd5df;border-radius:7px;font-size:13px"></div>'+
        '<button class="btn btn-primary" onclick="helCargarHistorico()" '+(_helHistCargando?'disabled':'')+'>'+
          (_helHistCargando?'Consultando…':'🔍 Consultar')+'</button>'+
      '</div>'+
      histHtml+
    '</div>';
}

/* ── Configuración de coordenadas ── */
function helConfigClima(){
  if(!can('config.editar')){ toast('Sin permiso','Solo un administrador puede cambiar la ubicación','error'); return; }
  var c=_helClimaCfg();
  var tieneKey=!!c.apiKey;
  var pista=tieneKey ? ('•••• '+String(c.apiKey).slice(-4)) : '';
  showModal('📍 Ubicación y motor del pronóstico',
    '<div style="font-size:12.5px;color:#475569;margin-bottom:12px">Coordenadas del huerto. Puede obtenerlas en Google Maps: toque un punto y copie los dos números que aparecen.</div>'+
    '<div class="form-field"><label>Nombre de referencia</label>'+
      '<input type="text" id="hel-cl-nom" value="'+_helEsc(c.nombre)+'" placeholder="Ej: Angol, La Araucanía"></div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'+
      '<div class="form-field"><label>Latitud</label>'+
        '<input type="number" step="0.0001" id="hel-cl-lat" value="'+c.lat+'" placeholder="-37.7958"></div>'+
      '<div class="form-field"><label>Longitud</label>'+
        '<input type="number" step="0.0001" id="hel-cl-lon" value="'+c.lon+'" placeholder="-72.7167"></div>'+
    '</div>'+
    '<div class="form-field"><label>Umbral de alerta (°C)</label>'+
      '<input type="number" step="0.5" id="hel-cl-umb" value="'+c.umbral+'">'+
      '<div class="hint">Se avisa cuando la mínima pronosticada sea igual o inferior a este valor.</div></div>'+

    '<div style="border-top:1px solid #e3e8ee;margin:14px 0 12px"></div>'+
    '<div class="form-field"><label>Motor del pronóstico</label>'+
      '<select id="hel-cl-motor" onchange="helToggleKey()">'+
        '<option value="open-meteo"'+(c.motor!=='tomorrow'?' selected':'')+'>Open-Meteo · sin clave, 10.000 consultas/día</option>'+
        '<option value="tomorrow"'+(c.motor==='tomorrow'?' selected':'')+'>Tomorrow.io · requiere clave, 500/día y 25/hora</option>'+
      '</select>'+
      '<div class="hint">El <strong>histórico</strong> siempre usa Open-Meteo, que ofrece archivo gratuito desde 1940. Si el motor elegido falla, el pronóstico cae automáticamente a Open-Meteo.</div></div>'+
    '<div class="form-field" id="hel-cl-keybox" style="display:'+(c.motor==='tomorrow'?'block':'none')+'">'+
      '<label>Clave de Tomorrow.io</label>'+
      '<input type="password" id="hel-cl-key" autocomplete="off" placeholder="'+(tieneKey?_helEsc(pista)+' (deje vacío para conservarla)':'Pegue aquí su API key')+'">'+
      '<div class="hint" style="color:#92600a">La clave se guarda en la configuración del sistema, nunca en el código publicado. '+
        'Aun así viaja al navegador de cada usuario: no la comparta fuera de la empresa y revóquela en Tomorrow.io si sospecha de un uso indebido.</div></div>'+

    '<div id="hel-cl-err" style="display:none;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;border-radius:8px;padding:9px 11px;font-size:12px;margin-top:8px"></div>',
    '<button class="btn btn-secondary" onclick="closeModal()">Cancelar</button>'+
    '<button class="btn btn-primary" onclick="helGuardarClima()">Guardar</button>','md');
}
function helToggleKey(){
  var m=(document.getElementById('hel-cl-motor')||{}).value;
  var box=document.getElementById('hel-cl-keybox');
  if(box) box.style.display=(m==='tomorrow')?'block':'none';
}
async function helGuardarClima(){
  var err=document.getElementById('hel-cl-err');
  function setErr(m){ if(err){ err.style.display='block'; err.innerHTML=m; } }
  var actual=_helClimaCfg();
  var lat=parseFloat((document.getElementById('hel-cl-lat')||{}).value);
  var lon=parseFloat((document.getElementById('hel-cl-lon')||{}).value);
  var umb=parseFloat((document.getElementById('hel-cl-umb')||{}).value);
  var nom=((document.getElementById('hel-cl-nom')||{}).value||'').trim();
  var motor=((document.getElementById('hel-cl-motor')||{}).value)||'open-meteo';
  // Campo vacío = conservar la clave guardada, para no obligar a repegarla al
  // cambiar cualquier otro dato.
  var key=((document.getElementById('hel-cl-key')||{}).value||'').trim() || actual.apiKey || '';
  if(isNaN(lat)||lat< -90||lat>90)   return setErr('La latitud debe estar entre -90 y 90.');
  if(isNaN(lon)||lon< -180||lon>180) return setErr('La longitud debe estar entre -180 y 180.');
  if(isNaN(umb)) umb=2;
  if(motor==='tomorrow' && !key) return setErr('Tomorrow.io necesita una clave. Péguela o elija Open-Meteo.');
  var cambioUbic=(Number(actual.lat)!==lat || Number(actual.lon)!==lon);
  await _helGuardarClimaCfg({lat:lat, lon:lon, nombre:nom, umbral:umb, motor:motor, apiKey:key});
  closeModal();
  if(cambioUbic){ _helPronGuardar(null); _helHistRango=null; }  // eran de otro punto
  if(typeof toast==='function') toast('Configuración guardada', _helNombreMotor(motor)+' · '+lat.toFixed(4)+', '+lon.toFixed(4),'success');
  helCargarPronostico(true);
}

function helExportarHistorico(){
  var dias=_helHistDias();
  if(!dias.length){ if(typeof toast==='function') toast('Sin datos','Consulte primero un rango','error'); return; }
  var umbral=_helClimaCfg().umbral;
  var q=function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  var lineas=[['Fecha','Tiempo','Temp minima (C)','Temp maxima (C)','Lluvia (mm)','Helada','Bajo umbral'].map(q).join(';')];
  dias.forEach(function(d){
    lineas.push([d.fecha, _helIconoClima(d.cod).t, d.min==null?'':d.min, d.max==null?'':d.max, d.lluvia==null?'':d.lluvia,
      (d.min!=null&&d.min<=0)?'SI':'NO', (d.min!=null&&d.min<=umbral)?'SI':'NO'].map(q).join(';'));
  });
  var blob=new Blob(['\ufeff'+lineas.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='clima_'+_helHistRango.ini+'_'+_helHistRango.fin+'.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  if(typeof toast==='function') toast('Exportado',dias.length+' día(s)','success');
}

/* ════════════════ CHIP DE CLIMA DEL DASHBOARD ════════════════
   Pronóstico de 7 días según el GPS del DISPOSITIVO que abre la app, no según
   las coordenadas del huerto: sirve a quien esté en terreno, en otro predio o
   en la oficina. Siempre Open-Meteo (sin clave) y siempre en localStorage: es
   un dato por dispositivo y no tiene sentido sincronizarlo ni guardarlo en el
   store `clima`, que es el histórico del huerto.                              */

var _dcCargando=false;

function _dcCache(){
  try{ return JSON.parse(localStorage.getItem('sci_dash_clima')||'null'); }catch(e){ return null; }
}
function _dcGuardar(o){
  try{ localStorage.setItem('sci_dash_clima', JSON.stringify(o)); }catch(e){}
}
function _dcBox(){ return document.getElementById('dash-clima'); }

// Obtiene la posición del dispositivo. Se envuelve en promesa porque la API
// nativa es por callbacks y aquí conviene poder esperarla.
function _dcPosicion(){
  return new Promise(function(res,rej){
    if(!navigator.geolocation) return rej(new Error('El dispositivo no informa ubicación'));
    navigator.geolocation.getCurrentPosition(
      function(p){ res({lat:p.coords.latitude, lon:p.coords.longitude}); },
      function(e){
        var m = (e && e.code===1) ? 'Permiso de ubicación denegado'
              : (e && e.code===3) ? 'La ubicación tardó demasiado'
              : 'No se pudo obtener la ubicación';
        rej(new Error(m));
      },
      { enableHighAccuracy:false, timeout:10000, maximumAge:30*60*1000 }
    );
  });
}

function renderDashClima(){
  var box=_dcBox(); if(!box) return;
  var c=_dcCache();
  // Se dibuja de inmediato lo guardado y recién después se decide si refrescar:
  // así el dashboard nunca queda en blanco esperando al GPS ni a la red.
  _dcPintar(c);
  var vencido = !c || !c.ts || (Date.now()-c.ts > 3*3600*1000);
  if(!vencido || !navigator.onLine) return;
  // La primera vez se espera un gesto del usuario: pedir el GPS al entrar al
  // dashboard dispara un permiso inesperado y varios navegadores lo bloquean.
  if(!c){ _dcPermisoConcedido().then(function(ok){ if(ok) dcActualizarClima(true); }); return; }
  dcActualizarClima(true);
}

function _dcPermisoConcedido(){
  try{
    if(navigator.permissions && navigator.permissions.query){
      return navigator.permissions.query({name:'geolocation'})
        .then(function(st){ return st.state==='granted'; })
        .catch(function(){ return false; });
    }
  }catch(e){}
  return Promise.resolve(false);
}

async function dcActualizarClima(silencioso){
  if(_dcCargando) return;
  var box=_dcBox(); if(!box) return;
  _dcCargando=true;
  _dcPintar(_dcCache(), 'Obteniendo ubicación…');
  try{
    var pos=await _dcPosicion();
    var url='https://api.open-meteo.com/v1/forecast'+
      '?latitude='+encodeURIComponent(pos.lat)+'&longitude='+encodeURIComponent(pos.lon)+
      '&daily=weathercode,temperature_2m_min,temperature_2m_max,precipitation_sum'+
      '&current=temperature_2m,weathercode&timezone=auto&forecast_days=7';
    var r=await fetch(url,{cache:'no-store'});
    if(!r.ok) throw new Error('HTTP '+r.status);
    var j=await r.json();
    var d=j.daily||{}, cur=j.current||{};
    var dias=(d.time||[]).map(function(f,i){
      return { fecha:f, cod:(d.weathercode||[])[i],
               min:(d.temperature_2m_min||[])[i], max:(d.temperature_2m_max||[])[i],
               lluvia:(d.precipitation_sum||[])[i] };
    });
    _dcGuardar({ ts:Date.now(), lat:pos.lat, lon:pos.lon, tz:j.timezone||'',
                 ahora:(cur.temperature_2m!=null?cur.temperature_2m:null),
                 codAhora:(cur.weathercode!=null?cur.weathercode:null), dias:dias });
    _dcPintar(_dcCache());
  }catch(e){
    console.warn('[SCI] Clima dashboard:', e);
    _dcPintar(_dcCache(), null, String(e.message||e));
    if(!silencioso && typeof toast==='function') toast('Clima no disponible', String(e.message||e),'info');
  }finally{ _dcCargando=false; }
}
try{ window.dcActualizarClima=dcActualizarClima; window.renderDashClima=renderDashClima; }catch(e){}

function _dcPintar(c, cargando, error){
  var box=_dcBox(); if(!box) return;
  var ico=(typeof _helIconoClima==='function')?_helIconoClima:function(){ return {i:'',t:''}; };
  var fmtT=function(n){ return (n==null||isNaN(n))?'—':Number(n).toFixed(1).replace('.',',')+'°'; };
  var fmtMM=function(n){ return (n==null||isNaN(n))?'—':Number(n).toFixed(1).replace('.',','); };
  var corto=(typeof _helDiaCorto==='function')?_helDiaCorto:function(f){ return f; };

  if(cargando){
    box.innerHTML='<div style="border:1px solid #e3e8ee;border-radius:10px;padding:9px 12px;background:#fff;font-size:12.5px;color:#64748b">🛰️ '+cargando+'</div>';
    return;
  }
  if(!c || !c.dias || !c.dias.length){
    box.innerHTML='<div style="border:1px solid #e3e8ee;border-radius:10px;padding:11px 14px;background:#fff;display:flex;gap:10px;align-items:center;flex-wrap:wrap">'+
      '<span style="font-size:12.5px;color:#475569">🌤️ Vea el pronóstico de 7 días para donde se encuentra.</span>'+
      '<button onclick="dcActualizarClima()" style="background:#0a6ed1;color:#fff;border:none;border-radius:7px;padding:6px 12px;font-size:12px;font-weight:700;cursor:pointer">📍 Usar mi ubicación</button>'+
      (error?'<span style="font-size:11px;color:#92600a">'+_helEsc(error)+'</span>':'')+
    '</div>';
    return;
  }

  var icAhora=ico(c.codAhora);
  // Cada día es un bloque HORIZONTAL compacto: aprovecha el ancho para que el
  // widget ocupe la mitad del alto. Muestra icono, mínima/máxima y mm de lluvia.
  var celdas=c.dias.map(function(d){
    var i2=ico(d.cod);
    // Se marcan las noches de posible helada con el mismo criterio del módulo
    var frio=(d.min!=null && d.min<=2), hiela=(d.min!=null && d.min<=0);
    var col=hiela?'#b91c1c':(frio?'#b45309':'#0f172a');
    var mm=(d.lluvia!=null && !isNaN(d.lluvia))?Number(d.lluvia):0;
    return '<div style="flex:1;min-width:96px;display:flex;align-items:center;gap:7px;padding:3px 6px'+
        (frio?';background:'+(hiela?'#fef2f2':'#fffbeb')+';border-radius:7px':'')+'">'+
      '<div style="font-size:18px;line-height:1" title="'+_helEsc(i2.t)+'">'+(i2.i||'🌤️')+'</div>'+
      '<div style="line-height:1.25;min-width:0">'+
        '<div style="font-size:10px;color:#94a3b8;white-space:nowrap">'+_helEsc(corto(d.fecha))+'</div>'+
        '<div style="white-space:nowrap"><span style="font-size:13px;font-weight:800;color:'+col+'">'+fmtT(d.min)+'</span>'+
          '<span style="font-size:10px;color:#94a3b8"> / '+fmtT(d.max)+'</span></div>'+
        '<div style="font-size:10px;color:'+(mm>0?'#0a6ed1':'#cbd5e1')+';white-space:nowrap">💧 '+fmtMM(d.lluvia)+' mm</div>'+
      '</div>'+
    '</div>';
  }).join('');

  var hiela=c.dias.some(function(d){ return d.min!=null && d.min<=0; });
  var frio =c.dias.some(function(d){ return d.min!=null && d.min<=2; });
  var alerta = hiela ? '🚨 Helada pronosticada' : (frio ? '⚠️ Noches bajo 2°' : '');

  box.innerHTML='<div style="border:1px solid '+(hiela?'#fecaca':(frio?'#fde68a':'#e3e8ee'))+
      ';border-radius:10px;padding:8px 12px;background:#fff">'+
    '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:5px">'+
      '<div style="font-size:12.5px;color:#475569">'+
        (icAhora.i?icAhora.i+' ':'🌤️')+' <strong>Mi ubicación</strong>'+
        (c.ahora!=null?' · <strong style="font-size:15px;color:#0a6ed1">'+fmtT(c.ahora)+'</strong> ahora':'')+
        (alerta?' · <strong style="color:'+(hiela?'#b91c1c':'#b45309')+'">'+alerta+'</strong>':'')+
        '<span style="font-size:10px;color:#cbd5e1"> · Open-Meteo</span>'+
      '</div>'+
      '<button onclick="dcActualizarClima()" title="Actualizar" style="background:#f1f5f9;border:none;border-radius:7px;padding:4px 9px;font-size:11px;cursor:pointer;color:#475569">↻ '+
        ((typeof _helHace==='function')?_helHace(c.ts):'')+'</button>'+
    '</div>'+
    '<div style="display:flex;gap:2px;overflow-x:auto">'+celdas+'</div>'+
    (error?'<div style="font-size:10.5px;color:#92600a;margin-top:4px">'+_helEsc(error)+'</div>':'')+
  '</div>';
}

/* ════════ EXPORTAR ════════ */
function helExportar(){
  var regs=_helVista||[];
  if(!regs.length){ toast('Sin datos','No hay registros para exportar','error'); return; }
  var cab=['Fecha','Temporada','Torre','Responsable','Hora inicio','Hora termino','Horas control',
           'Temp inicio (C)','Temp apagado (C)','Temp minima (C)','Horometro inicial','Horometro termino','Horas funcionamiento',
           'Partida','Litros estanque','Observaciones'];
  var q=function(v){ return '"'+String(v==null?'':v).replace(/"/g,'""')+'"'; };
  var lineas=[cab.map(q).join(';')];
  regs.forEach(function(r){
    var hr=_helHorasReloj(r.horaInicio,r.horaTermino), hh=_helHorasHorom(r);
    lineas.push([
      r.fecha||'', r.temporada||'', r.torre||'', r.responsable||'',
      r.horaInicio||'', r.horaTermino||'', hr===null?'':hr.toFixed(2),
      r.tempInicio==null?'':r.tempInicio, r.tempApagado==null?'':r.tempApagado, r.tempMinima==null?'':r.tempMinima,
      r.horometroInicial==null?'':r.horometroInicial, r.horometroFinal==null?'':r.horometroFinal,
      hh===null?'':hh.toFixed(2),
      (r.partida==='auto'?'Automatica':'Manual'),
      r.litrosEstanque==null?'':r.litrosEstanque, r.observaciones||''
    ].map(q).join(';'));
  });
  // BOM para que Excel respete los acentos
  var blob=new Blob(['\ufeff'+lineas.join('\r\n')],{type:'text/csv;charset=utf-8;'});
  var a=document.createElement('a');
  a.href=URL.createObjectURL(blob);
  a.download='heladas_'+(_helFTemp||'todas')+'.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ URL.revokeObjectURL(a.href); a.remove(); },500);
  toast('Exportado', regs.length+' registro(s)','success');
}

/* ════════ EXPOSICIÓN GLOBAL ════════ */
try{
  window.renderHelada=renderHelada;
  window.helTab=helTab;
  window.helFiltrar=helFiltrar;
  window.helNuevo=helNuevo;
  window.helEditar=helEditar;
  window.helEliminar=helEliminar;
  window.helGuardar=helGuardar;
  window.helHintHoras=helHintHoras;
  window.helHintHorometro=helHintHorometro;
  window.helAgregarTorre=helAgregarTorre;
  window.helQuitarTorre=helQuitarTorre;
  window.helRenombrarTorre=helRenombrarTorre;
  window.helExportar=helExportar;
  window.helCargarPronostico=helCargarPronostico;
  window.helCargarHistorico=helCargarHistorico;
  window.helConfigClima=helConfigClima;
  window.helGuardarClima=helGuardarClima;
  window.helToggleKey=helToggleKey;
  window.helExportarHistorico=helExportarHistorico;
  window.helFiltrarDiesel=helFiltrarDiesel;
  window.helConfigDiesel=helConfigDiesel;
  window.helGuardarConfigDiesel=helGuardarConfigDiesel;
  window.helExportarDiesel=helExportarDiesel;
}catch(e){}
