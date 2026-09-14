import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';

const ctx=vm.createContext({console,Intl,Number,String,Math});
async function modulo(ruta){
  const src=fs.readFileSync(new URL(ruta,import.meta.url),'utf8');
  const m=new vm.SourceTextModule(src,{context:ctx});
  await m.link(()=>{throw new Error('El módulo de formato no debe importar dependencias');});
  await m.evaluate();
  return m.namespace;
}

const money=await modulo('../js/money-inputs.js');
const core=await modulo('../js/core.js');

for(const parsear of [money.enteroDesdeInput,core.pn]){
  assert.equal(parsear('31.681'),31681,'el punto chileno debe ser separador de miles');
  assert.equal(parsear('$ 1.234.567'),1234567,'debe aceptar montos ya formateados');
  assert.equal(parsear('1.234,60'),1235,'debe redondear decimales chilenos al entero');
  assert.equal(parsear('-9.261'),-9261,'debe conservar el signo');
}
assert.equal(money.enteroDesdeInput('3.16'),316,'un borrado parcial no debe convertir miles en decimales');
assert.equal(core.pn('31681.5'),31682,'una fracción decimal importada debe redondearse');
assert.equal(money.formatoMontoEntero(37700),'37.700');
assert.equal(money.formatoMontoEntero(0),'0');
assert.equal(money.formatoMontoEntero('1.234,60'),'1.235');

const index=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const id of ['vf-neto','vf-exento','vf-iva','vf-otros','vf-total','cf-neto','cf-exento','cf-iva','cf-otros','cf-total','rem-utm','remf-base','conc-saldo-banco','afb-valor','dtm-neto','dtm-total']){
  const tag=index.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`))?.[0]||'';
  assert.match(tag,/class=["'][^"']*money-input/,`${id} debe usar formato monetario`);
}
for(const id of ['e-anio','e-tasarenta','cf-iva-pct','rem-uf','remf-gratpct','remf-plan','afb-vida-contable']){
  const tag=index.match(new RegExp(`<input[^>]*id=["']${id}["'][^>]*>`))?.[0]||'';
  assert.doesNotMatch(tag,/money-input/,`${id} no es un monto entero y no debe perder precisión`);
}

const casosDinamicos={
  '../js/comprobantes.js':['cmpdte-neto','cmpdte-total'],
  '../js/comprobantestipo-ui.js':['linea-num-inp money-input'],
  '../js/compras.js':['dist-num-inp money-input'],
  '../js/asientos.js':['dist-num-inp money-input'],
  '../js/pagos.js':['pag-monto-inp money-input'],
  '../js/honorarios.js':['honf-bruto','money-input'],
  '../js/tributario.js':['setPagoF29Monto','money-input'],
  '../js/renta.js':['setRentaLinea','money-input'],
};
for(const [ruta,marcas] of Object.entries(casosDinamicos)){
  const src=fs.readFileSync(new URL(ruta,import.meta.url),'utf8');
  marcas.forEach(m=>assert.ok(src.includes(m),`${ruta} debe contener ${m}`));
}

console.log('OK: montos enteros con miles y campos de precisión protegidos');
