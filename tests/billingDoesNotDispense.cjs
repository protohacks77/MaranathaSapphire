const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function loadHandler(file, name, context) {
 const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
 let initializer;
 function visit(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) initializer = node.initializer;
  ts.forEachChild(node, visit);
 }
 visit(source);
 assert.ok(initializer, `Missing ${name}`);
 const code = ts.transpileModule(`exports.handler = ${initializer.getText(source)};`, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS } }).outputText;
 const exports = {}; vm.runInNewContext(code, { ...context, exports }); return exports.handler;
}
async function check(file, name, items) {
 const writes = [], notifications = [];
 let committed = false;
 const db = {
  collection: collection => {
   assert.notEqual(collection, 'inventory', `${name} must not access stock when billing`);
   assert.notEqual(collection, 'inventoryLogs', `${name} must not record stock movement`);
   return { doc: id => ({ collection, id: id || 'new-record' }) };
  },
  batch: () => ({ set: (ref, data) => writes.push({ ref, data }), update: (ref, data) => writes.push({ ref, data }), commit: async () => { committed = true; } })
 };
 const patient = { id: 'patient-1', name: 'Test', surname: 'Patient', hospitalNumber: 'MH0002' };
 const noop = () => {};
 const context = {
  searchPrefixes: () => ['test'], invalidateReads: () => {},
  db, patient, selectedPatient: patient, billItems: items, totalBill: 30, amountPaid: '30', paymentMethod: 'CASH', hasInvalidQuantities: false,
  userProfile: { id: 'accountant-1', name: 'Test', surname: 'Accountant' },
  firebase: { firestore: { FieldValue: { increment: amount => ({ increment: amount }) } } },
  addNotification: (...args) => notifications.push(args), setLoading: noop, setCreditLoading: noop, setCreditModalOpen: noop,
  onPaymentSuccess: noop, handleClose: noop, onSuccess: noop, onClose: noop, resetBilling: noop, console,
 };
 const handler = loadHandler(file, name, context);
 await handler({ preventDefault: noop });
 assert.equal(committed, true, `${name} must commit the financial records`);
 assert.ok(!notifications.some(([,type]) => type === 'error'));
 const bill = writes.find(write => write.ref.collection === 'bills');
 if (items.length) {
  assert.ok(bill); assert.equal(bill.data.items[0].inventoryItemId, 'drug-1'); assert.equal(bill.data.items[0].department, 'Pharmacy');
 } else assert.ok(!bill);
 assert.ok(writes.every(write => ['bills', 'payments', 'patients'].includes(write.ref.collection)));
}
(async () => {
 const items = [{ id: 'price-1', inventoryItemId: 'drug-1', department: 'Pharmacy', description: 'Mint', quantity: 1959, unitPrice: 1, totalPrice: 1959 }];
 await check('features/accounts/MakePaymentModal.tsx', 'handleSubmit', items);
 await check('features/accounts/MakePaymentModal.tsx', 'handleSubmit', []);
 await check('features/accounts/Billing.tsx', 'handleProcessBill', items);
 await check('features/accounts/Billing.tsx', 'confirmBillOnCredit', items);
 console.log('Billing regression checks passed: patient payment, balance payment, billing, and credit bills never touch stock and preserve dispensing links.');
})().catch(error => { console.error(error); process.exitCode = 1; });
