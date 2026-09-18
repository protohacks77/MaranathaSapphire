const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const exported = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('services/reportFormatting.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, { exports: exported });
const totals = exported.financialReportSummary(
    [{ totalBill: 100 }, { totalBill: 30 }, {}],
    [{ amount: 40, paymentMethod: 'CASH' }, { amount: 25, paymentMethod: 'EFT' }],
    [{ financials: { balance: 65 } }, {}]
);
assert.equal(totals['Total Sales'], 130);
assert.equal(totals['Cash Received'], 40);
assert.equal(totals['EFT Received'], 25);
assert.equal(totals['Total Outstanding Balance'], 65);
assert.equal(exported.financialReportSummary([], [], [])['Total Sales'], 0);
assert.equal(exported.reportCellText(12, 'Stock Received (Units)'), '12');
assert.equal(exported.reportCellText(12, 'Cash Received'), '$12.00');
assert.equal(exported.reportCellText(null, 'Name'), '—');
assert.equal(exported.reportCellText('invalid', 'Date', 'registrationDate'), '—');
assert.equal(exported.reportCellText(true, 'Status', 'isLow'), 'Low Stock');
console.log('Report totals and export formatting checks passed.');
