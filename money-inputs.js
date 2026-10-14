// money-inputs.js — Formato chileno uniforme para casillas de montos enteros.
//
// Los inputs monetarios usan texto + inputmode numeric porque type="number" no
// admite separadores de miles. El valor visible siempre queda como 1.234.567;
// los módulos convierten ese texto con pn() antes de calcular o guardar.

const selector='input.money-input';
const nf=new Intl.NumberFormat('es-CL',{maximumFractionDigits:0});

function enteroDesdeInput(v){
  if(typeof v==='number')return Number.isFinite(v)?Math.round(v):0;
  const s=String(v??'').trim();
  if(!s)return 0;
  const negativo=/^-/.test(s);
  const limpio=s.replace(/[^\d.,]/g,'');
  if(!limpio)return 0;
  // Dentro de estas casillas el punto siempre es visual (miles), incluso
  // mientras el usuario borra y queda temporalmente "3.16". La coma, si se
  // pega desde otra fuente, se acepta como parte decimal y se redondea.
  const sinMiles=limpio.replace(/\./g,'');
  const partes=sinMiles.split(',');
  const canonico=partes.length>1?partes.shift()+'.'+partes.join(''):sinMiles;
  const n=Math.round(Number(canonico));
  return Number.isFinite(n)?(negativo?-n:n):0;
}

function formatoMontoEntero(v){
  const n=enteroDesdeInput(v);
  return nf.format(n);
}

function posicionTrasFormato(formateado,digitosAntes){
  if(digitosAntes<=0)return 0;
  let vistos=0;
  for(let i=0;i<formateado.length;i++){
    if(/\d/.test(formateado[i]))vistos++;
    if(vistos>=digitosAntes)return i+1;
  }
  return formateado.length;
}

function normalizarInputMonto(inp,{cursor=false}={}){
  if(!inp||!inp.matches?.(selector))return;
  if(inp.type==='number')inp.type='text';
  inp.inputMode='numeric';
  inp.autocomplete='off';
  const anterior=String(inp.value??'');
  if(!anterior.trim()){inp.value='';return;}
  const pos=cursor?inp.selectionStart:null;
  const digitosAntes=pos==null?0:anterior.slice(0,pos).replace(/\D/g,'').length;
  const nuevo=formatoMontoEntero(anterior);
  if(inp.value!==nuevo)inp.value=nuevo;
  if(cursor&&document.activeElement===inp){
    const p=posicionTrasFormato(nuevo,digitosAntes);
    try{inp.setSelectionRange(p,p);}catch(_){}
  }
}

function normalizarMontos(root=document){
  if(root?.matches?.(selector))normalizarInputMonto(root);
  root?.querySelectorAll?.(selector).forEach(inp=>normalizarInputMonto(inp));
}

let iniciado=false;
function initMoneyInputs(){
  if(iniciado||typeof document==='undefined')return;
  iniciado=true;
  // Captura antes de los oninput inline: así éstos reciben el texto ya
  // normalizado y pn() obtiene siempre el entero correcto.
  document.addEventListener('input',e=>{
    const inp=e.target;
    if(!inp?.matches?.(selector))return;
    normalizarInputMonto(inp,{cursor:true});
    queueMicrotask(()=>normalizarMontos(inp.closest('.modal,.section,form')||document));
  },true);
  document.addEventListener('change',e=>{
    queueMicrotask(()=>normalizarMontos(e.target?.closest?.('.modal,.section,form')||document));
  },true);
  document.addEventListener('click',()=>queueMicrotask(()=>normalizarMontos(document)),true);
  const obs=new MutationObserver(cambios=>cambios.forEach(c=>{
    if(c.type==='childList')c.addedNodes.forEach(n=>{if(n.nodeType===1)normalizarMontos(n);});
    else if(c.target?.nodeType===1)normalizarMontos(c.target);
  }));
  obs.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['class','style']});
  normalizarMontos(document);
}

export {enteroDesdeInput,formatoMontoEntero,normalizarInputMonto,normalizarMontos,initMoneyInputs};
