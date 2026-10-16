// docx-simple.js — Genera un .docx mínimo (Word) desde texto con el formato de
// plantillas de la app (V2.21.68). Sin dependencias propias: recibe JSZip.
//
// Formato de entrada (igual que finiquitos y contratos):
//   • 1ª línea en mayúsculas → título centrado y en negrita
//   • párrafos separados por una línea en blanco; saltos de línea simples → <w:br/>
//   • "PRIMERO:" (palabra en mayúsculas + dos puntos) al inicio → negrita
//   • {{marcador}} y [dato faltante] → resaltados en amarillo
// Al volver a leerlo con mammoth (extractRawText) cada párrafo queda separado por
// una línea en blanco, así el texto vuelve con la misma estructura.

const JSZIP_URL='https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
let cargandoZip=null;
function cargarJSZip(){
  if(typeof window!=='undefined'&&window.JSZip)return Promise.resolve(window.JSZip);
  if(cargandoZip)return cargandoZip;
  cargandoZip=new Promise((ok,err)=>{
    const s=document.createElement('script');s.src=JSZIP_URL;
    s.onload=()=>window.JSZip?ok(window.JSZip):err(new Error('La biblioteca para Word no quedó disponible'));
    s.onerror=()=>{cargandoZip=null;err(new Error('No se pudo cargar la biblioteca para Word (revisa la conexión)'));};
    document.head.appendChild(s);
  });
  return cargandoZip;
}

const x=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function run(texto,{b=false,marca=false,sz=22}={}){
  if(texto==='')return '';
  return `<w:r><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/>${b?'<w:b/>':''}${marca?'<w:highlight w:val="yellow"/>':''}<w:sz w:val="${sz}"/></w:rPr><w:t xml:space="preserve">${x(texto)}</w:t></w:r>`;
}
// Una línea: separa marcadores {{x}} y faltantes [x] para resaltarlos
function runsLinea(linea,opts){
  const out=[];let ult=0;const re=/\{\{\s*[a-z_]+\s*\}\}|\[[a-záéíóúñ ]+\]/gi;let m;
  while((m=re.exec(linea))){out.push(run(linea.slice(ult,m.index),opts));out.push(run(m[0],{...opts,marca:true}));ult=m.index+m[0].length;}
  out.push(run(linea.slice(ult),opts));
  return out.join('');
}
function parrafo(texto,{titulo=false}={}){
  const lineas=String(texto).split('\n');
  const pPr=titulo?'<w:pPr><w:jc w:val="center"/><w:spacing w:after="280"/></w:pPr>'
    :'<w:pPr><w:jc w:val="both"/><w:spacing w:after="160" w:line="300" w:lineRule="auto"/></w:pPr>';
  const partes=lineas.map((l,i)=>{
    let r='';
    if(titulo)r=runsLinea(l,{b:true,sz:26});
    else if(i===0){const m=l.match(/^([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ ]{2,40}:)/);r=m?run(m[1],{b:true})+runsLinea(l.slice(m[1].length),{}):runsLinea(l,{});}
    else r=runsLinea(l,{});
    return (i?'<w:r><w:br/></w:r>':'')+r;
  });
  return `<w:p>${pPr}${partes.join('')}</w:p>`;
}
// Firmas: tabla de dos columnas sin bordes con línea superior
function firmas(cols){
  const celda=lineas=>`<w:tc><w:tcPr><w:tcW w:w="4500" w:type="dxa"/></w:tcPr><w:p><w:pPr><w:pBdr><w:top w:val="single" w:sz="6" w:space="4" w:color="000000"/></w:pBdr><w:jc w:val="center"/></w:pPr>${lineas.map((l,i)=>(i?'<w:r><w:br/></w:r>':'')+run(l,{sz:20})).join('')}</w:p></w:tc>`;
  const sep='<w:tc><w:tcPr><w:tcW w:w="600" w:type="dxa"/></w:tcPr><w:p/></w:tc>';
  return `<w:p><w:pPr><w:spacing w:before="1400"/></w:pPr></w:p><w:tbl><w:tblPr><w:tblW w:w="9600" w:type="dxa"/><w:jc w:val="center"/><w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders></w:tblPr><w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="600"/><w:gridCol w:w="4500"/></w:tblGrid><w:tr>${celda(cols[0]||[])}${sep}${celda(cols[1]||[])}</w:tr></w:tbl>`;
}
function documentXml(texto,{firmas:f=null}={}){
  const bloques=String(texto||'').replace(/\r/g,'').split(/\n\s*\n/).map(b=>b.trim()).filter(Boolean);
  const cuerpo=bloques.map((b,i)=>parrafo(b,{titulo:i===0&&b.length<90&&b===b.toUpperCase()&&!b.includes('\n')})).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${cuerpo}${f?firmas(f):''}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1247" w:right="1247" w:bottom="1247" w:left="1247" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`;
}
const CONTENT_TYPES=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
const RELS=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
const core=(titulo,asunto)=>`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${x(titulo)}</dc:title><dc:subject>${x(asunto||'')}</dc:subject><dc:creator>Contabilidad ME</dc:creator></cp:coreProperties>`;

// Devuelve un Blob (navegador) o Buffer (Node) con el .docx
async function crearDocx(JSZip,texto,{titulo='Documento',asunto='',firmas:f=null,tipo='blob'}={}){
  const zip=new JSZip();
  const sinCarpetas={createFolders:false};   // Word espera sólo archivos en el paquete
  zip.file('[Content_Types].xml',CONTENT_TYPES,sinCarpetas);
  zip.file('_rels/.rels',RELS,sinCarpetas);
  zip.file('docProps/core.xml',core(titulo,asunto),sinCarpetas);
  zip.file('word/document.xml',documentXml(texto,{firmas:f}),sinCarpetas);
  return zip.generateAsync({type:tipo,mimeType:'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}
async function descargarDocx(texto,nombre,opts={}){
  const JSZip=await cargarJSZip();
  const blob=await crearDocx(JSZip,texto,{...opts,tipo:'blob'});
  const u=URL.createObjectURL(blob),a=document.createElement('a');
  a.href=u;a.download=nombre;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);
}

export {cargarJSZip, crearDocx, descargarDocx, documentXml};
