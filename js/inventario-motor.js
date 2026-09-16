// inventario-motor.js — Motor puro del auxiliar de inventario.
// La fuente de verdad son los movimientos vigentes. Stock, lotes y PPP se
// reconstruyen siempre desde el libro cronológico; nunca se editan a mano.

const n=v=>Number.isFinite(+v)?+v:0;
const r6=v=>Math.round((n(v)+Number.EPSILON)*1e6)/1e6;
const stockKey=(productoId,bodegaId)=>`${productoId}|${bodegaId}`;
const loteKey=(productoId,bodegaId,lote)=>`${productoId}|${bodegaId}|${String(lote||'').trim().toUpperCase()}`;

function ordenMov(a,b){
  const fa=String(a.fecha||'')+'|'+String(a.creado||'')+'|'+String(a.folio||a.id||'');
  const fb=String(b.fecha||'')+'|'+String(b.creado||'')+'|'+String(b.folio||b.id||'');
  return fa.localeCompare(fb);
}

function recalcularInventario(movimientos=[],productos=[]){
  const porProducto=new Map((productos||[]).map(p=>[String(p.id),p]));
  const stock=new Map(),lotes=new Map(),valorizaciones=new Map(),errores=[];
  const ensureStock=(pid,bid)=>{
    const key=stockKey(pid,bid);
    if(!stock.has(key))stock.set(key,{key,productoId:pid,bodegaId:bid,cantidad:0,costoPromedio:0,valor:0});
    return stock.get(key);
  };
  const ensureLote=(pid,bid,lote,vencimiento='')=>{
    const key=loteKey(pid,bid,lote);
    if(!lotes.has(key))lotes.set(key,{key,productoId:pid,bodegaId:bid,lote:String(lote||'').trim().toUpperCase(),fechaVencimiento:vencimiento||'',cantidad:0,costoPromedio:0,valor:0});
    const l=lotes.get(key);
    if(vencimiento&&!l.fechaVencimiento)l.fechaVencimiento=vencimiento;
    if(vencimiento&&l.fechaVencimiento&&l.fechaVencimiento!==vencimiento){
      errores.push({tipo:'VENCIMIENTO_LOTE',movimientoId:'',productoId:pid,bodegaId:bid,lote:l.lote,mensaje:`El lote ${l.lote} tiene fechas de vencimiento distintas`});
    }
    return l;
  };
  const entrada=(st,cant,costo)=>{
    st.valor=r6(st.valor+cant*costo);st.cantidad=r6(st.cantidad+cant);
    st.costoPromedio=st.cantidad?r6(st.valor/st.cantidad):0;
  };
  const salida=(st,cant,m,ln,contexto='stock')=>{
    const disponible=st.cantidad;
    if(cant>disponible+1e-6)errores.push({tipo:'STOCK_NEGATIVO',movimientoId:m.id,folio:m.folio,productoId:ln.productoId,bodegaId:st.bodegaId,lote:contexto==='lote'?ln.lote||'':'',mensaje:`${m.folio||m.id}: solicitado ${cant}, disponible ${disponible}`});
    const costo=st.costoPromedio;
    st.cantidad=r6(st.cantidad-cant);st.valor=r6(st.valor-cant*costo);
    if(Math.abs(st.cantidad)<1e-6){st.cantidad=0;st.valor=0;st.costoPromedio=0;}
    return costo;
  };

  const vigentes=(movimientos||[]).filter(m=>m&&m.estado!=='ANULADO').slice().sort(ordenMov);
  for(const m of vigentes){
    const vals=[];
    for(const ln of (m.lineas||[])){
      const pid=String(ln.productoId||''),cant=n(ln.cantidad),p=porProducto.get(pid);
      if(!pid||cant<=0)continue;
      if(!p){errores.push({tipo:'PRODUCTO_INEXISTENTE',movimientoId:m.id,productoId:pid,mensaje:`Producto ${pid} no existe`});continue;}
      if(m.tipo==='ENTRADA'||m.tipo==='AJUSTE_ENTRADA'){
        const costo=n(ln.costoUnitario);
        const st=ensureStock(pid,m.bodegaDestinoId);
        entrada(st,cant,costo);
        if(p.manejaLotes){const lt=ensureLote(pid,m.bodegaDestinoId,ln.lote,ln.fechaVencimiento);entrada(lt,cant,costo);}
        vals.push({...ln,costoAplicado:costo,valorAplicado:r6(cant*costo)});
      }else if(m.tipo==='SALIDA'||m.tipo==='AJUSTE_SALIDA'){
        const st=ensureStock(pid,m.bodegaOrigenId),costo=st.costoPromedio;
        if(p.manejaLotes){const lt=ensureLote(pid,m.bodegaOrigenId,ln.lote,ln.fechaVencimiento);salida(lt,cant,m,ln,'lote');}
        salida(st,cant,m,ln);
        vals.push({...ln,costoAplicado:costo,valorAplicado:r6(cant*costo)});
      }else if(m.tipo==='TRASPASO'){
        const origen=ensureStock(pid,m.bodegaOrigenId),costo=origen.costoPromedio;
        if(p.manejaLotes){
          const lo=ensureLote(pid,m.bodegaOrigenId,ln.lote,ln.fechaVencimiento);
          salida(lo,cant,m,ln,'lote');
          entrada(ensureLote(pid,m.bodegaDestinoId,ln.lote,ln.fechaVencimiento),cant,costo);
        }
        salida(origen,cant,m,ln);entrada(ensureStock(pid,m.bodegaDestinoId),cant,costo);
        vals.push({...ln,costoAplicado:costo,valorAplicado:r6(cant*costo)});
      }
    }
    valorizaciones.set(String(m.id),vals);
  }

  return {
    stock:[...stock.values()].sort((a,b)=>(a.productoId+a.bodegaId).localeCompare(b.productoId+b.bodegaId)),
    lotes:[...lotes.values()].sort((a,b)=>(a.productoId+a.bodegaId+a.lote).localeCompare(b.productoId+b.bodegaId+b.lote)),
    valorizaciones,
    errores
  };
}

function validarMovimiento(m,{productos=[],bodegas=[],movimientos=[]}={}){
  const errores=[];
  const ps=new Map(productos.map(p=>[String(p.id),p]));
  const bs=new Set(bodegas.filter(b=>b.activo!==false).map(b=>String(b.id)));
  if(!['ENTRADA','SALIDA','TRASPASO','AJUSTE_ENTRADA','AJUSTE_SALIDA'].includes(m.tipo))errores.push('Tipo de movimiento inválido');
  if(!m.fecha)errores.push('Falta la fecha');
  if(['SALIDA','TRASPASO','AJUSTE_SALIDA'].includes(m.tipo)&&!bs.has(String(m.bodegaOrigenId||'')))errores.push('Seleccione una bodega de origen activa');
  if(['ENTRADA','TRASPASO','AJUSTE_ENTRADA'].includes(m.tipo)&&!bs.has(String(m.bodegaDestinoId||'')))errores.push('Seleccione una bodega de destino activa');
  if(m.tipo==='TRASPASO'&&String(m.bodegaOrigenId)===String(m.bodegaDestinoId))errores.push('La bodega de destino debe ser distinta de la bodega de origen');
  const lineas=(m.lineas||[]).filter(l=>l&&l.productoId&&n(l.cantidad)>0);
  if(!lineas.length)errores.push('Agregue al menos un producto con cantidad');
  for(const l of lineas){
    const p=ps.get(String(l.productoId));
    if(!p){errores.push(`Producto ${l.productoId} no existe`);continue;}
    if(p.activo===false)errores.push(`${p.descripcion}: producto inactivo`);
    if((m.tipo==='ENTRADA'||m.tipo==='AJUSTE_ENTRADA')&&n(l.costoUnitario)<=0)errores.push(`${p.descripcion}: indique un costo unitario mayor que cero`);
    if(p.manejaLotes&&!String(l.lote||'').trim())errores.push(`${p.descripcion}: indique el lote`);
    if(p.manejaLotes&&(m.tipo==='ENTRADA'||m.tipo==='AJUSTE_ENTRADA')&&!l.fechaVencimiento)errores.push(`${p.descripcion}: indique la fecha de vencimiento`);
  }
  if(!errores.length&&['SALIDA','TRASPASO','AJUSTE_SALIDA'].includes(m.tipo)){
    const base=recalcularInventario(movimientos,productos);
    const totalProd=new Map(),totalLote=new Map();
    for(const l of lineas){
      const pid=String(l.productoId),lot=String(l.lote||'').trim().toUpperCase();
      totalProd.set(pid,n(totalProd.get(pid))+n(l.cantidad));
      if(lot)totalLote.set(pid+'|'+lot,n(totalLote.get(pid+'|'+lot))+n(l.cantidad));
    }
    for(const [pid,cant] of totalProd){
      const p=ps.get(pid),bid=String(m.bodegaOrigenId);
      const st=base.stock.find(x=>x.productoId===pid&&x.bodegaId===bid);
      if(cant>n(st?.cantidad)+1e-6)errores.push(`${p.descripcion}: stock insuficiente en la bodega de origen`);
      if(p.manejaLotes){
        for(const [clave,cantLote] of totalLote){
          const [lp,...resto]=clave.split('|');if(lp!==pid)continue;const lot=resto.join('|');
          const lt=base.lotes.find(x=>x.productoId===pid&&x.bodegaId===bid&&x.lote===lot);
          if(cantLote>n(lt?.cantidad)+1e-6)errores.push(`${p.descripcion}: saldo insuficiente en el lote ${lot}`);
        }
      }
    }
  }else if(!errores.length&&(m.tipo==='ENTRADA'||m.tipo==='AJUSTE_ENTRADA')){
    const base=recalcularInventario(movimientos,productos),bid=String(m.bodegaDestinoId);
    for(const l of lineas){
      const p=ps.get(String(l.productoId));if(!p?.manejaLotes)continue;
      const lot=String(l.lote||'').trim().toUpperCase();
      const existente=base.lotes.find(x=>x.productoId===String(l.productoId)&&x.bodegaId===bid&&x.lote===lot&&x.cantidad!==0);
      if(existente?.fechaVencimiento&&l.fechaVencimiento&&existente.fechaVencimiento!==l.fechaVencimiento)errores.push(`${p.descripcion}: el lote ${lot} ya existe con vencimiento ${existente.fechaVencimiento}`);
    }
  }
  return {ok:errores.length===0,errores,lineas};
}

export {recalcularInventario,validarMovimiento,stockKey,loteKey};
