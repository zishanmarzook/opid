import test from 'node:test';
import assert from 'node:assert/strict';
import {todayISO,addDays,validateState} from '../dist/core.js';

test('app handlers keep add/edit, decisions, undo, settings, and validated import consistent',async()=>{
  // This is a handler smoke test, not browser/layout verification.
  const originals=new Map();
  function replace(name,value){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
  class Element{
    constructor(){this.innerHTML='';this.textContent='';this.value='';this.open=false;this.hidden=false;this.classList={add(){},remove(){},toggle(){}};}
    showModal(){this.open=true;}close(){this.open=false;}addEventListener(){}focus(){}click(){}setSelectionRange(){}setAttribute(){}querySelectorAll(){return [];}getBoundingClientRect(){return{left:0,right:500,top:0,bottom:500};}
  }
  const nodes=new Map(),listeners={},windowListeners={},storage=new Map();let currentForm;
  const element=selector=>{if(selector==='#purchase-form')return currentForm;if(!nodes.has(selector))nodes.set(selector,new Element());return nodes.get(selector);};
  const defaults=()=>({name:'A useful purchase',merchant:'A local shop',amount:'19.99',currency:'USD',purchaseDate:todayISO(),returnDays:'30',returnDeadline:addDays(todayISO(),30),returnMode:'days',warrantyMonths:'12',category:'Electronics',orderRef:'ORDER-100',notes:'Receipt is in my inbox.'});
  function form(values={}){const result=new Element();result.id='purchase-form';result.elements=Object.fromEntries(Object.entries({...defaults(),...values}).map(([name,value])=>[name,{value,disabled:false}]));result.reportValidity=()=>true;return result;}
  currentForm=form();
  replace('document',{querySelector:element,createElement:()=>new Element(),addEventListener:(name,fn)=>listeners[name]=fn});
  replace('window',{addEventListener:(name,fn)=>windowListeners[name]=fn,scrollTo(){}});
  replace('location',{hash:''});
  replace('navigator',{});
  replace('localStorage',{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)});
  replace('FormData',class{constructor(f){this.form=f;}get(key){const el=this.form.elements[key];return el&&!el.disabled?el.value:null;}});
  replace('setInterval',()=>0);replace('setTimeout',()=>0);replace('clearTimeout',()=>{});
  const read=()=>JSON.parse(storage.get('return-ready-v1'));
  const click=(action,other={})=>listeners.click({target:{closest:()=>({dataset:{action,...other}})}});
  const submit=()=>listeners.submit({target:currentForm,preventDefault(){}});
  const route=target=>{location.hash='#'+target;windowListeners.hashchange();};
  try{
    await import('../dist/app.js');
    assert.equal(read().demo,true);assert.equal(read().purchases.length,8);
    assert.match(element('#main').innerHTML,/Nothing slips/);
    for(const target of ['purchases','deadlines','warranties','settings','overview']){route(target);assert.ok(element('#main').innerHTML.length>500);}

    await click('add');assert.match(element('#dialog').innerHTML,/purchase-form/);
    currentForm=form({name:'Travel headphones',notes:'<script>bad()<\/script>'});submit();
    let saved=read();assert.equal(saved.demo,false);assert.equal(saved.purchases.length,1);assert.equal(saved.purchases[0].amount,1999);assert.equal(element('#dialog').open,false);
    const id=saved.purchases[0].id,createdAt=saved.purchases[0].createdAt;

    await click('edit',{id});
    currentForm=form({name:'Travel headphones',amount:'20.10',returnDays:'731',returnMode:'exact',returnDeadline:addDays(todayISO(),15),notes:'<script>bad()<\/script>'});submit();
    saved=read();assert.equal(saved.purchases.length,1);assert.equal(saved.purchases[0].id,id);assert.equal(saved.purchases[0].createdAt,createdAt);assert.equal(saved.purchases[0].amount,2010);assert.equal(saved.purchases[0].returnDeadline,addDays(todayISO(),15));
    await click('detail',{id});assert.match(element('#dialog').innerHTML,/&lt;script&gt;/);assert.doesNotMatch(element('#dialog').innerHTML,/<script>/);
    await click('change-status',{id,value:'kept'});assert.equal(read().purchases[0].status,'kept');
    await click('change-status',{id,value:'active'});assert.equal(read().purchases[0].status,'active');
    await click('delete-purchase',{id});assert.equal(read().purchases.length,0);
    await click('undo');assert.equal(read().purchases[0].id,id);

    await listeners.change({target:{id:'currency-setting',value:'GBP'}});
    assert.equal(read().settings.currency,'GBP');assert.equal(read().purchases[0].currency,'USD');assert.equal(read().purchases[0].amount,2010);
    await listeners.change({target:{id:'lead-setting',value:'3'}});assert.equal(read().settings.leadDays,3);
    await click('return-mode',{value:'exact'});assert.equal(currentForm.elements.returnDays.disabled,true);assert.equal(currentForm.elements.returnDeadline.disabled,false);
    await click('return-mode',{value:'days'});assert.equal(currentForm.elements.returnDays.disabled,false);assert.equal(currentForm.elements.returnDeadline.disabled,true);

    const backup=read();const invalid=structuredClone(backup);invalid.purchases.push({...invalid.purchases[0]});
    await listeners.change({target:{id:'import-file',files:[{size:100,text:async()=>JSON.stringify(invalid)}]}});
    assert.match(element('#dialog').innerHTML,/duplicate purchase IDs/);assert.equal(read().purchases.length,1);
    const valid={...backup,settings:{currency:'EUR',leadDays:7},purchases:[{...backup.purchases[0],name:'Imported lamp',category:'Home'}]};
    await listeners.change({target:{id:'import-file',files:[{size:100,text:async()=>JSON.stringify(valid)}]}});
    assert.match(element('#dialog').innerHTML,/confirm-import/);await click('confirm-import');
    assert.equal(read().settings.currency,'EUR');assert.equal(read().purchases[0].name,'Imported lamp');assert.deepEqual(validateState(read()),read());
    route('warranties');assert.match(element('#main').innerHTML,/Imported lamp/);
  }finally{for(const[name,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
});
