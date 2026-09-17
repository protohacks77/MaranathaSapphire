const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function moduleFrom(file, context = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {exports,...context});
 return exports;
}
function callback(name, context) {
 const file='features/patients/PatientProfile.tsx';
 const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 let expression;
 function visit(node){if(ts.isVariableDeclaration(node)&&node.name.getText(source)===name)expression=node.initializer.arguments[0];ts.forEachChild(node,visit);}
 visit(source);assert.ok(expression,name);
 const exports={};vm.runInNewContext(ts.transpileModule(`exports.fn=${expression.getText(source)}`,{compilerOptions:{target:ts.ScriptTarget.ES2020}}).outputText,{exports,...context});return exports.fn;
}
(async()=>{
 let now=1000, reads=0;
 const cache=moduleFrom('services/readCache.ts',{Date:{now:()=>now}});
 const loader=async()=>++reads;
 assert.deepEqual(await Promise.all([cache.cachedRead('a',loader,10),cache.cachedRead('a',loader,10)]),[1,1]);
 assert.equal(reads,1);assert.equal(await cache.cachedRead('a',loader,10),1);
 now+=11;assert.equal(await cache.cachedRead('a',loader,10),2);
 cache.invalidateReads('a');assert.equal(await cache.cachedRead('a',loader),3);
 let resolve;const old=cache.cachedRead('race',()=>new Promise(done=>resolve=done));
 cache.invalidateReads('race');assert.equal(await cache.cachedRead('race',async()=>99),99);resolve(1);await old;
 assert.equal(await cache.cachedRead('race',async()=>100),99);
 cache.invalidateReads();assert.equal(await cache.cachedRead('race',async()=>100),100);
 const sharedExpiry=now+2;await cache.cachedRead('shared-expiry',async()=>({expiresAt:sharedExpiry}),value=>value.expiresAt-now);now+=3;assert.equal(await cache.cachedRead('shared-expiry',async()=>123),123);
 const search=moduleFrom('services/patientSearch.ts',{require:name=>name==='./firebase'?{db:{}}:{cachedRead:cache.cachedRead}});
 const prefixes=search.searchPrefixes('Test','Patient','MH0002');
 for(const value of ['te','test pa','patient te','mh00','patient'])assert.ok(prefixes.includes(value),value);
 assert.equal(new Set(prefixes).size,prefixes.length);assert.ok(!prefixes.includes('t'));
 const queries=[],counts=[],state={};
 function collection(path){
  const operations=[];
  const query={doc:id=>path==='patients'?{collection:name=>collection(`${path}/${id}/${name}`),get:async()=>{queries.push({path,id,doc:true});return{exists:true,id,data:()=>({name:'Test',surname:'Patient',status:'Discharged',registeredBy:'u'})}}}:{get:async()=>{queries.push({path,id,doc:true});return{exists:true,data:()=>({name:'Staff',surname:'User'})}}},
   where:(...args)=>{operations.push(['where',...args]);return query},orderBy:(...args)=>{operations.push(['orderBy',...args]);return query},limit:n=>{operations.push(['limit',n]);return query},startAfter:doc=>{operations.push(['startAfter',doc.id]);return query},get:async()=>{
    queries.push({path,operations});assert.equal(operations.find(op=>op[0]==='limit')[1],25);
    const docs=Array.from({length:operations.some(op=>op[0]==='startAfter')?4:25},(_,i)=>({id:`${path}-${i}`,data:()=>({createdAt:'2026-09-17'})}));return{docs,size:docs.length};}};
  return query;
 }
 const noop=()=>{};
 const context={db:{collection,doc:()=>({update:async()=>{}})},id:'p',currentPatientId:{current:'p'},currentTab:{current:'clinical'},recordPages:{current:{}},PAGE_SIZE:25,Date,
  patientSections:{clinical:['doctorNotes','nurseNotes'],vitals:['vitals']},cachedRead:cache.cachedRead,invalidateReads:cache.invalidateReads,
  handleAutomaticBedBilling:async()=>false,patientRecordCounts:async()=>({clinical:50}),countRecords:async path=>{counts.push(path);return 27},
  setRecordsLoading:noop,setRecordError:noop,setRecordIndexUrl:noop,setHasMoreRecords:noop,setLoading:noop,setPatient:noop,setFormData:noop,setRegistrarName:noop,setRecordCounts:noop,addNotification:noop,navigate:noop,
 };
 for(const setter of ['DoctorNotes','NurseNotes','Vitals','LabResults','RadiologyResults','RehabNotes','Prescriptions','DischargeSummaries','AdmissionHistory','Bills','Payments','DispensedMedication'])context[`set${setter}`]=value=>state[setter]=value;
 const base=callback('fetchPatientData',context);await base();
 assert.deepEqual(queries.map(query=>query.path),['patients','users']);
 queries.length=0;
 const section=callback('loadSection',context);await section('clinical');
 assert.deepEqual(queries.map(query=>query.path),['patients/p/doctorNotes','patients/p/nurseNotes']);
 assert.equal(state.DoctorNotes.length,25);assert.equal(state.NurseNotes.length,25);
 await section('clinical');assert.equal(queries.length,2,'Switching back within TTL must reuse data');
 await section('clinical',true);assert.equal(queries.length,4);assert.equal(state.DoctorNotes.length,29);
 assert.ok(queries.slice(2).every(query=>query.operations.some(op=>op[0]==='startAfter')));
 context.loadSection=section;const refresh=callback('refreshSection',context);await refresh('clinical');
 assert.deepEqual(counts,['patients/p/doctorNotes','patients/p/nurseNotes']);
 console.log('Read optimization checks passed: cache TTL/deduplication/invalidation races, normalized search, lazy patient records, 25-record cursors, and targeted refresh.');
})().catch(error=>{console.error(error);process.exit(1)});
