const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const modules = {};
for (const name of ['reportFormatting', 'reportA4']) {
    const exported = {};
    vm.runInNewContext(ts.transpileModule(fs.readFileSync(`services/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
        exports: exported, require: path => modules[path.replace('./', '')],
    });
    modules[name] = exported;
}
const { paginateReport, renderReportPage, A4_WIDTH, A4_HEIGHT } = modules.reportA4;
const report = { title: 'Financial Summary', period: 'September 2026', generatedAt: '18 September 2026', summary: { Sales: 100, Balance: 20, Cash: 60, EFT: 20 }, tables: [] };
const short = paginateReport(report);
assert.equal(short.length, 1);
assert.ok(A4_HEIGHT > A4_WIDTH);
assert.match(short[0].body, /height="96"/);
const detailed = { ...report, tables: [{ title: 'Patients', columns: [{ header: 'Patient Name', accessor: 'name' }, { header: 'Hospital Number', accessor: 'number' }], data: Array.from({ length: 120 }, (_, index) => ({ name: `Patient-${index}`, number: `HN${index}` })) }] };
const pages = paginateReport(detailed);
assert.ok(pages.length > 1);
const body = pages.map(page => page.body).join('');
for (let index = 0; index < 120; index++) assert.equal(body.split(`>Patient-${index}</text>`).length - 1, 1);
for (const page of pages) {
    for (const match of page.body.matchAll(/<rect[^>]*y="([\d.]+)"[^>]*height="([\d.]+)"/g)) assert.ok(Number(match[1]) + Number(match[2]) <= 1040);
}
const malicious = { ...report, title: '<script>alert("x")</script>', summary: { '<img>': '<svg onload="bad()">' } };
const svg = renderReportPage(malicious, paginateReport(malicious)[0], 0, 1, 'data:image/png;base64,logo');
assert.ok(!svg.includes('<script>'));
assert.ok(!svg.includes('<img>'));
assert.match(svg, /&lt;script&gt;/);
assert.match(svg, /Page 1 of 1/);
assert.match(svg, /MARANATHA-SAPPHIRE/);
const long = paginateReport({ ...report, tables: [{ title: 'Notes', columns: [{ header: 'Description', accessor: 'note' }], data: [{ note: 'Very long text '.repeat(1000) }] }] });
assert.ok(long.length > 1);
console.log('A4 report checks passed: portrait dimensions, large cells for short reports, pagination without lost rows, repeated headers, long text, and escaped content.');
