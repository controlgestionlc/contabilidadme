// numletras.js — V2.21.48 · Montos en palabras (pesos chilenos)
// Compartido por la liquidación de sueldo y el finiquito.

const UNI=['','un','dos','tres','cuatro','cinco','seis','siete','ocho','nueve','diez','once','doce','trece','catorce','quince','dieciséis','diecisiete','dieciocho','diecinueve','veinte','veintiún','veintidós','veintitrés','veinticuatro','veinticinco','veintiséis','veintisiete','veintiocho','veintinueve'];
const DEC=['','','','treinta','cuarenta','cincuenta','sesenta','setenta','ochenta','noventa'];
const CEN=['','ciento','doscientos','trescientos','cuatrocientos','quinientos','seiscientos','setecientos','ochocientos','novecientos'];
function cientos(n){ // 0..999
  if(n===0)return '';if(n===100)return 'cien';
  const c=Math.floor(n/100),r=n%100;
  let t=c?CEN[c]:'';
  if(r){
    let s;
    if(r<30)s=UNI[r];else{const d=Math.floor(r/10),u=r%10;s=DEC[d]+(u?' y '+UNI[u]:'');}
    t=(t?t+' ':'')+s;
  }
  return t;
}
function numeroALetras(n){
  n=Math.floor(Math.abs(+n||0));
  if(n===0)return 'cero pesos';
  const partes=[];
  const mm=Math.floor(n/1e12);n%=1e12;
  const millones=Math.floor(n/1e6),miles=Math.floor((n%1e6)/1000),resto=n%1000;
  if(mm)partes.push(mm===1?'un billón':cientosMiles(mm)+' billones');
  if(millones)partes.push(millones===1?'un millón':cientosMiles(millones)+' millones');
  if(miles)partes.push(miles===1?'mil':cientos(miles)+' mil');
  if(resto)partes.push(cientos(resto));
  let s=partes.join(' ');
  // "de pesos" tras millón/millones exactos
  if(!miles&&!resto&&(millones||mm))s+=' de';
  return s+(s==='un'?' peso':' pesos');
}
function cientosMiles(n){ // 1..999999 (para millones)
  const m=Math.floor(n/1000),r=n%1000;
  return [(m?(m===1?'mil':cientos(m)+' mil'):''),cientos(r)].filter(Boolean).join(' ');
}

export {numeroALetras};
