// pagos.js — Módulo de pagos masivos a proveedores y cobros de clientes
//
// Permite:
//   - Ver documentos con saldo pendiente (proveedores o clientes)
//   - Seleccionar varios y aplicar pago/cobro con cuenta de caja o banco
//   - Generar un asiento contable que es el registro maestro del pago
//   - Derivar desde ese asiento el saldo de cada documento (pagos[] queda sólo como legado)
//
// Al pagar N documentos con la misma cuenta, se crea UN asiento contable
// con una línea por documento (proveedor DEBE) y una única línea de banco/caja
// (HABER). Esto refleja la realidad de una transferencia consolidada.

import {toast, fmtC, MESES, pdcNm, PDC, today, dteV, dteC, esDteHonorario, rutFmt, pn, rutParse} from './core.js';
import {genDiario} from './reportes.js';
import {S} from './state.js';
import {proxFolioAsiento, CUENTAS_AUX, editarAsiento} from './asientos.js';
import {logAccion,logCambio} from './firebase.js';
import {rerender, nav} from './ui.js';
import {abrirEditorPago} from './pagoeditor.js';
import {inputCuenta} from './buscadorcuentas.js';
import {pagosDocumento} from './motor-contable.js';
import {refFolioDoc} from './auxdocs.js';
import {validarMovimientosPDC} from './pdc-reglas.js';
import {ejercicioCerrado,puedeOperarFecha,persistirAsientosCritico} from './contabilidad-v2.js';

// Estado del módulo — persiste solo mientras estás en la vista
let PAG={
  tipo:'proveedor',      // 'proveedor' | 'cliente'
  fecha:today(),
  cuentaPago:'',         // caja o banco
  glosa:'',
  seleccionados:new Set(),   // set de docId
  montoParcial:{},       // docId → monto (para pagos parciales)
  filtro:{texto:'',mes:''},
  vista:'pendientes',    // 'pendientes' | 'historial' (V2.22.11)
  hist:{tipo:'',mes:'',texto:''},
  // V2.22.12 · Abono del operador de tarjetas (1107004 → banco, con o sin comisión)
  tj:{fecha:today(),banco:'',depositado:0,comision:0,trato:'proveedor',rut:'',razon:'',cuentaGasto:'',glosa:''},
};

// ═══ HELPERS ═══

// Documentos con saldo pendiente, aplicando efecto de NC/ND referenciadas.
//
// Reglas:
//   - Facturas (DTE 30/33/34/45/46 compras · 33/34/39/41 ventas): aparecen
//     como docs pendientes con su saldo real (total - NC referenciadas + ND
//     referenciadas - pagos).
//   - NC/ND que tienen `folioRef` apuntando a una factura: NO aparecen como
//     doc separado; su monto se aplica al saldo de la factura referenciada.
//   - NC/ND SIN referencia ("huérfanas"): aparecen aparte con badge amarillo
//     pidiendo que se asocien a una factura del mismo proveedor/cliente.
// V2.22.10 · Documentos que pueden tener saldo en el auxiliar: los mismos que
// usa Auxiliares. Se excluyen los anulados (cada edición o reimportación que
// anula y vuelve a registrar deja una copia anulada) y, en ventas, las que no
// van a clientes (contado/banco, tarjetas, deudores varios). Antes Pagos y
// Cobros los leía todos y una misma factura aparecía repetida como pendiente.
function docsAuxiliarPago(tipo){
  const arr=tipo==='proveedor'?S.compras:S.ventas;
  return (arr||[]).filter(d=>d&&d.estado!=='anulado'&&(tipo==='proveedor'||d.formaPago==='clientes'));
}

function docsPendientes(tipo){
  const arr=docsAuxiliarPago(tipo);
  // Separar facturas de NC/ND
  const facturas=[];
  const notasReferenciadas={};   // key = rut|folioRef -> [notas]
  const huerfanas=[];
  arr.forEach(d=>{
    const dteInfo=tipo==='proveedor'?dteC(d.tipoDTE):dteV(d.tipoDTE);
    const signo=dteInfo?.signo||1;
    if(signo<0||+d.tipoDTE===56){   // NC (signo -1) o ND (56)
      const fref=refFolioDoc(d);   // folioRef (manual) o referencia.folio (importador)
      if(fref){
        const key=d.rutCodigo+'|'+fref;
        if(!notasReferenciadas[key])notasReferenciadas[key]=[];
        notasReferenciadas[key].push({...d,dteInfo,signo});
      }else{
        huerfanas.push({...d,dteInfo,signo});
      }
    }else{
      facturas.push({...d,dteInfo,signo});
    }
  });

  // Calcular saldos de facturas aplicando NC/ND referenciadas
  const conSaldo=facturas.map(f=>{
    const key=f.rutCodigo+'|'+String(f.numero).trim();
    const notas=notasReferenciadas[key]||[];
    const efectoNotas=notas.reduce((s,n)=>s+((n.total||0)*n.signo),0);
    // Total: factura + notas (NC restan, ND suman)
    const totalReal=(f.total||0)+efectoNotas;
    const pagosSum=pagosDocumento(f,tipo,S.asientos).reduce((s,p)=>s+(p.monto||0),0);
    return {...f,totalSigno:totalReal,pagosSum,saldo:totalReal-pagosSum,notas,notasAuto:[]};
  });

  // ── Notas de crédito sin referencia: se imputan FIFO al mismo auxiliar ──
  // Una NC sin folio de referencia igual reduce la deuda con ese proveedor.
  // Si no se imputa, la factura que anula sigue apareciendo con saldo completo
  // y se puede pagar igual: el auxiliar termina rebajado DOS VECES por la misma
  // operación (una por la NC y otra por el pago). Se imputan de la más antigua
  // a la más nueva, el mismo criterio FIFO que usa el Aging de Auxiliares.
  const porRut={};
  conSaldo.forEach(f=>{(porRut[f.rutCodigo]||(porRut[f.rutCodigo]=[])).push(f);});
  Object.values(porRut).forEach(list=>list.sort((a,b)=>
    (a.fecha||'').localeCompare(b.fecha||'')||String(a.numero||'').localeCompare(String(b.numero||''))));

  const huerfanasRestantes=[];
  huerfanas.forEach(h=>{
    const totalSigno=(h.total||0)*h.signo;
    const pagosSum=pagosDocumento(h,tipo,S.asientos).reduce((s,p)=>s+(p.monto||0),0);
    let restante=totalSigno-pagosSum;
    // Sólo las de efecto negativo (NC) se imputan; una ND aumenta la deuda y
    // sigue siendo un documento por pagar en sí mismo.
    if(restante>=0){
      if(Math.abs(restante)>1)huerfanasRestantes.push({...h,totalSigno,pagosSum,saldo:restante,huerfana:true});
      return;
    }
    const aplicadoA=[];
    (porRut[h.rutCodigo]||[]).forEach(f=>{
      if(restante>=-0.5||f.saldo<=0.5)return;
      const aplica=Math.min(f.saldo,-restante);
      f.saldo-=aplica;
      restante+=aplica;
      f.notasAuto.push({numero:h.numero,tipoDTE:h.tipoDTE,fecha:h.fecha,monto:aplica,id:h.id});
      aplicadoA.push({numero:f.numero,monto:aplica});
    });
    if(restante<-0.5){
      // Sobrante: queda como saldo a favor del auxiliar
      huerfanasRestantes.push({...h,totalSigno,pagosSum,saldo:restante,huerfana:true,
        aplicadoParcial:aplicadoA.length>0,aplicadoA});
    }
  });

  const resultado=[];
  conSaldo.forEach(f=>{if(Math.abs(f.saldo)>1)resultado.push(f);});
  huerfanasRestantes.forEach(h=>resultado.push(h));
  return resultado;
}

// Documentos pendientes DESPUÉS de aplicar los filtros de mes y texto.
// Es la única fuente de verdad de "lo que se ve": la usan el render, el
// contador y —clave— el "seleccionar todos", que antes tomaba TODOS los
// documentos ignorando el filtro y por eso pagaba meses que no estaban a la
// vista.
function docsFiltrados(tipo){
  let arr=docsPendientes(tipo);
  if(PAG.filtro.mes){
    arr=arr.filter(d=>+String(d.fecha).slice(5,7)===+PAG.filtro.mes);
  }
  if(PAG.filtro.texto){
    const t=PAG.filtro.texto.toLowerCase();
    arr=arr.filter(d=>
      (d.razonSocial||'').toLowerCase().includes(t)||
      (d.rutCodigo||'').includes(t)||
      String(d.numero||'').includes(t)
    );
  }
  return arr;
}

// Auxiliares cuyo saldo quedó DEUDOR (se pagó más de lo que se debía).
// Es la huella que deja un documento pagado dos veces o un pago sobre una
// factura que ya estaba anulada por una nota de crédito.
function auxiliaresSobrepagados(tipo){
  const arr=docsAuxiliarPago(tipo);
  const porRut={};
  arr.forEach(d=>{
    const k=d.rutCodigo;if(!k)return;
    const dteInfo=tipo==='proveedor'?dteC(d.tipoDTE):dteV(d.tipoDTE);
    const signo=dteInfo?.signo||1;
    if(!porRut[k])porRut[k]={rutCodigo:k,rutDV:d.rutDV,razonSocial:d.razonSocial||'',deuda:0,pagado:0};
    porRut[k].deuda+=(d.total||0)*signo;
    porRut[k].pagado+=pagosDocumento(d,tipo,S.asientos).reduce((s,p)=>s+(p.monto||0),0);
    if(d.razonSocial)porRut[k].razonSocial=d.razonSocial;
  });
  return Object.values(porRut)
    .map(a=>({...a,exceso:a.pagado-a.deuda}))
    .filter(a=>a.exceso>1)
    .sort((a,b)=>b.exceso-a.exceso);
}

// Panel de alerta: auxiliares con saldo deudor por pagos en exceso
function avisoSobrepagos(){
  const lista=auxiliaresSobrepagados(PAG.tipo);
  if(!lista.length)return '';
  const esProv=PAG.tipo==='proveedor';
  const total=lista.reduce((s,a)=>s+a.exceso,0);
  const filas=lista.slice(0,15).map(a=>`<tr>
    <td class="tl" style="font-family:var(--mono);font-size:11px">${rutFmt(a.rutCodigo,a.rutDV)}</td>
    <td class="tnm" style="font-size:11px">${a.razonSocial||'(sin razón social)'}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtC(a.deuda)}</td>
    <td style="font-family:var(--mono);text-align:right">${fmtC(a.pagado)}</td>
    <td style="font-family:var(--mono);text-align:right;color:var(--err);font-weight:700">${fmtC(a.exceso)}</td>
  </tr>`).join('');
  return `<div style="background:rgba(248,81,73,.07);border:1px solid rgba(248,81,73,.35);border-radius:8px;padding:12px 14px;margin-bottom:14px">
    <div style="font-size:13px;font-weight:700;color:var(--err);margin-bottom:4px">
      ⚠️ ${lista.length} ${esProv?'proveedor':'cliente'}${lista.length===1?'':'es'} con ${esProv?'pagos':'cobros'} por sobre lo adeudado
    </div>
    <div style="font-size:11px;color:var(--mt);margin-bottom:10px;line-height:1.5">
      Se registró ${esProv?'un pago':'un cobro'} mayor al saldo real por <strong style="color:var(--err)">${fmtC(total)}</strong> en total.
      La causa habitual es haber ${esProv?'pagado':'cobrado'} una factura que <strong>ya estaba anulada por una nota de crédito</strong>:
      la cuenta del auxiliar queda rebajada dos veces por la misma operación.
      Revisa el detalle en Auxiliares y anula el ${esProv?'pago':'cobro'} sobrante desde su asiento.
    </div>
    <div class="tw" style="max-height:220px;overflow:auto"><table>
      <thead><tr><th class="tl">RUT</th><th class="tl">RAZÓN SOCIAL</th><th style="text-align:right">ADEUDADO</th><th style="text-align:right">${esProv?'PAGADO':'COBRADO'}</th><th style="text-align:right">EXCESO</th></tr></thead>
      <tbody>${filas}</tbody>
    </table></div>
    ${lista.length>15?`<div style="font-size:10px;color:var(--mt);margin-top:6px">Mostrando los primeros 15 de ${lista.length}.</div>`:''}
  </div>`;
}

// Facturas del mismo proveedor/cliente (para el selector "asociar a factura")
function facturasDelAuxiliar(tipo,rutCodigo){
  const arr=docsAuxiliarPago(tipo);
  return arr.filter(d=>{
    if(d.rutCodigo!==rutCodigo)return false;
    const dteInfo=tipo==='proveedor'?dteC(d.tipoDTE):dteV(d.tipoDTE);
    const signo=dteInfo?.signo||1;
    return signo>0&&+d.tipoDTE!==56;   // solo facturas, no NC ni ND
  }).sort((a,b)=>(b.fecha||'').localeCompare(a.fecha||''));
}

// Cuentas de caja y banco disponibles (código 1101xxx)
function cuentasPagoOpts(){
  const cuentas=PDC.filter(c=>c.cd&&c.cd.startsWith('1101')&&c.tp==='A');
  let opts='<option value="">— seleccionar cuenta —</option>';
  cuentas.forEach(c=>{
    opts+=`<option value="${c.cd}" ${PAG.cuentaPago===c.cd?'selected':''}>${c.cd} — ${c.nm}</option>`;
  });
  return opts;
}

// ═══ RENDER ═══

function renderPagos(){
  const cont=document.getElementById('pagos-content');
  if(!cont)return;
  if(PAG.vista==='historial'){renderHistorialPagos(cont);return;}
  if(PAG.vista==='tarjetas'){renderTarjetasPagos(cont);return;}

  const filtrados=docsFiltrados(PAG.tipo);

  // Totales de selección (para el panel superior)
  let totSel=0, cntSel=0;
  PAG.seleccionados.forEach(id=>{
    const d=filtrados.find(x=>x.id===id);
    if(!d)return;
    const monto=PAG.montoParcial[id]!=null?+PAG.montoParcial[id]:d.saldo;
    totSel+=monto; cntSel++;
  });

  const accionLbl=PAG.tipo==='proveedor'?'Pagar':'Cobrar';
  const sustantivo=PAG.tipo==='proveedor'?'pago':'cobro';   // "fecha del pago" / "datos del cobro"

  let h=`
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn ${PAG.tipo==='proveedor'?'btn-p':'btn-g'}" onclick="setPagTipo('proveedor')">🏭 Pagar Proveedores</button>
      <button class="btn ${PAG.tipo==='cliente'?'btn-p':'btn-g'}" onclick="setPagTipo('cliente')">📇 Cobrar Clientes</button>
      <button class="btn btn-g" onclick="verTarjetasPagos()">💳 Abono tarjetas</button>
      <button class="btn btn-g" onclick="verHistorialPagos()">📜 Historial</button>
    </div>
    ${avisoSobrepagos()}

    <div class="card" style="margin-bottom:14px">
      <div class="card-title">💳 Datos del ${sustantivo}</div>
      <div class="fg">
        <div class="grp"><label>Fecha del ${sustantivo}</label>
          <input type="date" value="${PAG.fecha}" oninput="setPagCampo('fecha',this.value)"></div>
        <div class="grp"><label>${PAG.tipo==='proveedor'?'Cuenta de origen':'Cuenta de destino'} (caja / banco)</label>
          <select onchange="setPagCampo('cuentaPago',this.value)">${cuentasPagoOpts()}</select></div>
        <div class="grp full"><label>Glosa del asiento (opcional)</label>
          <input type="text" placeholder="Ej: Pago proveedores julio 2026" value="${PAG.glosa.replace(/"/g,'&quot;')}" oninput="setPagCampo('glosa',this.value)"></div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;padding:10px 14px;background:${cntSel?'rgba(46,160,67,.08)':'var(--sf2)'};border-radius:6px;border:1px solid ${cntSel?'var(--ach)':'var(--bd)'};gap:10px;flex-wrap:wrap">
        <div style="font-size:12px">
          <strong>${cntSel}</strong> ${cntSel===1?'documento':'documentos'} seleccionado${cntSel===1?'':'s'}
          <span style="color:var(--mt);margin-left:8px">Total: <span style="font-family:var(--mono);font-weight:700;color:var(--tx)">${fmtC(totSel)}</span></span>
        </div>
        <button class="btn btn-p" ${cntSel&&PAG.cuentaPago?'':'disabled style="opacity:.4;cursor:not-allowed"'} onclick="ejecutarPago()">
          💾 ${accionLbl} ${cntSel} seleccionado${cntSel===1?'':'s'}
        </button>
      </div>
    </div>

    <div class="filter-row">
      <span class="f-lbl">Filtrar:</span>
      <select onchange="setPagFiltro('mes',this.value)">
        <option value="">Todos los meses</option>
        ${MESES.map((m,i)=>`<option value="${i+1}" ${+PAG.filtro.mes===i+1?'selected':''}>${m}</option>`).join('')}
      </select>
      <input type="text" id="pag-search" placeholder="Buscar por RUT, razón social o folio…" value="${PAG.filtro.texto.replace(/"/g,'&quot;')}"
        oninput="setPagFiltro('texto',this.value)" style="min-width:220px">
      <button class="btn btn-g" onclick="limpiarPagFiltro()">Limpiar</button>
      <span class="doc-count" id="pag-count"></span>
    </div>
    <div id="pagos-tabla"></div>
  `;

  cont.innerHTML=h;
  renderPagosTabla();
}

// Renderiza SOLO la tabla + contador (depende de los filtros). Se separa del
// render principal para poder filtrar por texto sin destruir el input de
// búsqueda (que perdería el foco y cerraría el teclado en móvil).
function renderPagosTabla(){
  const box=document.getElementById('pagos-tabla');
  if(!box)return;

  const accionLbl=PAG.tipo==='proveedor'?'Pagar':'Cobrar';
  const sustantivo=PAG.tipo==='proveedor'?'pago':'cobro';

  const filtrados=docsFiltrados(PAG.tipo);

  const porRut={};
  filtrados.forEach(d=>{
    const k=d.rutCodigo||'sinRut';
    if(!porRut[k])porRut[k]={rutCodigo:d.rutCodigo,rutDV:d.rutDV,razonSocial:d.razonSocial,docs:[],total:0};
    porRut[k].docs.push(d);
    porRut[k].total+=d.saldo;
  });

  const cnt=document.getElementById('pag-count');
  if(cnt)cnt.textContent=`${filtrados.length} documentos pendientes · ${Object.keys(porRut).length} auxiliares`;

  if(!filtrados.length){
    box.innerHTML=`<div style="text-align:center;padding:40px;color:var(--mt)">
      <div style="font-size:36px;margin-bottom:8px">${PAG.tipo==='proveedor'?'💰':'📥'}</div>
      No hay documentos pendientes de ${sustantivo}
    </div>`;
    return;
  }

  // Tabla agrupada por auxiliar
  // La razón social y el RUT viven en la fila de cabecera de cada auxiliar, así
  // que la columna que los anunciaba nunca los mostraba: lo que llevaba era el
  // vencimiento, y quedaba en blanco salvo que el documento tuviera fecha. Se
  // retira y el vencimiento pasa bajo la fecha, que es donde se busca. Con esa
  // columna fuera, las cifras tienen el ancho que necesitan sin desbordarse.
  let h='<div class="card-np"><div class="tw"><table class="tbl-pagos">';
  h+=`<thead><tr>
    <th class="c-chk"><input type="checkbox" onchange="togglePagAll(this.checked)"></th>
    <th class="tl c-fecha">FECHA</th>
    <th class="tl c-dte">DOCUMENTO</th>
    <th class="tl c-num">N°</th>
    <th class="c-money">TOTAL DOC</th>
    <th class="c-money">YA ${PAG.tipo==='proveedor'?'PAGADO':'COBRADO'}</th>
    <th class="c-money">SALDO</th>
    <th class="c-monto">MONTO ${accionLbl.toUpperCase()}</th>
  </tr></thead><tbody>`;

  const hoy=today();
  const diasVencido=fv=>{const a=Date.parse(fv+'T00:00:00Z'),b=Date.parse(hoy+'T00:00:00Z');return (isNaN(a)||isNaN(b))?0:Math.round((b-a)/86400000);};
  Object.values(porRut).sort((a,b)=>(a.razonSocial||'').localeCompare(b.razonSocial||'')).forEach(aux=>{
    // Encabezado del auxiliar
    h+=`<tr style="background:var(--sf2)">
      <td colspan="4" class="tl" style="font-weight:700;padding:6px 8px">
        ${aux.razonSocial||'(sin razón social)'} <span style="color:var(--mt);font-family:var(--mono);font-size:10px">${rutFmt(aux.rutCodigo,aux.rutDV)}</span>
      </td>
      <td colspan="3" style="text-align:right;padding:6px 8px;color:var(--mt);font-size:11px">
        Total pendiente:
      </td>
      <td style="text-align:right;padding:6px 8px;font-family:var(--mono);font-weight:700">${fmtC(aux.total)}</td>
    </tr>`;
    aux.docs.forEach(d=>{
      const sel=PAG.seleccionados.has(d.id);
      const dteNm=d.dteInfo?.nm||`DTE ${d.tipoDTE}`;
      const montoDef=PAG.montoParcial[d.id]!=null?PAG.montoParcial[d.id]:d.saldo;

      // Documento vencido: pendiente (saldo > 0) con fecha de vencimiento ya
      // pasada. Se marca en rojo para que salte a la vista en la lista de pagos.
      const vencida=d.saldo>0&&d.fechaVencimiento&&d.fechaVencimiento<hoy;
      const diasV=vencida?diasVencido(d.fechaVencimiento):0;
      const badgeVencida=vencida?`
        <span style="background:rgba(248,81,73,.15);color:var(--err);padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px">
          🔴 VENCIDA ${diasV} día${diasV===1?'':'s'}
        </span>`:'';

      // Badge de huérfana: NC/ND sin referencia
      const badgeHuerfana=d.huerfana?`
        <span style="background:rgba(255,193,7,.15);color:var(--warn);padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px;cursor:pointer" onclick="event.stopPropagation();abrirAsociarNota('${d.id}','${d.rutCodigo}')">
          ⚠ SIN REFERENCIA${d.aplicadoParcial?' · IMPUTADA EN PARTE':''} · Asociar
        </span>`:'';
      // Nota de crédito sin referencia imputada automáticamente a esta factura:
      // el saldo ya viene rebajado, por eso se avisa de dónde sale.
      // Notas imputadas automáticamente por falta de referencia. Antes eran un
      // simple aviso y la nota desaparecía de la lista, así que no quedaba forma
      // de corregir a qué factura se aplicó. Ahora cada una es un botón que abre
      // la asociación para fijarla donde corresponde.
      const badgeNotaAuto=(d.notasAuto&&d.notasAuto.length)?d.notasAuto.map(n=>`
        <span style="background:rgba(88,166,255,.13);color:var(--info);padding:2px 7px;border-radius:3px;font-size:9px;font-weight:700;margin-left:6px;cursor:pointer"
          title="Aplicada automáticamente por no tener folio de referencia. Pulsa para asociarla a la factura que corresponde."
          onclick="event.stopPropagation();abrirAsociarNota('${n.id}','${d.rutCodigo}','${PAG.tipo}')">
          ↩ NC N°${n.numero} ${fmtC(n.monto)} · Asociar
        </span>`).join(''):'';

      // Los avisos de nota de crédito van en la celda del documento, que es la
      // que crece: en la del folio obligaban a esa columna a ser ancha para
      // nada, y el N° es lo más corto de la fila.
      h+=`<tr ${vencida?'style="background:rgba(248,81,73,.05)"':(sel?'style="background:rgba(46,160,67,.04)"':'')}>
        <td class="c-chk"><input type="checkbox" ${sel?'checked':''} onchange="togglePagSel('${d.id}',this.checked)"></td>
        <td class="tl c-fecha mono11">${d.fecha}${d.fechaVencimiento?`<div class="pag-vence"${vencida?' style="color:var(--err);font-weight:700"':''}>Vence ${d.fechaVencimiento}</div>`:''}</td>
        <td class="tl c-dte">${dteNm}${badgeVencida}${badgeHuerfana}${badgeNotaAuto}</td>
        <td class="tl c-num mono11">${d.numero}</td>
        <td class="c-money">${fmtC(d.totalSigno)}</td>
        <td class="c-money" style="color:${d.pagosSum?'var(--ach)':'var(--mt)'}">${d.pagosSum?fmtC(d.pagosSum):'—'}</td>
        <td class="c-money" style="font-weight:700;color:${d.saldo<0?'var(--err)':'var(--tx)'}">${fmtC(d.saldo)}</td>
        <td class="c-monto">
          <input type="number" class="pag-monto-inp money-input"
            value="${montoDef}" oninput="setPagMontoParcial('${d.id}',this.value)"
            ${sel?'':'disabled style="opacity:.4"'}>
        </td>
      </tr>`;
      // Sub-líneas: NC/ND asociadas a esta factura
      (d.notas||[]).forEach(n=>{
        const nmN=n.dteInfo?.nm||`DTE ${n.tipoDTE}`;
        const efecto=(n.total||0)*n.signo;
        h+=`<tr class="pag-sub">
          <td class="c-chk"></td>
          <td class="tl c-fecha mono10">${n.fecha}</td>
          <td class="tl c-dte" style="font-size:10px;color:var(--info)">↳ ${nmN}
            <span style="color:var(--mt)">· aplicado a N°${d.numero}</span></td>
          <td class="tl c-num mono10">${n.numero}
            <button class="btn btn-g pag-quitar" onclick="quitarReferencia('${n.id}')" title="Quitar la referencia a la factura">✕</button>
          </td>
          <td class="c-money" style="font-size:10px;color:${efecto<0?'var(--err)':'var(--ach)'}">${efecto>0?'+':''}${fmtC(efecto)}</td>
          <td class="c-money"></td>
          <td class="c-money"></td>
          <td class="c-monto"></td>
        </tr>`;
      });
    });
  });
  h+='</tbody></table></div></div>';

  box.innerHTML=h;
}

// ═══ ACCIONES ═══

function setPagTipo(t){
  PAG.vista='pendientes';
  PAG.tipo=t;
  PAG.seleccionados=new Set();
  PAG.montoParcial={};
  renderPagos();
}
function setPagCampo(campo,valor){
  PAG[campo]=valor;
  // No re-renderiza para no perder foco en el input
  if(campo==='cuentaPago')renderPagos();
}
function setPagFiltro(campo,valor){
  PAG.filtro[campo]=valor;
  // Al cambiar de MES se limpia la selección: si no, quedarían marcados
  // documentos de otro mes que ya no se ven y se pagarían por error (justo el
  // problema de "pagué enero y también se pagó lo demás"). El filtro de texto
  // solo acota lo visible del mismo mes, así que no borra la selección.
  if(campo==='mes'){PAG.seleccionados=new Set();PAG.montoParcial={};renderPagos();return;}
  // Solo re-renderiza la tabla (no el contenedor completo), así el input de
  // búsqueda conserva el foco y no se cierra el teclado en móvil.
  renderPagosTabla();
}
function limpiarPagFiltro(){
  PAG.filtro={texto:'',mes:''};
  renderPagos();
}
function togglePagSel(docId,checked){
  if(checked)PAG.seleccionados.add(docId);
  else{PAG.seleccionados.delete(docId);delete PAG.montoParcial[docId];}
  renderPagos();
}
function togglePagAll(checked){
  // "Seleccionar todos" opera SOLO sobre lo filtrado y REEMPLAZA la selección
  // (no acumula), para que nunca queden marcados documentos de un mes que no
  // se está viendo.
  if(checked){
    PAG.seleccionados=new Set(docsFiltrados(PAG.tipo).map(d=>d.id));
  }else{
    PAG.seleccionados=new Set();PAG.montoParcial={};
  }
  renderPagos();
}
function setPagMontoParcial(docId,valor){
  const v=pn(valor);
  if(!v)delete PAG.montoParcial[docId];
  else PAG.montoParcial[docId]=v;
  // No re-renderiza para no perder foco
}

// ═══ EJECUTAR PAGO ═══
async function ejecutarPago(){
  if(!puedeOperarFecha(PAG.fecha)){toast('🔒 El período de la fecha de pago está cerrado. Reábrelo antes de registrar pagos o cobros.','e');return;}
  if(!PAG.cuentaPago){toast('⚠️ Selecciona la cuenta de origen (caja o banco)','e');return;}
  if(!PAG.seleccionados.size){toast('⚠️ Selecciona al menos un documento','e');return;}
  if(!PAG.fecha){toast('⚠️ Ingresa la fecha del pago','e');return;}

  const docs=docsPendientes(PAG.tipo);
  const arr=PAG.tipo==='proveedor'?S.compras:S.ventas;
  const cuentaAux=PAG.tipo==='proveedor'?'2102001':'1104001';
  const nomAux=pdcNm(cuentaAux);
  const nomPago=pdcNm(PAG.cuentaPago);

  // Construir los movs del asiento
  const movs=[];
  let totalPago=0;
  const pagosPorDoc=[];
  const excedidos=[];
  const asientoId='a_pag_'+Date.now();

  PAG.seleccionados.forEach(docId=>{
    const d=docs.find(x=>x.id===docId);
    if(!d)return;
    let monto=PAG.montoParcial[docId]!=null?+PAG.montoParcial[docId]:d.saldo;
    if(!monto)return;
    // Nunca pagar por sobre el saldo real del documento: `d.saldo` ya viene
    // neto de notas de crédito (referenciadas e imputadas) y de pagos previos.
    if(monto>d.saldo+1){
      excedidos.push({numero:d.numero,pedido:monto,saldo:d.saldo});
      monto=d.saldo;
    }
    if(monto<=0)return;
    totalPago+=monto;
    pagosPorDoc.push({docId,monto,doc:d});
    // Una línea de auxiliar por documento (para trazabilidad en el libro mayor)
    const dteNm=d.dteInfo?.nm||`DTE ${d.tipoDTE}`;
    const descLinea=`${d.razonSocial||''} · ${dteNm} N°${d.numero}`.trim();
    if(PAG.tipo==='proveedor'){
      // Los honorarios se cargan contra Honorarios por Pagar (2102006), no
      // contra Proveedores Nacionales, para saldar la cuenta correcta.
      const cuentaDoc=esDteHonorario(d.tipoDTE)?'2102006':cuentaAux;
      movs.push({
        cd:cuentaDoc, nm:pdcNm(cuentaDoc), desc:descLinea,
        debe:monto, haber:0,
        rutCodigo:d.rutCodigo, rutDV:d.rutDV, folio:d.numero, tipoDTE:d.tipoDTE, docId:d.id,
      });
    }else{
      movs.push({
        cd:cuentaAux, nm:nomAux, desc:descLinea,
        debe:0, haber:monto,
        rutCodigo:d.rutCodigo, rutDV:d.rutDV, folio:d.numero, tipoDTE:d.tipoDTE, docId:d.id,
      });
    }
  });

  if(excedidos.length){
    const det=excedidos.map(x=>`  · N°${x.numero}: pediste ${fmtC(x.pedido)} y el saldo real es ${fmtC(x.saldo)}`).join('\n');
    if(!confirm(`Hay ${excedidos.length} documento(s) con un monto mayor a su saldo real:\n\n${det}\n\n`+
      `Se ajustarán al saldo para no rebajar dos veces la cuenta del auxiliar.\n¿Continuar?`))return;
  }
  if(!totalPago){toast('⚠️ Monto total = 0','e');return;}

  // Una única línea de banco/caja consolidada
  if(PAG.tipo==='proveedor'){
    movs.push({cd:PAG.cuentaPago, nm:nomPago, desc:`${PAG.seleccionados.size} pagos a proveedores`, debe:0, haber:totalPago});
  }else{
    movs.push({cd:PAG.cuentaPago, nm:nomPago, desc:`${PAG.seleccionados.size} cobros a clientes`, debe:totalPago, haber:0});
  }

  // Validar el asiento contra las reglas del Plan de Cuentas antes de persistir.
  const vp=validarMovimientosPDC(movs);
  if(!vp.ok){toast('❌ '+vp.errores[0],'e');return;}

  // Crear asiento contable
  if(!S.asientos)S.asientos=[];
  const glosaFinal=PAG.glosa||`${PAG.tipo==='proveedor'?'Pago a proveedores':'Cobro a clientes'} — ${pagosPorDoc.length} documento${pagosPorDoc.length===1?'':'s'}`;
  const guardado=await persistirAsientosCritico(()=>{S.asientos.push({
    id:asientoId,fecha:PAG.fecha,glosa:glosaFinal,movs,tipo:'pago',cuentaPago:PAG.cuentaPago,
    esPagoAgrupado:true,documentos:pagosPorDoc.map(x=>({docId:x.docId,monto:x.monto,tipo:PAG.tipo})),creadoEn:new Date().toISOString()
  });});
  if(!guardado.ok){
    // Mensaje según la causa real, para no dejar al usuario sin saber qué hacer.
    // El motivo técnico se muestra entre paréntesis para poder diagnosticar.
    const mo=String(guardado.motivo||'');
    let msg;
    if(mo==='sin-nube-correlativo'||mo==='reservador-no-disponible'||mo==='no-se-pudo-reservar-correlativo')
      msg='☁️ Se necesita conexión con la nube para asignar el número contable. Revisa tu conexión y reintenta.';
    else if(mo==='conflicto')
      msg='☁️ Otro dispositivo guardó cambios primero. Toca ☁️⬇ (restaurar desde la nube) para traerlos y vuelve a registrar el pago.';
    else if(mo==='clave-no-sincronizada')
      msg='☁️ Los asientos aún no terminan de sincronizar con la nube. Espera unos segundos, o recarga la página, y reintenta.';
    else if(mo==='ejercicio-cerrado')
      msg='🔒 El ejercicio está cerrado. Reábrelo antes de registrar pagos o cobros.';
    else if(mo.startsWith('validacion-contable'))
      msg='❌ El asiento no pasó la validación contable. No se contabilizó. ('+mo.replace('validacion-contable:','').trim()+')';
    else
      msg='❌ No se pudo guardar el asiento de pago. La operación NO fue contabilizada. ('+(mo||'motivo desconocido')+')';
    toast(msg,'e');
    console.warn('[Pagos] Falló persistirAsientosCritico:',guardado);
    return;
  }
  const asientoNuevo=S.asientos.find(a=>a.id===asientoId);const n=asientoNuevo?.numeroContable||asientoNuevo?.n||'?';
  logAccion(`${PAG.tipo==='proveedor'?'Pagó':'Cobró'} ${pagosPorDoc.length} documento(s)`,`Total ${fmtC(totalPago)} · Asiento N°${n}`);
  logCambio(PAG.tipo==='proveedor'?'Registró pago':'Registró cobro',{entidad:'asiento',id:asientoId,antes:null,despues:asientoNuevo,meta:{numeroContable:asientoNuevo?.numeroContable,tipo:'pago',documentos:pagosPorDoc.length,total:totalPago}});
  toast(`✅ ${PAG.tipo==='proveedor'?'Pago registrado':'Cobro registrado'}: ${pagosPorDoc.length} doc · ${fmtC(totalPago)} · Asiento N°${n}`);

  // Limpiar selección y refrescar
  PAG.seleccionados=new Set();
  PAG.montoParcial={};
  PAG.glosa='';
  rerender();
}

// ═══ ASOCIAR NC/ND A FACTURA DE REFERENCIA ═══
//
// En Chile, las NC y ND se emiten CONTRA un documento específico (una factura,
// típicamente). El SII trae el campo "Folio Documento Referenciado" solo en el
// XML del DTE, no en el resumen RCV, así que el usuario debe asociarlas
// manualmente. Al asociar, la NC se descuenta del saldo pendiente de la factura.

// Estado del modal de asociación. Guarda el tipo con el que se abrió porque
// ahora también se entra desde Auxiliares, donde PAG.tipo no manda.
let ASOC={tipo:null,volverA:null};

function abrirAsociarNota(notaId,rutCodigo,tipo,volverA){
  const t=tipo||PAG.tipo;
  ASOC={tipo:t, volverA:volverA||null};
  const arr=t==='proveedor'?S.compras:S.ventas;
  const nota=arr.find(d=>d.id===notaId);
  if(!nota)return;
  const facturas=facturasDelAuxiliar(t,rutCodigo);
  if(!facturas.length){
    toast('⚠️ No hay facturas de este auxiliar para asociar','e');
    return;
  }
  const dteNotaInfo=t==='proveedor'?dteC(nota.tipoDTE):dteV(nota.tipoDTE);
  const nombreNota=dteNotaInfo?.nm||`DTE ${nota.tipoDTE}`;

  const box=document.getElementById('asoc-nota-modal-body');
  const modal=document.getElementById('asoc-nota-modal');
  if(!box||!modal)return;

  box.innerHTML=`
    <div style="padding:16px 20px">
      <div style="background:var(--sf2);border-radius:6px;padding:10px 14px;margin-bottom:14px">
        <div style="font-size:11px;color:var(--mt);text-transform:uppercase;font-weight:700;margin-bottom:4px">Nota a asociar</div>
        <div style="font-weight:600">${nombreNota} N°${nota.numero} · ${nota.fecha}</div>
        <div style="font-family:var(--mono);font-size:12px;margin-top:2px">Monto: ${fmtC(nota.total)}</div>
        <div style="font-size:11px;color:var(--mt);margin-top:2px">${nota.razonSocial||''} · ${rutFmt(nota.rutCodigo,nota.rutDV)}</div>
      </div>

      ${refFolioDoc(nota)?`<div class="info-tip" style="display:block;margin:0 0 12px">
        Hoy está asociada a la factura <strong>N°${refFolioDoc(nota)}</strong>. Elige otra para cambiarla.
      </div>`:`<div class="info-tip" style="display:block;margin:0 0 12px">
        Sin referencia. Mientras no la tenga, el sistema la descuenta de la factura más antigua con saldo,
        que no siempre es la que corresponde. Al asociarla queda imputada donde tú indiques.
      </div>`}

      <div style="font-size:11px;color:var(--mt);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-bottom:8px">
        Selecciona la factura de referencia
      </div>

      <div style="max-height:360px;overflow-y:auto;border:1px solid var(--bd);border-radius:6px">
        ${facturas.map(f=>{
          const fInfo=t==='proveedor'?dteC(f.tipoDTE):dteV(f.tipoDTE);
          const fNm=fInfo?.nm||`DTE ${f.tipoDTE}`;
          return `<div style="padding:10px 14px;border-bottom:1px solid var(--bd);cursor:pointer;display:flex;justify-content:space-between;align-items:center" onclick="confirmarAsociar('${nota.id}','${f.numero}')" onmouseover="this.style.background='rgba(88,166,255,.06)'" onmouseout="this.style.background=''">
            <div>
              <div style="font-weight:600;font-size:12px">${fNm} N°${f.numero}</div>
              <div style="font-size:10px;color:var(--mt);font-family:var(--mono);margin-top:2px">${f.fecha}${f.fechaVencimiento?' · Vence '+f.fechaVencimiento:''}</div>
            </div>
            <div style="font-family:var(--mono);font-weight:700;font-size:12px">${fmtC(f.total)}</div>
          </div>`;
        }).join('')}
      </div>

      <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
        <button class="btn btn-g" onclick="cerrarAsociarNota()">Cancelar</button>
      </div>
    </div>`;
  modal.classList.add('open');
}

function cerrarAsociarNota(){
  const m=document.getElementById('asoc-nota-modal');
  if(m)m.classList.remove('open');
}

async function confirmarAsociar(notaId,folioFactura){
  const tipo=ASOC.tipo||PAG.tipo;
  const arr=tipo==='proveedor'?S.compras:S.ventas;
  const nota=arr.find(d=>d.id===notaId);
  if(!nota)return;
  const previo=nota.folioRef;
  nota.folioRef=String(folioFactura);
  const clave=tipo==='proveedor'?'compras':'ventas';
  try{
    const r=await window.storage.set(clave+'-'+S.empresa.anio,JSON.stringify(arr));
    if(r&&r.ok===false)throw new Error(r.motivo||'fallo-persistencia');
  }catch(e){nota.folioRef=previo;toast('❌ No se pudo guardar la asociación. No se realizaron cambios.','e');return;}
  logAccion('Asoció NC/ND a factura',`${nota.razonSocial} · Doc N°${nota.numero} → Fact N°${folioFactura}`);
  toast(`✅ Nota asociada a factura N°${folioFactura}`);
  cerrarAsociarNota();
  // Quitar de selección si estaba
  PAG.seleccionados.delete(notaId);
  // Volver a dibujar la pantalla desde la que se abrió el modal
  if(ASOC.volverA==='auxiliares'&&window.renderAuxiliares)window.renderAuxiliares();
  else renderPagos();
}

async function quitarReferencia(notaId,tipo){
  const t=tipo||PAG.tipo;
  const arr=t==='proveedor'?S.compras:S.ventas;
  const nota=arr.find(d=>d.id===notaId);
  if(!nota)return;
  const conf=confirm('¿Quitar la referencia de esta nota? Volverá a aparecer como documento independiente.');
  if(!conf)return;
  const previo=nota.folioRef;
  delete nota.folioRef;
  const clave=t==='proveedor'?'compras':'ventas';
  try{
    const r=await window.storage.set(clave+'-'+S.empresa.anio,JSON.stringify(arr));
    if(r&&r.ok===false)throw new Error(r.motivo||'fallo-persistencia');
  }catch(e){nota.folioRef=previo;toast('❌ No se pudo quitar la referencia. No se realizaron cambios.','e');return;}
  logAccion('Quitó referencia de NC/ND',`${nota.razonSocial} · Doc N°${nota.numero}`);
  toast('Referencia removida');
  if(window.getCurSec&&window.getCurSec()==='auxiliares'&&window.renderAuxiliares)window.renderAuxiliares();
  else renderPagos();
}

// ═══ HISTORIAL DE PAGOS Y COBROS (V2.22.11) ═══
// Lista los comprobantes de pago/cobro (asientos tipo 'pago') del ejercicio.
// Cada fila abre el editor del comprobante, que muestra el asiento contable y
// permite corregir fecha, banco, glosa, documentos y montos.
function verHistorialPagos(){PAG.vista='historial';renderPagos();}
function claseHistorial(a){
  if(a.subtipo==='abono-tarjetas')return {k:'tarjetas',lbl:'Abono tarjetas',ic:'💳',c:'#3fb950'};
  if(a.subtipo==='honorario'||a.fuente==='honorarios')return {k:'honorario',lbl:'Pago honorarios',ic:'📝',c:'#c377dc'};
  const t=(a.documentos&&a.documentos[0]&&a.documentos[0].tipo)||((a.movs||[]).some(m=>m.cd==='1104001')?'cliente':'proveedor');
  return t==='cliente'?{k:'cliente',lbl:'Cobro cliente',ic:'📇',c:'#58a6ff'}:{k:'proveedor',lbl:'Pago proveedor',ic:'🏭',c:'#f0883e'};
}
function filasHistorial(){
  const docsPorId={};
  [...(S.ventas||[]),...(S.compras||[]),...(S.honorarios||[])].forEach(d=>{if(d&&d.id)docsPorId[d.id]=d;});
  return (S.asientos||[]).filter(a=>a&&(a.tipo==='pago'||a.subtipo==='abono-tarjetas')).map(a=>{
    const cl=claseHistorial(a);
    const banco=(a.movs||[]).filter(m=>String(m.cd||'').startsWith('1101'));
    const monto=banco.length?banco.reduce((s,m)=>s+(+m.debe||0)+(+m.haber||0),0):(a.movs||[]).reduce((s,m)=>s+(+m.debe||0),0);
    const refs=(a.documentos||[]).map(r=>docsPorId[r.docId]).filter(Boolean);
    const lineasAux=(a.movs||[]).filter(m=>m.docId||m.rutCodigo);
    const nombres=[...new Set([...refs.map(d=>d.razonSocial||d.nombre||''),...lineasAux.map(m=>(docsPorId[m.docId]||{}).razonSocial||'')].filter(Boolean))];
    const folios=[...new Set([...refs.map(d=>d.numero),...lineasAux.map(m=>m.folio)].filter(x=>x!=null&&x!==''))];
    return {a,cl,monto,nombres,folios,nDocs:Math.max(refs.length,lineasAux.length),cuenta:a.cuentaPago||banco[0]?.cd||''};
  }).sort((x,y)=>String(y.a.fecha||'').localeCompare(String(x.a.fecha||''))||(+(y.a.numeroContable||y.a.n||0))-(+(x.a.numeroContable||x.a.n||0)));
}
function renderHistorialPagos(cont){
  const H=PAG.hist;
  cont.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-g" onclick="setPagTipo('proveedor')">🏭 Pagar Proveedores</button>
      <button class="btn btn-g" onclick="setPagTipo('cliente')">📇 Cobrar Clientes</button>
      <button class="btn btn-g" onclick="verTarjetasPagos()">💳 Abono tarjetas</button>
      <button class="btn btn-p" onclick="verHistorialPagos()">📜 Historial</button>
    </div>
    <div class="filter-row">
      <span class="f-lbl">Filtrar:</span>
      <select onchange="setHistPag('tipo',this.value)">
        <option value="">Pagos y cobros</option>
        <option value="proveedor" ${H.tipo==='proveedor'?'selected':''}>🏭 Pagos a proveedores</option>
        <option value="cliente" ${H.tipo==='cliente'?'selected':''}>📇 Cobros a clientes</option>
        <option value="honorario" ${H.tipo==='honorario'?'selected':''}>📝 Pagos de honorarios</option>
        <option value="tarjetas" ${H.tipo==='tarjetas'?'selected':''}>💳 Abonos de tarjetas</option>
      </select>
      <select onchange="setHistPag('mes',this.value)">
        <option value="">Todos los meses</option>
        ${MESES.map((m,i)=>`<option value="${i+1}" ${+H.mes===i+1?'selected':''}>${m}</option>`).join('')}
      </select>
      <input type="search" id="hist-pag-q" placeholder="Buscar por N°, RUT, razón social, folio, glosa o monto…" value="${String(H.texto).replace(/"/g,'&quot;')}"
        oninput="setHistPag('texto',this.value)" style="min-width:240px">
      <button class="btn btn-g" onclick="limpiarHistPag()">Limpiar</button>
      <span class="doc-count" id="hist-pag-count"></span>
    </div>
    <div id="hist-pag-tabla"></div>`;
  renderHistorialTabla();
}
function renderHistorialTabla(){
  const box=document.getElementById('hist-pag-tabla');if(!box)return;
  const H=PAG.hist,q=String(H.texto||'').trim().toLowerCase(),qd=q.replace(/[^0-9]/g,'');
  const filas=filasHistorial().filter(f=>{
    if(H.tipo&&f.cl.k!==H.tipo)return false;
    if(H.mes&&+String(f.a.fecha||'').slice(5,7)!==+H.mes)return false;
    if(!q)return true;
    const hay=[f.a.glosa,...f.nombres,...f.folios,...(f.a.movs||[]).map(m=>m.rutCodigo)].join(' ').toLowerCase();
    if(hay.includes(q))return true;
    return !!qd&&(String(f.a.numeroContable||f.a.n||'')===qd||String(Math.round(f.monto)).startsWith(qd));
  });
  const cnt=document.getElementById('hist-pag-count');
  if(cnt)cnt.textContent=`${filas.length} comprobante${filas.length===1?'':'s'} · ${fmtC(filas.filter(f=>!f.a.anulado).reduce((s,f)=>s+f.monto,0))}`;
  if(!filas.length){box.innerHTML=`<div class="empty"><div class="ei">📜</div>No hay pagos ni cobros que coincidan.</div>`;return;}
  box.innerHTML=`<div class="card-np"><div class="tw"><table style="font-size:12px">
    <thead><tr><th class="tl" style="width:60px">N°</th><th class="tl" style="width:90px">FECHA</th><th class="tl" style="width:130px">TIPO</th>
      <th class="tl">PROVEEDOR / CLIENTE</th><th class="tl">DOCUMENTOS</th><th class="tl">CUENTA</th><th style="text-align:right;width:120px">MONTO</th><th style="width:70px"></th></tr></thead>
    <tbody>${filas.map(f=>{
      const an=!!f.a.anulado;
      const nom=f.nombres.length?`${f.nombres[0].replace(/</g,'&lt;')}${f.nombres.length>1?` <span style="color:var(--mt)">+${f.nombres.length-1}</span>`:''}`:`<span style="color:var(--mt)">${(f.a.glosa||'').replace(/</g,'&lt;')}</span>`;
      const docs=f.folios.length?`N° ${f.folios.slice(0,4).join(', ')}${f.folios.length>4?' …':''}`:`${f.nDocs} doc.`;
      return `<tr style="cursor:pointer;${an?'opacity:.5;text-decoration:line-through':''}" onclick="abrirHistorialPago('${f.a.id}')" title="${an?'Comprobante anulado':'Ver y editar el asiento'}">
        <td class="tl" style="font-family:var(--mono);font-weight:600">${f.a.numeroContable||f.a.n||''}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${f.a.fecha||''}</td>
        <td class="tl"><span style="background:${f.cl.c}22;color:${f.cl.c};padding:2px 8px;border-radius:100px;font-size:10px;font-weight:600;white-space:nowrap">${f.cl.ic} ${f.cl.lbl}</span></td>
        <td class="tl">${nom}</td>
        <td class="tl" style="font-family:var(--mono);font-size:11px">${docs}</td>
        <td class="tl" style="font-size:11px">${f.cuenta?`${f.cuenta} · ${pdcNm(f.cuenta)}`:''}</td>
        <td style="text-align:right;font-family:var(--mono);font-weight:600">${fmtC(f.monto)}</td>
        <td style="text-align:right">${an?'<span class="badge br">ANULADO</span>':'<button class="btn btn-i" style="font-size:10px;padding:3px 7px" onclick="event.stopPropagation();abrirHistorialPago(\''+f.a.id+'\')">✏️ Editar</button>'}</td>
      </tr>`;}).join('')}</tbody></table></div></div>`;
}
let _histTimer=0;
function setHistPag(campo,valor){
  PAG.hist[campo]=String(valor??'');
  clearTimeout(_histTimer);
  // Sólo se redibuja la tabla: el buscador no pierde el foco al escribir
  if(campo==='texto'){_histTimer=setTimeout(renderHistorialTabla,150);return;}
  renderHistorialTabla();
}
function limpiarHistPag(){PAG.hist={tipo:'',mes:'',texto:''};renderPagos();}
function abrirHistorialPago(id){
  const a=(S.asientos||[]).find(x=>x.id===id);if(!a)return;
  if(a.anulado){toast('ℹ️ Este comprobante está anulado','e');return;}
  if(claseHistorial(a).k==='tarjetas'){
    // Asiento manual: se edita en el formulario de Comprobantes
    nav('comprobantes');setTimeout(()=>editarAsiento(a.id),80);return;
  }
  if(claseHistorial(a).k==='honorario'){
    toast('📝 Los pagos de honorarios se corrigen desde la boleta, en el módulo Honorarios');
    nav('honorarios');return;
  }
  abrirEditorPago(id);
}

// ═══ ABONO DE TARJETAS (V2.22.12) ═══
// Traspasa a banco las ventas con tarjeta que quedaron en 1107004 TARJETAS POR
// COBRAR. El operador (Transbank, Getnet, etc.) deposita la venta menos su
// comisión. La comisión se puede rebajar:
//   · contra el proveedor (su factura de comisión se registra en Compras y el
//     abono la deja saldada), o
//   · directo a una cuenta de gasto (sin factura).
// Asiento: Debe Banco (depositado) + Debe Proveedor/Gasto (comisión)
//          / Haber 1107004 (depositado + comisión).
const CTA_TARJETAS='1107004';
function verTarjetasPagos(){
  PAG.vista='tarjetas';
  const T=PAG.tj;
  if(!T.banco)T.banco=PAG.cuentaPago||(PDC.find(c=>c.cd==='1101201')?'1101201':'');
  if(!T.cuentaGasto)T.cuentaGasto=PDC.find(c=>c.cd==='3201005')?'3201005':'';
  renderPagos();
}
function saldoTarjetas(){
  return Math.round(genDiario().reduce((s,e)=>s+(e.movs||[]).reduce((x,m)=>x+(m.cd===CTA_TARJETAS?(+m.debe||0)-(+m.haber||0):0),0),0));
}
function proveedoresConocidos(){
  const m={};
  (S.compras||[]).forEach(d=>{if(d&&d.rutCodigo&&d.estado!=='anulado')m[d.rutCodigo]={rutCodigo:d.rutCodigo,rutDV:d.rutDV,razon:d.razonSocial||''};});
  return Object.values(m).sort((a,b)=>a.razon.localeCompare(b.razon));
}
function renderTarjetasPagos(cont){
  const T=PAG.tj,saldo=saldoTarjetas();
  const gastos=PDC.filter(c=>c.tp==='C'&&c.cd&&String(c.cd).length>=7&&c.activa!==false);
  const esc=t=>String(t??'').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  cont.innerHTML=`
    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <button class="btn btn-g" onclick="setPagTipo('proveedor')">🏭 Pagar Proveedores</button>
      <button class="btn btn-g" onclick="setPagTipo('cliente')">📇 Cobrar Clientes</button>
      <button class="btn btn-p" onclick="verTarjetasPagos()">💳 Abono tarjetas</button>
      <button class="btn btn-g" onclick="verHistorialPagos()">📜 Historial</button>
    </div>
    <div class="info-tip" style="margin-bottom:12px">💳 Traspasa al banco lo que el operador de tarjetas (Transbank, Getnet, etc.) depositó por las ventas con tarjeta. Saldo actual de <b>${CTA_TARJETAS} ${pdcNm(CTA_TARJETAS)}</b>: <b style="font-family:var(--mono)">${fmtC(saldo)}</b>.</div>
    <div class="card" style="margin-bottom:14px">
      <div class="card-title">💳 Datos del abono</div>
      <div class="fg">
        <div class="grp"><label>Fecha del abono</label><input type="date" value="${T.fecha}" oninput="setTjCampo('fecha',this.value)"></div>
        <div class="grp"><label>Banco donde se depositó</label><select onchange="setTjCampo('banco',this.value)">${PDC.filter(c=>c.cd&&String(c.cd).startsWith('1101')&&c.tp==='A').map(c=>`<option value="${c.cd}" ${T.banco===c.cd?'selected':''}>${c.cd} — ${c.nm}</option>`).join('')}</select></div>
        <div class="grp"><label>Monto depositado en el banco</label><input type="text" inputmode="numeric" value="${T.depositado?fmtC(T.depositado).replace('$',''):''}" placeholder="0" oninput="setTjCampo('depositado',this.value)"></div>
        <div class="grp"><label>Comisión cobrada (con IVA, 0 si no hay)</label><input type="text" inputmode="numeric" value="${T.comision?fmtC(T.comision).replace('$',''):''}" placeholder="0" oninput="setTjCampo('comision',this.value)"></div>
        <div class="grp full"><label>¿Cómo se registra la comisión?</label>
          <select onchange="setTjCampo('trato',this.value)">
            <option value="proveedor" ${T.trato==='proveedor'?'selected':''}>Contra el proveedor del servicio (su factura de comisión se registra en Compras)</option>
            <option value="gasto" ${T.trato==='gasto'?'selected':''}>Directo a una cuenta de gasto (sin factura)</option>
          </select></div>
        <div class="grp" id="tj-prov" style="${T.trato==='proveedor'?'':'display:none'}"><label>Proveedor (operador) RUT</label>
          <input type="text" list="tj-provs" value="${esc(T.rut)}" placeholder="Ej: 96689310-9" oninput="setTjCampo('rut',this.value)">
          <datalist id="tj-provs">${proveedoresConocidos().map(p=>`<option value="${p.rutCodigo}-${p.rutDV}">${esc(p.razon)}</option>`).join('')}</datalist></div>
        <div class="grp" id="tj-prov2" style="${T.trato==='proveedor'?'':'display:none'}"><label>Razón social</label><input type="text" id="tj-razon" value="${esc(T.razon)}" placeholder="Ej: Transbank S.A." oninput="setTjCampo('razon',this.value)"></div>
        <div class="grp full" id="tj-gasto" style="${T.trato==='gasto'?'':'display:none'}"><label>Cuenta de gasto</label>
          <select onchange="setTjCampo('cuentaGasto',this.value)"><option value="">— seleccionar cuenta —</option>${gastos.map(c=>`<option value="${c.cd}" ${T.cuentaGasto===c.cd?'selected':''}>${c.cd} — ${esc(c.nm)}</option>`).join('')}</select></div>
        <div class="grp full"><label>Glosa (opcional)</label><input type="text" value="${esc(T.glosa)}" placeholder="Ej: Abono Transbank semana 42" oninput="setTjCampo('glosa',this.value)"></div>
      </div>
      <div style="margin-top:12px"><div style="font-size:12px;font-weight:600;margin-bottom:6px">Asiento contable</div><div id="tj-asiento"></div></div>
      <div style="display:flex;justify-content:flex-end;margin-top:12px"><button class="btn btn-p" id="tj-btn" onclick="generarAbonoTarjetas()">💾 Generar asiento</button></div>
    </div>`;
  renderTjAsiento();
}
function movsAbonoTarjetas(){
  const T=PAG.tj,dep=Math.round(+T.depositado||0),com=Math.round(+T.comision||0),bruto=dep+com;
  const r=rutParse(T.rut||'');
  const movs=[];
  if(dep>0)movs.push({cd:T.banco,nm:pdcNm(T.banco),desc:'Abono ventas con tarjeta',debe:dep,haber:0});
  if(com>0){
    if(T.trato==='gasto')movs.push({cd:T.cuentaGasto,nm:pdcNm(T.cuentaGasto),desc:'Comisión ventas con tarjeta',debe:com,haber:0});
    else movs.push({cd:'2102001',nm:pdcNm('2102001'),desc:`Comisión ${T.razon||'operador de tarjetas'}`.trim(),debe:com,haber:0,rutCodigo:r.codigo||'',rutDV:r.dv||''});
  }
  if(bruto>0)movs.push({cd:CTA_TARJETAS,nm:pdcNm(CTA_TARJETAS),desc:'Ventas con tarjeta abonadas',debe:0,haber:bruto});
  return {movs,dep,com,bruto,rut:r};
}
function renderTjAsiento(){
  const box=document.getElementById('tj-asiento');if(!box)return;
  const {movs,bruto}=movsAbonoTarjetas();
  if(!movs.length){box.innerHTML='<div style="color:var(--mt);font-size:11px">Ingresa el monto depositado.</div>';return;}
  const saldo=saldoTarjetas();
  const esc=t=>String(t||'').replace(/</g,'&lt;');
  const tD=movs.reduce((s,m)=>s+m.debe,0),tH=movs.reduce((s,m)=>s+m.haber,0);
  box.innerHTML=`<div class="tw"><table style="font-size:11px;width:100%">
    <thead><tr><th class="tl">CUENTA</th><th class="tl">DETALLE</th><th style="text-align:right;width:110px">DEBE</th><th style="text-align:right;width:110px">HABER</th></tr></thead>
    <tbody>${movs.map(m=>`<tr><td class="tl"><span style="font-family:var(--mono);color:var(--mt)">${esc(m.cd||'(elige la cuenta)')}</span> ${esc(m.cd?pdcNm(m.cd):'')}</td>
      <td class="tl" style="color:var(--mt)">${esc(m.desc)}${m.rutCodigo?` · ${rutFmt(m.rutCodigo,m.rutDV)}`:''}</td>
      <td style="text-align:right;font-family:var(--mono)">${m.debe?fmtC(m.debe):'–'}</td><td style="text-align:right;font-family:var(--mono)">${m.haber?fmtC(m.haber):'–'}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td class="tl" colspan="2" style="font-weight:700">Totales</td><td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(tD)}</td><td style="text-align:right;font-family:var(--mono);font-weight:700">${fmtC(tH)}</td></tr></tfoot>
  </table></div>${bruto>saldo+1?`<div style="font-size:11px;color:var(--warn);margin-top:6px">⚠️ El abono (${fmtC(bruto)}) supera el saldo de ventas con tarjeta por cobrar (${fmtC(saldo)}).</div>`:''}`;
}
function setTjCampo(campo,valor){
  const T=PAG.tj;
  if(campo==='depositado'||campo==='comision')T[campo]=Math.max(0,Math.round(pn(String(valor).replace(/\./g,''))));
  else T[campo]=String(valor??'');
  if(campo==='rut'){
    const r=rutParse(T.rut);const p=r.codigo&&proveedoresConocidos().find(x=>x.rutCodigo===r.codigo);
    const inp=document.getElementById('tj-razon');if(p&&inp&&!inp.value.trim()){inp.value=p.razon;T.razon=p.razon;}
  }
  if(campo==='trato'){
    ['tj-prov','tj-prov2'].forEach(id=>{const e=document.getElementById(id);if(e)e.style.display=T.trato==='proveedor'?'':'none';});
    const g=document.getElementById('tj-gasto');if(g)g.style.display=T.trato==='gasto'?'':'none';
  }
  renderTjAsiento();
}
async function generarAbonoTarjetas(){
  const T=PAG.tj;
  if(!T.fecha){toast('⚠️ Ingresa la fecha del abono','e');return;}
  if(!puedeOperarFecha(T.fecha)){toast('🔒 El período de esa fecha está cerrado.','e');return;}
  if(!T.banco){toast('⚠️ Elige el banco','e');return;}
  const {movs,dep,com,bruto,rut}=movsAbonoTarjetas();
  if(!(dep>0)){toast('⚠️ Ingresa el monto depositado','e');return;}
  if(com>0&&T.trato==='proveedor'&&!(rut.codigo&&rut.valido)){toast('⚠️ Ingresa un RUT válido del proveedor del servicio','e');return;}
  if(com>0&&T.trato==='gasto'&&!T.cuentaGasto){toast('⚠️ Elige la cuenta de gasto de la comisión','e');return;}
  if(!PDC.some(c=>c.cd===CTA_TARJETAS)){toast(`⚠️ Falta la cuenta ${CTA_TARJETAS} en el plan de cuentas`,'e');return;}
  const saldo=saldoTarjetas();
  if(bruto>saldo+1&&!confirm(`El abono (${fmtC(bruto)}) supera el saldo de ventas con tarjeta por cobrar (${fmtC(saldo)}).\n¿Registrarlo igual?`))return;
  const vp=validarMovimientosPDC(movs);
  if(!vp.ok){toast('❌ '+vp.errores[0],'e');return;}
  const id='a_tj_'+Date.now();
  const glosa=T.glosa.trim()||`Abono ventas con tarjeta${com>0?` (comisión ${fmtC(com)})`:''}`;
  if(!S.asientos)S.asientos=[];
  const r=await persistirAsientosCritico(()=>{S.asientos.push({id,fecha:T.fecha,glosa,movs,tipo:'manual',subtipo:'abono-tarjetas',creadoEn:new Date().toISOString()});});
  if(!r.ok){toast('❌ No se pudo guardar el asiento. No se contabilizó. ('+(r.motivo||'error')+')','e');return;}
  const a=S.asientos.find(x=>x.id===id),n=a?.numeroContable||a?.n||'?';
  logAccion('Registró abono de tarjetas',`${fmtC(bruto)} · depositado ${fmtC(dep)} · comisión ${fmtC(com)} · Asiento N°${n}`);
  logCambio('Registró abono de tarjetas',{entidad:'asiento',id,antes:null,despues:a,meta:{numeroContable:a?.numeroContable,total:bruto}});
  toast(`✅ Abono de tarjetas registrado · Asiento N°${n}`);
  PAG.tj={...T,depositado:0,comision:0,glosa:''};
  rerender();
}

export {verHistorialPagos, setHistPag, limpiarHistPag, abrirHistorialPago, verTarjetasPagos, setTjCampo, generarAbonoTarjetas};
export {PAG, renderPagos, setPagTipo, setPagCampo, setPagFiltro, limpiarPagFiltro,
        togglePagSel, togglePagAll, setPagMontoParcial, ejecutarPago,
        abrirAsociarNota, cerrarAsociarNota, confirmarAsociar, quitarReferencia};
