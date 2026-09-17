const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
let store, sequence, fail, queries;
const roles = {Doctor:'Doctor',Nurse:'Nurse',Admin:'Admin',Accountant:'Accountant',AccountsAssistant:'Accounts Assistant',AccountsClerk:'Accounts Clerk'};
const reference = (path,id) => ({id,key:`${path}/${id}`,collection:name=>collection(`${path}/${id}/${name}`), update:async()=>{}});
const snapshot = ref => ({id:ref.id,ref,exists:store.has(ref.key),data:()=>store.get(ref.key)});
function collection(path) {
 return {doc:id=>reference(path,id||`new-${++sequence}`),orderBy:()=>({limit:n=>({get:async()=>{assert.equal(n,1);queries.push(path);return{empty:false,docs:[snapshot(reference(path,'a'))]}}})})};
}
const db = {collection, runTransaction:async callback=>{
 const writes=[];let writing=false;
 await callback({get:async ref=>{assert.equal(writing,false,'Reads must precede writes');return snapshot(ref)},set:(ref,data)=>{writing=true;writes.push([ref,data])}});
 if(fail)throw Error('Simulated write failure');
 for(const [ref,data] of writes)store.set(ref.key,data);
}};
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('features/patients/clerkingSheet.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,
 {exports:exportsObject,Date,require:name=>name.endsWith('/firebase')?{db}:name.endsWith('/types')?{Role:roles}:name.endsWith('/readCache')?{invalidateReads:()=>{}}:name==='./recordTimestamp'?{formatRecordTimestamp:()=> 'Recorded discharge time'}:{firestore:{FieldValue:{serverTimestamp:()=> 'server-time'}}}});
const patient={id:'p',name:'Test',surname:'Patient',age:26,gender:'Female',phoneNumber:'123',residentialAddress:'Address',nokPhoneNumber:'456',status:'Discharged',medicalAid:'Aid',medicalAidNumber:'ABC'};
const user={id:'doctor',name:'Test',surname:'Doctor',role:roles.Doctor};
const reset=()=>{store=new Map([['patients/p',{...patient}],['patients/p/doctorNotes/old',{medicalNotes:'Old history'}]]);sequence=0;fail=false;queries=[];};
const form=()=>({...exportsObject.initialClerkingSheet(patient),presentingComplaint:' Complaint ',history:'History',bloodPressure:'120/80',oxygenSaturation:'98',randomBloodSugar:'5.4'});
(async()=>{
 reset();const fields=form();assert.equal(fields.patientName,'Test Patient');assert.equal(fields.nextOfKinPhone,'456');assert.equal(fields.medicalAidNumber,'ABC');
 let result=await exportsObject.saveClerkingSheet('p',fields,user);assert.equal(result.hasVitals,true);
 const notes=[...store].filter(([key])=>key.includes('/doctorNotes/new'));assert.equal(notes.length,1);const note=notes[0][1];
 assert.equal(note.kind,'clerkingSheet');assert.equal(note.clerkingSheet.presentingComplaint,'Complaint');assert.equal(note.authorId,'doctor');assert.equal(note.createdAt,'server-time');
 const vitals=[...store].find(([key])=>key.includes('/vitals/'))[1];assert.equal(vitals.oxygenSaturation,'98');assert.equal(vitals.randomBloodSugar,'5.4');assert.equal(vitals.createdAt,note.createdAt);assert.equal(vitals.clerkingNoteId,notes[0][0].split('/').at(-1));assert.equal(store.get('patients/p/doctorNotes/old').medicalNotes,'Old history');
 await exportsObject.saveClerkingSheet('p',form(),user);assert.equal([...store.keys()].filter(key=>key.includes('/doctorNotes/new')).length,2,'Visits must preserve prior sheets');
 reset();const blank=exportsObject.initialClerkingSheet(patient);blank.presentingComplaint='History only';result=await exportsObject.saveClerkingSheet('p',blank,user);assert.equal(result.hasVitals,false);assert.ok(![...store.keys()].some(key=>key.includes('/vitals/')));
 reset();await exportsObject.saveClerkingSheet('p',form(),{...user,role:roles.Nurse});assert.ok([...store.keys()].some(key=>key.includes('/nurseNotes/new')));
 for (const role of [roles.Admin, roles.Accountant, roles.AccountsAssistant, roles.AccountsClerk]) {
  reset();assert.equal(exportsObject.canAddClerkingSheet(role),true);
  await exportsObject.saveClerkingSheet('p',form(),{...user,role});
  const saved=[...store].find(([key])=>key.includes('/doctorNotes/new'))[1];assert.equal(saved.authorRole,role);assert.equal(saved.kind,'clerkingSheet');
 }
 reset();assert.equal(exportsObject.canAddClerkingSheet('Pharmacist'),false);assert.equal(exportsObject.canAddClerkingSheet(),false);
 await assert.rejects(exportsObject.saveClerkingSheet('p',form(),{...user,role:'Pharmacist'}),/permission/);assert.equal(store.size,2);
 reset();await assert.rejects(exportsObject.saveClerkingSheet('p',{...form(),presentingComplaint:''},user),/presenting complaint/);
 await assert.rejects(exportsObject.saveClerkingSheet('p',{...form(),oxygenSaturation:'101'},user),/oxygen saturation/);
 await assert.rejects(exportsObject.saveClerkingSheet('p',{...form(),presentationAt:'invalid'},user),/date and time/);
 reset();fail=true;await assert.rejects(exportsObject.saveClerkingSheet('p',form(),user));assert.equal(store.size,2,'A failed save must not leave a sheet or vitals');
 reset();store.get('patients/p').status='Admitted';store.set('patients/p/admissionHistory/a',{admissionDate:'prior'});await exportsObject.saveClerkingSheet('p',form(),user);assert.equal([...store].find(([key])=>key.includes('/doctorNotes/new'))[1].admissionId,'a');assert.equal(queries.length,1);
 reset();store.delete('patients/p');await assert.rejects(exportsObject.saveClerkingSheet('p',form(),user),/no longer exists/);
 const html=exportsObject.clerkingSheetPrintHtml({...note,clerkingSheet:{...note.clerkingSheet,history:'<script>bad</script>'}});assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(html.includes('Not recorded'));
 console.log('Clerking sheet checks passed: auto-fill, preserved visit history, roles, validation, atomic vitals, admission linkage, and escaped report output.');
})().catch(error=>{console.error(error);process.exit(1)});
