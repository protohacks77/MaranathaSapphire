const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let store, sequence, commits, failCommit;
const auth = { currentUser: { uid: 'admin-1' } };
const ref = (collection, id) => ({ id, key: `${collection}/${id}`, set: async value => store.set(`${collection}/${id}`, value), update: async value => store.set(`${collection}/${id}`, { ...store.get(`${collection}/${id}`), ...value }) });
const collection = (name, filter) => ({
 doc: id => ref(name, id || `auto-${++sequence}`),
 where: (field, operator, value) => collection(name, row => row[field] === value),
 get: async () => {
  const docs = [...store].filter(([key, value]) => key.startsWith(`${name}/`) && (!filter || filter(value))).map(([key, value]) => ({ ref: ref(name, key.split('/')[1]), data: () => value }));
  return { docs, size: docs.length };
 }
});
const db = { collection: name => {
 const result = collection(name);
 if (name === 'users') result.doc = id => ({ ...ref(name, id), get: async () => ({ data: () => store.get(`users/${id}`) }) });
 return result;
}, batch: () => {
 const operations = [];
 return { delete: reference => operations.push(() => store.delete(reference.key)), update: (reference, value) => operations.push(() => store.set(reference.key, { ...store.get(reference.key), ...value })), commit: async () => {
  assert.ok(operations.length <= 401); commits++;
  if (commits === failCommit) throw new Error('Simulated failure');
  operations.forEach(operation => operation());
 }};
}};
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('features/settings/resetInventory.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, { exports: exportsObject, require: name => {
 if (name === 'firebase/compat/app') return { firestore: { FieldValue: { serverTimestamp: () => 'server-time' } } };
 if (name.endsWith('/firebase')) return { auth, db };
 if (name.endsWith('/types')) return { Role: { Admin: 'Admin' } };
 throw new Error(name);
}});
const { resetInventory, previewInventoryReset } = exportsObject;
const reset = () => {
 sequence = 0; commits = 0; failCommit = 0; auth.currentUser = { uid: 'admin-1' };
 store = new Map([
 ['users/admin-1', { role: 'Admin' }], ['inventory/drug', { quantity: 50 }], ['inventoryLogs/log', {}], ['dispensingRecords/dispense', {}],
 ['priceList/drug', { department: 'Pharmacy' }], ['priceList/service', { department: 'Laboratory' }],
 ['bills/bill', {}], ['payments/payment', {}], ['patients/patient', { name: 'Test', status: 'Admitted', financials: { totalBill: 50, amountPaid: 20, balance: 30 } }],
 ['patients/patient/doctorNotes/note', { medicalNotes: 'Keep me' }], ['wards/ward', { name: 'Ward' }],
 ]);
};
(async () => {
 reset(); const preview = await previewInventoryReset(false); assert.equal(preview.inventory, 1); assert.equal(preview.bills, 0);
 await resetInventory(false, 'RESET INVENTORY', () => {});
 assert.ok(!store.has('inventory/drug')); assert.ok(!store.has('dispensingRecords/dispense')); assert.ok(!store.has('priceList/drug'));
 assert.ok(store.has('priceList/service')); assert.ok(store.has('bills/bill')); assert.equal(store.get('patients/patient').financials.balance, 30);
 reset(); await resetInventory(true, 'RESET INVENTORY', () => {});
 assert.ok(!store.has('bills/bill')); assert.ok(!store.has('payments/payment')); assert.equal(store.get('patients/patient').financials.balance, 0);
 assert.equal(store.get('patients/patient').name, 'Test'); assert.ok(store.has('wards/ward')); assert.ok(store.has('patients/patient/doctorNotes/note'));
 reset(); await assert.rejects(resetInventory(true, 'wrong', () => {})); assert.equal(commits, 0);
 store.get('users/admin-1').role = 'Pharmacist'; await assert.rejects(resetInventory(true, 'RESET INVENTORY', () => {})); assert.equal(commits, 0);
 reset(); for (let i = 0; i < 805; i++) store.set(`inventory/item-${i}`, {});
 await resetInventory(false, 'RESET INVENTORY', () => {}); assert.equal(commits, 3); assert.ok(![...store.keys()].some(key => key.startsWith('inventory/')));
 reset(); failCommit = 1; await assert.rejects(resetInventory(false, 'RESET INVENTORY', () => {}), /Reset stopped after 0/); assert.ok(store.has('inventory/drug'));
 console.log('Reset checks passed: admin access, confirmation, scope, preserved clinical data, batch limits, and failure handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
