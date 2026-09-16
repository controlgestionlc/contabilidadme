// inventario-importador.js — Validación pura de la plantilla de productos.

const TIPOS=new Set(['MERCADERÍA','MATERIA PRIMA','PRODUCTO TERMINADO','INSUMO','ACTIVO FIJO','SERVICIO']);
const UNIDADES=new Set(['UN','KG','LT','MT','M2','M3','CAJA','SACO','PQT','GL']);
const texto=v=>String(v??'').trim();
const mayus=v=>texto(v).toUpperCase();
const cab=v=>mayus(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^A-Z0-9]+/g,'_').replace(/^_|_$/g,'');
const tipoCanon=v=>({MERCADERIA:'MERCADERÍA'}[cab(v)]||mayus(v));
const unidadCanon=v=>({UND:'UN',UNIDAD:'UN',UNIDADES:'UN',LTS:'LT',LITRO:'LT',LITROS:'LT',MTS:'MT',METRO:'MT',METROS:'MT',PAQUETE:'PQT',PAQUETES:'PQT'}[cab(v)]||mayus(v));
const numero=v=>{
  if(v===''||v==null)return 0;
  const s=String(v).trim().replace(/\s/g,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.');
  return Number(s);
};
function booleano(v,defecto){
  const s=mayus(v);if(!s)return defecto;
  if(['SI','SÍ','S','1','TRUE','VERDADERO','X'].includes(s))return true;
  if(['NO','N','0','FALSE','FALSO'].includes(s))return false;
  return null;
}

function prepararImportacionProductos(filas,{productos=[],grupos=[],actualizar=false,cuentaExiste=()=>true,productosConMovimientos=[]}={}){
  if(!Array.isArray(filas)||!filas.length)throw new Error('El archivo está vacío');
  let hi=-1;
  for(let i=0;i<Math.min(10,filas.length);i++){
    const hs=(filas[i]||[]).map(cab);
    if(hs.includes('CODIGO')&&hs.includes('DESCRIPCION')){hi=i;break;}
  }
  if(hi<0)throw new Error('No se encontraron las columnas CÓDIGO y DESCRIPCIÓN. Usa la plantilla descargada desde el sistema.');
  const hs=(filas[hi]||[]).map(cab),indice=(...nombres)=>{for(const n of nombres){const i=hs.indexOf(n);if(i>=0)return i;}return -1;};
  const c={codigo:indice('CODIGO','CODIGO_INTERNO'),ean:indice('EAN','CODIGO_EAN'),descripcion:indice('DESCRIPCION','PRODUCTO'),tipo:indice('TIPO'),unidad:indice('UNIDAD','UM'),grupo:indice('GRUPO'),subgrupo:indice('SUBGRUPO'),minimo:indice('STOCK_MINIMO','MINIMO'),cinv:indice('CUENTA_INVENTARIO'),ccosto:indice('CUENTA_COSTO_CONSUMO','CUENTA_COSTO','CUENTA_CONSUMO'),iva:indice('AFECTO_IVA','IVA'),lotes:indice('MANEJA_LOTES','LOTES'),inventariable:indice('INVENTARIABLE'),activo:indice('ACTIVO')};
  const valor=(r,k)=>c[k]>=0?texto(r[c[k]]):'';
  const porCodigo=new Map(productos.map(p=>[mayus(p.codigo),p])),porEan=new Map(productos.filter(p=>texto(p.ean)).map(p=>[texto(p.ean),p]));
  const gruposNombre=new Map(grupos.map(g=>[mayus(g.nombre),g])),vistosCodigo=new Set(),vistosEan=new Map(),bloqueados=new Set(productosConMovimientos.map(String));
  const resultado=[];
  for(let i=hi+1;i<filas.length;i++){
    const r=filas[i]||[],codigo=mayus(valor(r,'codigo')),descripcion=mayus(valor(r,'descripcion'));
    if(!codigo&&!descripcion&&r.every(x=>!texto(x)))continue;
    const errores=[];
    if(!codigo)errores.push('Falta código');
    if(!descripcion)errores.push('Falta descripción');
    if(codigo&&vistosCodigo.has(codigo))errores.push('Código repetido dentro del archivo');
    if(codigo)vistosCodigo.add(codigo);
    const existente=porCodigo.get(codigo),ean=valor(r,'ean');
    const tipo=tipoCanon(valor(r,'tipo')||existente?.tipo||'MERCADERÍA');
    const unidad=unidadCanon(valor(r,'unidad')||existente?.unidad||'UN');
    if(!TIPOS.has(tipo))errores.push(`Tipo inválido: ${tipo}`);
    if(!UNIDADES.has(unidad))errores.push(`Unidad inválida: ${unidad}`);
    const stockMinimo=numero(valor(r,'minimo'));
    if(!Number.isFinite(stockMinimo)||stockMinimo<0)errores.push('Stock mínimo inválido');
    const aplicaIVA=booleano(valor(r,'iva'),existente?.aplicaIVA!==false);
    const manejaLotes=booleano(valor(r,'lotes'),existente?.manejaLotes||false);
    const inventariable=booleano(valor(r,'inventariable'),existente?.inventariable!==false);
    const activo=booleano(valor(r,'activo'),existente?.activo!==false);
    if([aplicaIVA,manejaLotes,inventariable,activo].includes(null))errores.push('Usa SÍ o NO en las columnas lógicas');
    const grupo=mayus(valor(r,'grupo')),subgrupo=mayus(valor(r,'subgrupo'));
    if(subgrupo&&!grupo)errores.push('Un subgrupo requiere grupo');
    const gExistente=gruposNombre.get(grupo);
    if(gExistente&&subgrupo&&(gExistente.subgrupos||[]).some(s=>mayus(s)===subgrupo)===false){/* se agregará */}
    const cuentaInventario=valor(r,'cinv')||texto(existente?.cuentaInventario)||'1109001';
    const cuentaCosto=valor(r,'ccosto')||texto(existente?.cuentaCosto)||'3101002';
    if(cuentaInventario&&!cuentaExiste(cuentaInventario))errores.push(`Cuenta de inventario inexistente: ${cuentaInventario}`);
    if(cuentaCosto&&!cuentaExiste(cuentaCosto))errores.push(`Cuenta de costo inexistente: ${cuentaCosto}`);
    if(ean){
      const otro=porEan.get(ean);if(otro&&otro.id!==existente?.id)errores.push('EAN asignado a otro producto');
      if(vistosEan.has(ean)&&vistosEan.get(ean)!==codigo)errores.push('EAN repetido dentro del archivo');
      vistosEan.set(ean,codigo);
    }
    if(existente&&bloqueados.has(String(existente.id))&&manejaLotes!==!!existente.manejaLotes)errores.push('No se puede cambiar manejo de lotes porque el producto tiene movimientos');
    const estado=errores.length?'ERROR':existente?(actualizar?'ACTUALIZA':'OMITE'):'NUEVO';
    resultado.push({fila:i+1,estado,errores,codigo,producto:{id:existente?.id||'',codigo,ean,descripcion,tipo,unidad,grupoNombre:grupo,subgrupo,stockMinimo:Number.isFinite(stockMinimo)?stockMinimo:0,cuentaInventario,cuentaCosto,aplicaIVA:!!aplicaIVA,manejaLotes:!!manejaLotes,inventariable:!!inventariable,activo:!!activo}});
  }
  if(!resultado.length)throw new Error('La plantilla no contiene filas de productos');
  return {filas:resultado,resumen:{nuevos:resultado.filter(x=>x.estado==='NUEVO').length,actualiza:resultado.filter(x=>x.estado==='ACTUALIZA').length,omite:resultado.filter(x=>x.estado==='OMITE').length,errores:resultado.filter(x=>x.estado==='ERROR').length}};
}

export {TIPOS,UNIDADES,prepararImportacionProductos};
