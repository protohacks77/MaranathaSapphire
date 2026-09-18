const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const exported = {}, errors = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/firestoreReadError.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { exports: errors });
const records = {
    bills: Array.from({ length: 501 }, (_, index) => ({ id: `bill-${index}`, patientId: index % 2 ? 'p1' : 'p2', patientName: 'Jane Doe', totalBill: 50, balance: 20, date: '2026-09-18', status: index % 2 ? 'Paid' : 'Partially Paid', ...(index ? { items: [{ description: 'Paracetamol', quantity: 2, totalPrice: 10 }] } : {}) })),
    patients: [{ id: 'p1', name: 'Jane', surname: 'Doe', status: 'Admitted', financials: { balance: 10 }, registrationDate: '2026-09-18' }, { id: 'p2', name: 'John', surname: 'Smith', status: 'PendingDischarge', registrationDate: '2026-09-18' }],
    inventory: [{ id: 'i1', name: 'Paracetamol', quantity: 20, createdAt: '2026-09-18' }],
};
let failCollection = '', reads = 0;
function query(name, limit = Infinity, after = 0) {
    return {
        limit(size) { return query(name, size, after); },
        startAfter(doc) { return query(name, limit, records[name].findIndex(row => row.id === doc.id) + 1); },
        async get() {
            reads++;
            if (failCollection === name) throw { code: 'permission-denied' };
            return { docs: records[name].slice(after, after + limit).map(row => ({ id: row.id, data: () => row })) };
        },
    };
}
const mocks = {
    './lowReadQueries': { dateQuery: name => query(name) },
    './readCache': { cachedRead: (_key, load) => load() },
    './firestoreReadError': errors,
    './firebase': { db: { collection: name => query(name) } },
};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/reportPreviews.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    exports: exported, require: name => { if (!mocks[name]) throw new Error(`Unexpected import: ${name}`); return mocks[name]; },
});
(async () => {
    const range = { start: new Date('2026-09-01'), end: new Date('2026-09-30') };
    const result = await exported.reportPreviews(range);
    assert.equal(reads, 5); // Three bill pages, one patient page, one stock page.
    assert.equal(Object.keys(result).length, 9);
    for (const preview of Object.values(result)) { assert.ok(!preview.error); assert.ok(!preview.deferred); }
    assert.equal(result.financial_summary['Total Sales'], '$25050.00');
    assert.equal(result.patient_census['Pending Discharge'], 1);
    assert.equal(result.debtors[0].balance, '$10.00');
    assert.equal(result.paid_invoices.length, 4);
    assert.equal(result.partially_paid_invoices.length, 4);
    assert.equal(result.top_selling_items[0].quantity, 1000);
    assert.equal(result.patients_served['Total Unique Patients Served'], 2);
    assert.equal(result.stock_report['Stock Sold (Units)'], 1000);
    assert.equal(result.stock_report['Revenue from Stock ($)'], '$5000.00');
    failCollection = 'inventory';
    const partial = await exported.reportPreviews(range);
    assert.match(partial.stock_report.error, /permission/);
    assert.equal(partial.financial_summary['Total Sales'], '$25050.00');
    assert.equal(partial.top_selling_items[0].quantity, 1000);
    failCollection = 'bills';
    const denied = await exported.reportPreviews(range);
    assert.match(denied.financial_summary.error, /permission/);
    assert.equal(denied.patient_census['Total Registered Patients'], 2);
    failCollection = '';
    for (const key of Object.keys(records)) records[key] = [];
    const empty = await exported.reportPreviews(range);
    assert.equal(empty.financial_summary['Total Sales'], '$0.00');
    assert.equal(empty.patient_census['Total Registered Patients'], 0);
    assert.equal(empty.top_selling_items.length, 0);
    console.log('Preview checks passed: all nine previews load automatically, pagination includes every bill, legacy items work, and genuine failures remain isolated.');
})().catch(error => { console.error(error); process.exitCode = 1; });
