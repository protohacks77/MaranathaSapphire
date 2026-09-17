const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
let store,queue,failed,writes,chatScans;
const reference=key=>({key,get:async()=>snapshot(reference(key))});
const snapshot=ref=>({ref,exists:store.has(ref.key),data:()=>store.get(ref.key)});
const db={doc:reference,collection:path=>({doc:id=>reference(`${path}/${id}`),where:(_,__,id)=>({get:async()=>{chatScans++;return{docs:[...store.keys()].filter(key=>key.startsWith('chats/')&&store.get(key).participants.includes(id)).map(key=>snapshot(reference(key)))}}})}),runTransaction:callback=>{const operation=queue.then(async()=>{const staged=[];let started=false;await callback({get:async ref=>{assert.equal(started,false);return snapshot(ref)},set:(ref,data,options)=>{started=true;staged.push([ref,data,!!options?.merge])},update:(ref,data)=>{started=true;staged.push([ref,data,true])}});if(failed)throw Error('write failure');for(const[ref,data,merge]of staged){writes++;const value=merge?{...store.get(ref.key)}:{};for(const[key,item]of Object.entries(data)){if(key.startsWith('unreadCounts.'))value.unreadCounts={...value.unreadCounts,[key.split('.')[1]]:item};else value[key]=item;}store.set(ref.key,value)}});queue=operation.catch(()=>{});return operation}};
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const cache={};vm.runInNewContext(compile('services/readCache.ts'),{exports:cache,Date});
const exportsValue={};vm.runInNewContext(compile('services/inboxSummary.ts'),{exports:exportsValue,require:name=>name==='./firebase'?{db}:name==='./readCache'?cache:{}});
const reset=()=>{store=new Map([['chats/a',{participants:['u','v'],unreadCounts:{u:3,v:0}}],['chats/b',{participants:['u','w'],unreadCounts:{u:2,w:0}}],['users/u/summaries/inbox',{unreadMessages:5}]]);queue=Promise.resolve();failed=false;writes=0;chatScans=0;cache.invalidateReads()};
(async()=>{
 reset();await Promise.all([exportsValue.markConversationRead('a','u'),exportsValue.markConversationRead('b','u')]);assert.equal(store.get('users/u/summaries/inbox').unreadMessages,0);assert.equal(store.get('chats/a').unreadCounts.u,0);assert.equal(store.get('chats/b').unreadCounts.u,0);assert.equal(chatScans,0);
 const prior=writes;await exportsValue.markConversationRead('a','u');assert.equal(writes,prior);
 reset();await exportsValue.markConversationRead('a','u');assert.equal(store.get('users/u/summaries/inbox').unreadMessages,2);
 reset();failed=true;await assert.rejects(exportsValue.markConversationRead('a','u'));assert.equal(store.get('users/u/summaries/inbox').unreadMessages,5);assert.equal(store.get('chats/a').unreadCounts.u,3);
 reset();store.delete('users/u/summaries/inbox');await exportsValue.ensureInboxSummary('u');assert.equal(store.get('users/u/summaries/inbox').unreadMessages,5);assert.equal(chatScans,1);await exportsValue.ensureInboxSummary('u');assert.equal(chatScans,1);
 console.log('Inbox summary checks passed: one-time initialization, concurrent reads, correct decrements, idempotency, and rollback.');
})().catch(error=>{console.error(error);process.exit(1)});
