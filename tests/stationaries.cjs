const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { webcrypto } = require('node:crypto');
const values = new Map(), cache = new Map();
let reads = 0, commits = 0, staged = [];
const commitSizes = [];
function collection(path) {
 return {doc(id=webcrypto.randomUUID()){return {id,path:`${path}/${id}`,collection(name){return collection(`${path}/${id}/${name}`)}}},
 where(_,__,version){return {limit(){return {get:async options=>{
 if(options.source==='cache') return {size:0,docs:[]};
 reads++;const docs=[...values].filter(([key,value])=>key.startsWith(`${path}/`)&&value.version===version).map(([id,value])=>({id,data:()=>value}));return {size:docs.length,docs};
 }}}}}};
}
const db={collection,batch:()=>({set:(reference,value)=>staged.push([reference.path,value]),delete:reference=>staged.push([reference.path,null]),commit:async()=>{commits++;commitSizes.push(staged.reduce((total,[,value])=>total+JSON.stringify(value).length,0));for(const [key,value] of staged){if(value===null)values.delete(key);else values.set(key,value);}staged=[]}})};
const exportsObject={};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/stationaries.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText, {
 exports:exportsObject, require:name=>name==='./firebase'?{db}:name==='fflate'?require('fflate'):name==='../types'?{Role:{Admin:'Admin'}}:{cacheScope:()=> 'admin',readDeviceCache:async key=>cache.get(key),writeDeviceCache:async(key,value)=>cache.set(key,value),removeDeviceCache:async key=>cache.delete(key)},
 crypto:webcrypto,Uint8Array,ArrayBuffer,Blob,btoa,atob,navigator:{onLine:true},Map,Date,Number,Promise,setTimeout,
});
(async()=>{
 const service=exportsObject;
 const bytes=Uint8Array.from({length:1_000_007},(_,index)=>index%256);
 assert.deepEqual(service.decodeFileBytes(service.encodeFileBytes(bytes)),bytes);
 const document=await service.uploadStationary({size:bytes.length,name:'Form.pdf',type:'application/pdf',arrayBuffer:async()=>bytes.buffer},{name:'Medical Form',description:'Form',userId:'admin',userName:'Admin'});
 assert.equal(commits,1);assert.ok(document.chunkCount>1);
 const chunks=[...values].filter(([key])=>key.includes('/stationaryChunks/'));
 assert.equal(chunks.length,document.chunkCount);assert.ok(chunks.every(([,value])=>value.base64.length<=600_000));
 assert.ok(!values.get(`stationaries/${document.id}`).base64,'Lists must contain only metadata');
 cache.clear();
 const [first,second]=await Promise.all([service.loadStationaryFile(document),service.loadStationaryFile(document)]);
 assert.equal(reads,1,'Concurrent loads share one file read');
 assert.deepEqual(new Uint8Array(await first.arrayBuffer()),bytes);
 assert.equal(first,second);
 await service.loadStationaryFile(document);assert.equal(reads,1,'Repeat views use the device cache');
 const large=Uint8Array.from({length:6_000_001},(_,index)=>index%256);
 const largeDocument=await service.uploadStationary({size:large.length,name:'Large.pdf',type:'application/pdf',arrayBuffer:async()=>large.buffer},{name:'Large PDF',description:'',userId:'admin',userName:'Admin'});
 assert.equal(commits,3,'Large uploads must use multiple commits');
 assert.ok(commitSizes.every(size=>size<10*1024*1024),'Each commit must fit Firestore request limits');
 assert.equal([...values].filter(([key])=>key.startsWith(`stationaries/${largeDocument.id}/stationaryChunks/`)).length,largeDocument.chunkCount);
 const readsBeforeDelete=reads;
 await assert.rejects(service.deleteStationary(largeDocument,{role:'Doctor'}),/Only administrators/);
 await service.deleteStationary(largeDocument,{role:'Admin'});
 assert.equal(reads,readsBeforeDelete,'Delete must not read file payloads');
 assert.ok(!values.has(`stationaries/${largeDocument.id}`));
 assert.ok(![...values.keys()].some(key=>key.startsWith(`stationaries/${largeDocument.id}/`)));
 assert.ok(!cache.has(`stationary-file:${largeDocument.id}:${largeDocument.version}`));
 const archive=require('fflate').zipSync({'word/document.xml':new Uint8Array([1]),'[Content_Types].xml':new Uint8Array([2])});
 assert.equal(await service.resolveStationaryPreviewKind({fileName:'renamed.doc',mimeType:'application/octet-stream'},new Blob([archive])),'docx');
 assert.equal(service.stationaryPreviewKind({fileName:'Word template.DOTX ',mimeType:''}),'docx');
 assert.equal(service.stationaryPreviewKind({fileName:'no-extension',mimeType:'Application/Vnd.Openxmlformats-Officedocument.Wordprocessingml.Document; charset=UTF-8'}),'docx');
 cache.clear();chunks[0][1].base64='bad-data';
 await assert.rejects(service.loadStationaryFile(document),/Invalid|incomplete|damaged|character/);
 await assert.rejects(service.uploadStationary({size:21*1024*1024},{}),/20 MB/);
 assert.equal(service.stationaryPreviewKind({fileName:'Form.DOCX',mimeType:''}),'docx');
 assert.equal(service.stationaryPreviewKind({fileName:'Form.zip',mimeType:'application/zip'}),'unsupported');
 console.log('Stationaries checks passed: binary/base64 round-trip, chunked upload, metadata-only list, deduplicated/cached reads, Word content detection, damaged-file detection and admin deletion.');
})().catch(failure=>{console.error(failure);process.exit(1)});
