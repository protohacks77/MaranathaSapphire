const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const roles = { Pharmacist: 'Pharmacist', PharmacyTechnician: 'Pharmacy Technician', DispensaryAssistant: 'Dispensary Assistant', Admin: 'Admin' };
const user = { id: 'pharmacist-1', name: 'Test', surname: 'Pharmacist', role: roles.Pharmacist };
const input = { itemId: 'drug-1', recipientPatientId: 'patient-1', quantity: 3, recipientName: ' Test Patient ', recipientHospitalNumber: ' MH0002 ', notes: ' Test dispense ' };
let store, sequence, queue, failWrite;
const db = {
 collection: collection => ({ doc: id => ({ collection, id: id || `auto-${++sequence}` }) }),
 runTransaction: callback => {
  const operation = queue.then(async () => {
   const writes = [];
   const transaction = {
    get: async ref => { const item = store.get(`${ref.collection}/${ref.id}`); return { exists: !!item, data: () => item }; },
    update: (ref, value) => writes.push([ref, value, true]),
    set: (ref, value) => writes.push([ref, value, false]),
   };
   await callback(transaction);
   if (failWrite) throw new Error('Simulated write failure');
   for (const [ref, value, merge] of writes) { const key = `${ref.collection}/${ref.id}`; store.set(key, merge ? { ...store.get(key), ...value } : value); }
  });
  queue = operation.catch(() => {});
  return operation;
 }
};
const exportsObject = {};
const source = ts.transpileModule(fs.readFileSync('features/pharmacy/dispenseMedication.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
vm.runInNewContext(source, { exports: exportsObject, require: name => {
 if (name === 'firebase/compat/app') return { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
 if (name.endsWith('/firebase')) return { db };
 if (name.endsWith('/types')) return { Role: roles };
 throw new Error(`Unexpected import ${name}`);
}});
const { dispenseMedication } = exportsObject;
const reset = () => { store = new Map([['inventory/drug-1', { name: 'Test Drug', quantity: 5, totalStockReceived: 20 }], ['patients/patient-1', { name: 'Test', surname: 'Patient', hospitalNumber: 'MH0002' }]]); sequence = 0; queue = Promise.resolve(); failWrite = false; };
(async () => {
 reset();
 await dispenseMedication(input, user);
 assert.equal(store.get('inventory/drug-1').quantity, 2);
 assert.equal(store.get('inventory/drug-1').totalStockReceived, 20);
 const dispensing = [...store].find(([key]) => key.startsWith('dispensingRecords/'))[1];
 assert.equal(dispensing.recipientName, 'Test Patient');
 assert.equal(dispensing.recipientPatientId, 'patient-1');
 assert.equal(dispensing.recipientHospitalNumber, 'MH0002');
 assert.equal(dispensing.dispensedById, user.id);
 assert.equal(dispensing.timestamp, 'server-time');
 const log = [...store].find(([key]) => key.startsWith('inventoryLogs/'))[1];
 assert.equal(log.changeAmount, -3);
 assert.equal(log.previousQuantity, 5);
 assert.equal(log.newQuantity, 2);
 for (const quantity of [0, -1, 1.5, NaN, Infinity, 6]) {
  reset(); await assert.rejects(dispenseMedication({ ...input, quantity }, user)); assert.equal(store.size, 2); assert.equal(store.get('inventory/drug-1').quantity, 5);
 }
 reset(); await assert.rejects(dispenseMedication({ ...input, recipientPatientId: '' }, user));
 await assert.rejects(dispenseMedication(input, { ...user, role: 'Doctor' })); assert.equal(store.size, 2);
 reset(); store.delete('patients/patient-1'); await assert.rejects(dispenseMedication(input, user)); assert.equal(store.get('inventory/drug-1').quantity, 5);
 reset(); store.clear(); await assert.rejects(dispenseMedication(input, user)); assert.equal(store.size, 0);
 reset(); failWrite = true; await assert.rejects(dispenseMedication(input, user)); assert.equal(store.get('inventory/drug-1').quantity, 5); assert.equal(store.size, 2);
 reset(); const results = await Promise.allSettled([dispenseMedication(input, user), dispenseMedication(input, user)]);
 assert.equal(results.filter(result => result.status === 'fulfilled').length, 1); assert.equal(store.get('inventory/drug-1').quantity, 2); assert.equal(store.size, 4);
 console.log('Dispensing checks passed: permissions, recipient, quantity, audit, rollback, and competing requests.');
})().catch(error => { console.error(error); process.exitCode = 1; });
