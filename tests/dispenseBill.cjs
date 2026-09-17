const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let store, sequence, queue, failWrite;
const roles = { Pharmacist: 'Pharmacist', PharmacyTechnician: 'Pharmacy Technician', DispensaryAssistant: 'Dispensary Assistant', Admin: 'Admin' };
const user = { id: 'pharmacist-1', name: 'Test', surname: 'Pharmacist', role: roles.Pharmacist };
const inventory = [{ id: 'drug-a', name: 'Drug A', quantity: 10 }, { id: 'drug-b', name: 'Drug B', quantity: 10 }];
const ref = (collection, id) => ({ id, key: `${collection}/${id}` });
const db = {
 collection: collection => ({ doc: id => ref(collection, id || `auto-${++sequence}`) }),
 runTransaction: callback => {
  const operation = queue.then(async () => {
   const writes = []; let writeStarted = false;
   const transaction = {
    get: async reference => { assert.equal(writeStarted, false, 'All reads must precede writes'); const data = store.get(reference.key); return { exists: !!data, id: reference.id, data: () => data }; },
    set: (reference, data) => { writeStarted = true; writes.push([reference, data, false]); },
    update: (reference, data) => { writeStarted = true; writes.push([reference, data, true]); },
   };
   await callback(transaction);
   if (failWrite) throw new Error('Simulated write failure');
   for (const [reference, data, merge] of writes) store.set(reference.key, merge ? { ...store.get(reference.key), ...data } : data);
  }); queue = operation.catch(() => {}); return operation;
 }
};
const cache = {};
const load = path => {
 if (cache[path]) return cache[path];
 const result = {}; cache[path] = result;
 const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true } }).outputText;
 vm.runInNewContext(source, { exports: result, require: name => {
  if (name === 'firebase/compat/app') return { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
  if (name.endsWith('/firebase')) return { db };
  if (name.endsWith('/types')) return { Role: roles };
  if (name === './billedMedication') return load('features/pharmacy/billedMedication.ts');
  throw new Error(name);
 }}); return result;
};
const { dispenseBill } = load('features/pharmacy/dispenseBill.ts');
const { billedMedicationLines, dispensingProblem } = load('features/pharmacy/billedMedication.ts');
const reset = () => {
 sequence = 0; queue = Promise.resolve(); failWrite = false;
 store = new Map([
  ['inventory/drug-a', { name: 'Drug A', quantity: 10, totalStockReceived: 30 }], ['inventory/drug-b', { name: 'Drug B', quantity: 10 }],
  ['patients/patient-1', { name: 'Test', surname: 'Patient', hospitalNumber: 'MH0002' }],
  ['bills/bill-1', { patientId: 'patient-1', status: 'Paid', items: [
   { inventoryItemId: 'drug-a', department: 'Pharmacy', description: 'Drug A', quantity: 4 },
   { inventoryItemId: 'drug-b', department: 'Pharmacy', description: 'Drug B', quantity: 3 },
   { department: 'Laboratory', description: 'Blood test', quantity: 1 },
  ] }],
 ]);
};
(async () => {
 reset(); await dispenseBill('bill-1', inventory, user);
 assert.equal(store.get('inventory/drug-a').quantity, 6); assert.equal(store.get('inventory/drug-b').quantity, 7);
 assert.equal(store.get('inventory/drug-a').totalStockReceived, 30);
 assert.equal(store.get('bills/bill-1').dispensingStatus, 'Complete');
 assert.equal(Object.keys(store.get('bills/bill-1').dispensedQuantities).length, 2);
 const records = [...store].filter(([key]) => key.startsWith('dispensingRecords/')).map(([,value]) => value);
 assert.equal(records.length, 2); assert.equal(records[0].billId, 'bill-1'); assert.equal(records[0].recipientPatientId, 'patient-1'); assert.equal(records[0].dispensedById, user.id);
 await assert.rejects(dispenseBill('bill-1', inventory, user), /no medication awaiting/); assert.equal(store.get('inventory/drug-a').quantity, 6);
 reset(); store.get('bills/bill-1').dispensedQuantities = { '0': 2 }; await dispenseBill('bill-1', inventory, user); assert.equal(store.get('inventory/drug-a').quantity, 8);
 reset(); store.get('inventory/drug-b').quantity = 1; await assert.rejects(dispenseBill('bill-1', inventory, user), /Insufficient stock/); assert.equal(store.get('inventory/drug-a').quantity, 10); assert.equal(store.size, 4);
 reset(); failWrite = true; await assert.rejects(dispenseBill('bill-1', inventory, user)); assert.equal(store.get('inventory/drug-a').quantity, 10);
 reset(); await assert.rejects(dispenseBill('bill-1', inventory, { ...user, role: 'Accountant' })); assert.equal(store.size, 4);
 reset(); store.delete('patients/patient-1'); await assert.rejects(dispenseBill('bill-1', inventory, user), /patient/); assert.equal(store.get('inventory/drug-a').quantity, 10);
 reset(); const outcomes = await Promise.allSettled([dispenseBill('bill-1', inventory, user), dispenseBill('bill-1', inventory, user)]); assert.equal(outcomes.filter(outcome => outcome.status === 'fulfilled').length, 1); assert.equal(store.get('inventory/drug-a').quantity, 6);
 reset(); const bill = store.get('bills/bill-1'); bill.items = [{ description: 'Drug A', quantity: 6 }, { description: 'Drug A', quantity: 6 }]; await assert.rejects(dispenseBill('bill-1', inventory, user), /Insufficient stock/); assert.equal(store.get('inventory/drug-a').quantity, 10);
 reset(); store.get('bills/bill-1').items[0].quantity = 1.5; await assert.rejects(dispenseBill('bill-1', inventory, user), /quantity/);
 const missing = billedMedicationLines({ items: [{ department: 'Pharmacy', description: 'Missing drug', quantity: 2 }] }, inventory); assert.equal(missing.length, 1); assert.ok(dispensingProblem(missing).includes('not linked'));
 console.log('Billed dispensing checks passed: multi-drug, remaining quantities, legacy matching, service exclusion, permissions, stock shortage, rollback, and duplicate requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
