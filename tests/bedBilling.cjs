const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const source=ts.createSourceFile('profile',fs.readFileSync('features/patients/PatientProfile.tsx','utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let expression;function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)==='handleAutomaticBedBilling')expression=node.initializer.arguments[0];ts.forEachChild(node,visit);}visit(source);
let store,queue,sequence,fail,reads;
const ref=(path,id)=>({id,key:`${path}/${id}`,collection:name=>({doc:child=>ref(`${path}/${id}/${name}`,child)})});
const db={collection:path=>({doc:id=>ref(path,id||`auto-${++sequence}`)}),runTransaction:callback=>{const operation=queue.then(async()=>{const writes=[];let started=false;const value=await callback({get:async reference=>{assert.equal(started,false);reads++;const data=store.get(reference.key);return{data:()=>data,exists:!!data}},set:(ref,data)=>{started=true;writes.push([ref,data,false])},update:(ref,data)=>{started=true;writes.push([ref,data,true])}});if(fail)throw Error('write failure');for(const[ref,data,merge]of writes){const current=merge?{...store.get(ref.key)}:{};for(const[key,value]of Object.entries(data))current[key]=value?.increment!==undefined?(current[key]||0)+value.increment:value;store.set(ref.key,current)}return value});queue=operation.catch(()=>{});return operation}};
const patient={id:'p',name:'Test',surname:'Patient',hospitalNumber:'MH0002',currentWardId:'w',status:'Admitted'};
const date=new Date(Date.now()-2*86400000-1000);const history=[{id:'a',admissionDate:date,lastBilledDate:date}];
const reset=()=>{store=new Map([['patients/p',{...patient}],['patients/p/admissionHistory/a',{...history[0]}],['wards/w',{name:'Ward',pricePerDay:40}]]);queue=Promise.resolve();sequence=0;reads=0;fail=false};
function load(){const exports={};vm.runInNewContext(ts.transpileModule(`exports.fn=${expression.getText(source)}`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,{exports,db,Date,isBillingCheckRunningRef:{current:false},recordDate:value=>value instanceof Date?value:null,addNotification:()=>{},firebase:{firestore:{FieldValue:{increment:value=>({increment:value})},Timestamp:{fromDate:date=>date}}}});return exports.fn;}
(async()=>{
 reset();const outcomes=await Promise.all([load()(patient,history),load()(patient,history)]);assert.equal(outcomes.filter(Boolean).length,1);assert.equal([...store.keys()].filter(key=>key.startsWith('bills/')).length,1);assert.equal(store.get('patients/p')['financials.totalBill'],80);assert.equal(store.get('patients/p')['financials.balance'],80);
 const bill=[...store].find(([key])=>key.startsWith('bills/'))[1];assert.equal(bill.pharmacyTotal,0);assert.equal(bill.dispensingStatus,'Complete');
 reset();const recent=[{id:'a',admissionDate:new Date(),lastBilledDate:new Date()}];assert.equal(await load()(patient,recent),false);assert.equal(reads,0);
 reset();store.get('patients/p/admissionHistory/a').dischargeDate=new Date();assert.equal(await load()(patient,history),false);assert.equal(store.size,3);
 reset();fail=true;assert.equal(await load()(patient,history),false);assert.equal(store.size,3);assert.equal(store.get('patients/p')['financials.balance'],undefined);
 console.log('Bed billing checks passed: concurrent visits bill once, recent admissions use no extra reads, discharged admissions are excluded, and failed writes roll back.');
})().catch(error=>{console.error(error);process.exit(1)});
