// Additive migration: never changes stock quantities, balances, or clinical text.
// Default is dry-run. --apply writes derived fields; --seed-admin uses the existing seeded admin.
const fs = require('node:fs');
const { createRequire } = require('node:module');
const path = require('node:path');
const taskRequire = createRequire(path.resolve('package.json'));
const ts = taskRequire('typescript');
const vm = require('node:vm');
const firebase = taskRequire('firebase/compat/app');
taskRequire('firebase/compat/auth'); taskRequire('firebase/compat/firestore');
const configSource = fs.readFileSync('services/firebase.ts', 'utf8');
const config = Object.fromEntries(['apiKey','authDomain','projectId','appId'].map(key => [key, configSource.match(new RegExp(key + ': "([^"]+)"'))[1]]));
firebase.initializeApp(config);
const db = firebase.firestore();
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/patientSearch.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
 {exports:exported,require:name => name==='./firebase'?{db}:name==='./readCache'?{cachedRead:(_,load)=>load()}: {}});
const [searchPrefixes,patientSearchFields,userSearchPrefixes] = ['searchPrefixes','patientSearchFields','userSearchPrefixes'].map(name => (...args) => JSON.parse(JSON.stringify(exported[name](...args))));
const apply = process.argv.includes('--apply');
const counts = {};
const { indexSuggestion } = require('./firestoreIndexSuggestion.cjs');
async function scan(collection) {
 let cursor, documents=[];
 while(true){let query=collection.orderBy(firebase.firestore.FieldPath.documentId()).limit(200);if(cursor)query=query.startAfter(cursor);const page=await query.get();documents.push(...page.docs);if(page.size<200)break;cursor=page.docs.at(-1);}
 return documents;
}
async function patch(doc, build, label) {
 const proposed=build(doc.data());
 const different = (data, fields) => Object.fromEntries(Object.entries(fields).filter(([key,value])=>JSON.stringify(data[key])!==JSON.stringify(value)));
 if(!Object.keys(different(doc.data(),proposed)).length)return;
 counts[label]=(counts[label]||0)+1;
 if(apply)await db.runTransaction(async tx=>{const current=await tx.get(doc.ref);if(!current.exists)return;const fields=different(current.data(),build(current.data()));if(Object.keys(fields).length)tx.update(doc.ref,fields);});
}
async function main(){
 let email=process.env.FIREBASE_ADMIN_EMAIL,password=process.env.FIREBASE_ADMIN_PASSWORD;
 if(process.argv.includes('--seed-admin')){const seed=fs.readFileSync('services/seed.ts','utf8');const match=seed.match(/email:\s*'([^']+)'\s*,\s*password:\s*'([^']+)'\s*,\s*role:\s*Role.Admin/);if(!match)throw Error('Seeded admin unavailable');[,email,password]=match;}
 if(!email||!password)throw Error('Provide FIREBASE_ADMIN_EMAIL/FIREBASE_ADMIN_PASSWORD or --seed-admin');
 const credential=await firebase.auth().signInWithEmailAndPassword(email,password);
 if((await db.collection('users').doc(credential.user.uid).get()).data()?.role!=='Admin')throw Error('Admin access required');
 if(process.argv.includes('--verify')) {
  const patient = (await db.collection('patients').limit(1).get()).docs[0]?.id || '__none__';
  const queries = {
   patientSearch: db.collection('patients').where('searchPrefixes','array-contains','test').limit(8),
   pendingQueue: db.collection('bills').where('dispensingStatus','==','Pending').orderBy('date','asc').limit(25),
   queueSearch: db.collection('bills').where('dispensingStatus','==','Pending').where('patientSearchPrefixes','array-contains','test').orderBy('date','asc').limit(25),
   patientBills: db.collection('bills').where('patientId','==',patient).orderBy('date','desc').limit(25),
   patientPayments: db.collection('payments').where('patientId','==',patient).orderBy('date','desc').limit(25),
   patientDispensed: db.collection('dispensingRecords').where('recipientPatientId','==',patient).orderBy('timestamp','desc').limit(25),
   inventorySearch: db.collection('inventory').where('searchPrefixes','array-contains','pi').orderBy('name').limit(25),
   patientListSearch: db.collection('patients').where('searchPrefixes','array-contains','test').orderBy('surname').limit(25),
   staffSearch: db.collection('users').where('searchPrefixes','array-contains','test').orderBy('name').limit(25),
  };
  const start='2026-09-01T00:00:00.000Z',end='2026-10-01T00:00:00.000Z';
  Object.assign(queries, {
   priceSearch:db.collection('priceList').where('searchPrefixes','array-contains','pi').orderBy('name').limit(25),
   notifications:db.collection('notifications').where('recipientId','==',credential.user.uid).orderBy('createdAt','desc').limit(25),
   notificationsUnread:db.collection('notifications').where('recipientId','==',credential.user.uid).where('read','==',false).orderBy('createdAt','desc').limit(25),
   conversations:db.collection('chats').where('participants','array-contains',credential.user.uid).orderBy('updatedAt','desc').limit(25),
   admitted:db.collection('patients').where('status','==','Admitted').orderBy('name').limit(25),
   admittedSearch:db.collection('patients').where('status','==','Admitted').where('searchPrefixes','array-contains','test').orderBy('name').limit(25),
   wardPatients:db.collection('patients').where('currentWardId','==','female-ward').where('status','in',['Admitted','PendingDischarge']).limit(25),
   dischargeHistory:db.collection('patients').where('status','==','Discharged').orderBy('registrationDate','desc').limit(25),
   paidPreview:db.collection('bills').where('date','>=',start).where('date','<=',end).where('status','==','Paid').orderBy('date','desc').limit(4),
  });
  for(const [path,actor,date] of [['bills','processedBy','date'],['payments','processedBy','date'],['patients','registeredBy','registrationDate']])queries[`activity-${path}`]=db.collection(path).where(actor,'==',credential.user.uid).where(date,'>=',start).where(date,'<=',end).orderBy(date,'desc').limit(25);
  for(const prefix of [false,true])for(const status of [false,true])for(const age of [false,true]) {
   let q=db.collection('patients');
   if(prefix)q=q.where('searchPrefixes','array-contains','test');
   if(status)q=q.where('status','==','Discharged');
   if(age)q=q.where('age','>=',0).where('age','<=',999).orderBy('age');
   queries[`patients-prefix${Number(prefix)}-status${Number(status)}-age${Number(age)}`]=q.orderBy('surname').limit(25);
  }
  const result = {}; const suggested = []; const links = [];
  for(const [name,query] of Object.entries(queries)){try{const page=await query.get();result[name]={ok:true,size:page.size};}catch(error){result[name]={ok:false,code:error.code,needsIndex:error.message?.includes('index')}; const index=indexSuggestion(error); if(index)suggested.push(index); const url=error.message?.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/)?.[0]; if(url)links.push({name,url,index});}}
  const {getFirestore,collection,query,where,getAggregateFromServer,sum}=taskRequire('firebase/firestore');
  for(const [name,path,fields] of [['billAggregate','bills',['totalBill','pharmacyQuantity','pharmacyTotal']],['inventoryAggregate','inventory',['totalStockReceived','quantity','stockValue']],['billAggregateByDate','bills',['totalBill','pharmacyQuantity','pharmacyTotal']],['cashPaymentsAggregate','payments',['amount']]]) {
   try {await getAggregateFromServer(query(collection(getFirestore(),path), ...(name==='billAggregateByDate' ? [where('date','>=',start),where('date','<=',end)] : name==='cashPaymentsAggregate' ? [where('paymentMethod','==','CASH'),where('date','>=',start),where('date','<=',end)] : [])), Object.fromEntries(fields.map(field=>[field,sum(field)])));result[name]={ok:true};} catch(error){result[name]={ok:false,code:error.code,needsIndex:error.message?.includes('index')}; const index=indexSuggestion(error); if(index)suggested.push(index); const url=error.message?.match(/https:\/\/console\.firebase\.google\.com\/[^\s]+/)?.[0]; if(url)links.push({name,url,index});}
  }
  if(suggested.length) {
   const file='firestore.indexes.json', configuration=JSON.parse(fs.readFileSync(file,'utf8'));
   for(const index of suggested)if(!configuration.indexes.some(existing=>JSON.stringify(existing)===JSON.stringify(index)))configuration.indexes.push(index);
   fs.writeFileSync(file,JSON.stringify(configuration,null,2)+'\n');
  }
  fs.mkdirSync('docs',{recursive:true});
  fs.writeFileSync('docs/firestore-index-verification.json',JSON.stringify({checkedAt:new Date().toISOString(),queries:result,links},null,2)+'\n');
  console.log(JSON.stringify({checked:Object.keys(result).length,passed:Object.values(result).filter(value=>value.ok).length,missingIndexes:Object.values(result).filter(value=>value.needsIndex).length,indexSuggestions:suggested.length,links:links.length}));return;
 }
 const [patients,users,inventory,prices,bills]=await Promise.all(['patients','users','inventory','priceList','bills'].map(name=>scan(db.collection(name))));
 const stockByName=new Map(inventory.map(doc=>[doc.data().name,doc.id]));
 const departments=new Map(prices.map(doc=>[doc.data().name,doc.data().department]));
 for(const doc of patients)await patch(doc,data=>patientSearchFields(data.name||'',data.surname||'',data.hospitalNumber||''),'patientSearch');
 for(const doc of users)await patch(doc,data=>({searchPrefixes:userSearchPrefixes(data.name||'',data.surname||'',data.email||'',data.role||'',data.department||'')}),'userSearch');
 for(const doc of prices)await patch(doc,data=>({nameLower:(data.name||'').toLowerCase(),searchPrefixes:searchPrefixes(data.name||'',data.department||'','')}),'priceSearch');
 for(const doc of inventory)await patch(doc,data=>({nameLower:(data.name||'').toLowerCase(),searchPrefixes:searchPrefixes(data.name||'',data.category||'',''),isLowStock:Number(data.quantity)<=Number(data.lowStockThreshold||0),stockValue:Number(data.quantity||0)*Number(data.unitPrice||0),...(data.totalStockReceived===undefined?{totalStockReceived:Number(data.quantity||0)}:{})}),'stockMetadata');
 for(const doc of bills)await patch(doc,data=>{
  const items=(data.items||[]).map(item=>({...item,...(!item.department&&departments.has(item.description)?{department:departments.get(item.description)}:{}),...(!item.inventoryItemId&&stockByName.has(item.description)?{inventoryItemId:stockByName.get(item.description)}:{})}));
  const drugs=items.map((item,index)=>({item,index})).filter(({item})=>item.inventoryItemId||item.department==='Pharmacy');
  return{items,patientSearchPrefixes:searchPrefixes(data.patientName||'','',data.patientHospitalNumber||''),pharmacyTotal:drugs.reduce((total,{item})=>total+Number(item.totalPrice||0),0),pharmacyQuantity:drugs.reduce((total,{item})=>total+Number(item.quantity||0),0),dispensingStatus:drugs.some(({item,index})=>Number(item.quantity)>Number(data.dispensedQuantities?.[index]||0))?'Pending':'Complete'};
 },'billMetadata');
 const sections=['doctorNotes','nurseNotes','vitals','labResults','radiologyResults','rehabilitationNotes','prescriptions','dischargeSummaries'];
 for(const patient of patients){
  for(const section of sections){const documents=await scan(patient.ref.collection(section));for(const doc of documents)await patch(doc,data=>data.createdAt===undefined?{createdAt:data.timestamp||data.date||null}:{},'legacyTimestampFields');}
  if(['Admitted','PendingDischarge'].includes(patient.data().status)&&!patient.data().currentAdmissionDate){const latest=await patient.ref.collection('admissionHistory').orderBy('admissionDate','desc').limit(1).get();if(!latest.empty)await patch(patient,()=>({currentAdmissionDate:latest.docs[0].data().admissionDate}),'admissionMetadata');}
 }
 const chats = await scan(db.collection('chats'));
 for (const doc of chats) await patch(doc, data => ({updatedAt: data.updatedAt || data.lastMessage?.timestamp || data.createdAt || null}), 'chatMetadata');
 for (const user of users) {
  const reference = user.ref.collection('summaries').doc('inbox');
  const summary = await reference.get();
  if (!summary.exists) {
   counts.inboxSummaries = (counts.inboxSummaries || 0) + 1;
   if (apply) await db.runTransaction(async transaction => {
    if ((await transaction.get(reference)).exists) return;
    const participants = chats.filter(doc => doc.data().participants?.includes(user.id));
    const latest = await Promise.all(participants.map(doc => transaction.get(doc.ref)));
    transaction.set(reference, {unreadMessages: latest.reduce((total, doc) => total + Number(doc.data()?.unreadCounts?.[user.id] || 0), 0)});
   });
  }
 }
 // Invalidate only display summaries; never delete source records.
 if(apply){const summaries=await scan(db.collection('summaries'));for(const doc of summaries)await doc.ref.update({expiresAt:0});for(const doc of patients){const summary=await doc.ref.collection('summaries').doc('records').get();if(summary.exists)await summary.ref.update({expiresAt:0});}}
 console.log(JSON.stringify({mode:apply?'applied':'dry-run',scanned:{patients:patients.length,users:users.length,inventory:inventory.length,prices:prices.length,bills:bills.length},changed:counts}));
 await firebase.auth().signOut();
}
main().then(()=>process.exit(0)).catch(error=>{console.error('Migration failed:',error.code, error.message, JSON.stringify(counts));process.exit(1);});
