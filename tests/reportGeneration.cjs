const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const formatting = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/reportFormatting.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: formatting });
const renderer = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/reportA4.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: renderer, require: () => formatting });
const source = ts.createSourceFile('Reports.tsx', fs.readFileSync('features/accounts/Reports.tsx', 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let handler;
function visit(node) { if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'handleGenerateReport') handler = node.initializer.getText(source); ts.forEachChild(node, visit); }
visit(source);
const range = { start: new Date('2026-09-01'), end: new Date('2026-09-30T23:59:59Z') };
let records, result, error, fail = false;
function query(name, filters = []) {
    return { where(field, op, value) { return query(name, [...filters, [field, op, value]]); }, async get() {
        if (fail) throw new Error('read failed');
        const rows = records[name].filter(row => filters.every(([field, op, value]) => op === 'in' ? value.includes(row.id) : field === 'financials.balance' ? row.financials?.balance > value : true));
        return { docs: rows.map(row => ({ id: row.id, data: () => row })) };
    } };
}
async function generate(type) {
    result = undefined; error = '';
    const exported = {};
    vm.runInNewContext(ts.transpileModule(`exports.run = ${handler}`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports: exported, Date, console: { error() {} }, generationRequest: { current: 0 }, dateRange: range,
        setGeneratingReportType() {}, setReportError(value) { error = value; }, setDownloadOpen() {}, addNotification() {}, setPanelOpen() {}, setGeneratedReport(value) { result = value; },
        db: { collection: query }, dateQuery: name => query(name), firebase: { firestore: { FieldPath: { documentId: () => 'id' } } },
        firestoreReadError: failure => ({ message: failure.message }), ...formatting,
    });
    await exported.run(type);
    return result;
}
const types = ['financial_summary', 'stock_report', 'debtors', 'top_selling_items', 'paid_invoices', 'partially_paid_invoices', 'admissions', 'patients_served', 'patient_census'];
(async () => {
    records = { bills: [{ id: 'b1', patientId: 'p1', date: '2026-09-18', status: 'Paid', totalBill: 10, items: [{ description: 'constructor', quantity: 2, totalPrice: 10 }] }, { id: 'b2', patientId: 'p1', date: '2026-09-18', status: 'Partially Paid', totalBill: 20, balance: 5 }], payments: [], patients: [{ id: 'p1', name: 'Test', surname: 'Patient', registrationDate: '2026-09-18', financials: { balance: 5 } }], inventory: [{ id: 'i1', name: 'constructor', quantity: 7, unitPrice: 5, createdAt: '2026-09-18' }] };
    for (const type of types) {
        const report = await generate(type);
        assert.ok(report, `${type}: ${error}`);
        const pages = renderer.paginateReport(report);
        assert.ok(pages.length);
        pages.forEach((page, index) => assert.match(renderer.renderReportPage(report, page, index, pages.length, ''), /<svg/));
    }
    const stock = await generate('stock_report');
    assert.equal(stock.summary['Stock Received (Units)'], 7, 'String dates must be included in stock received');
    assert.equal(stock.summary['Stock Sold (Units)'], 2, 'Item names must not collide with Object prototype properties');
    const top = await generate('top_selling_items');
    assert.equal(top.tables[0].data[0].name, 'constructor');
    assert.equal(top.summary['Total Items Sold'], 2);
    records.bills[0].items = Array.from({ length: 25 }, (_, i) => ({ description: `Item ${i}`, quantity: 1, totalPrice: 1 }));
    const many = await generate('top_selling_items');
    assert.equal(many.tables[0].data.length, 20);
    assert.equal(many.summary['Total Items Sold'], 25, 'Summary includes items outside the top 20');
    for (const key of Object.keys(records)) records[key] = [];
    for (const type of types) assert.ok(await generate(type), `Empty ${type}: ${error}`);
    fail = true;
    assert.equal(await generate('financial_summary'), undefined);
    assert.equal(error, 'read failed');
    console.log('All nine report generators passed: populated/empty records, legacy stock dates, reserved item names, and read failure handling.');
})().catch(error => { console.error(error); process.exitCode = 1; });
