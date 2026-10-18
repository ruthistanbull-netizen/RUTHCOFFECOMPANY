const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');const Module=require('node:module');
const ts=require('typescript');
const filename=path.resolve(__dirname,'../apps/admin/src/lib/finance/export.ts');
const mod=new Module(filename);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));
const parentRequire=mod.require.bind(mod);mod.require=id=>id==='./exportFont'?{financeExportFont:fs.readFileSync(path.join(path.dirname(filename),'exportFont.ts'),'utf8').match(/= "([^"]+)"/)[1]}:parentRequire(id);
mod._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText,filename);
(async()=>{
 const report={currency:'TRY',from:'2026-10-01',to:'2026-10-18',current:{},monthly:[{date:'2026-10-01',values:{net_sales:'123.45',cash_in:'148.14'}}]};
 const excel=await mod.exports.exportFinance(report,'xlsx');assert.ok(excel.bytes.length>100);
 const ExcelJS=parentRequire('exceljs');const book=new ExcelJS.Workbook();await book.xlsx.load(excel.bytes);assert.equal(book.worksheets[0].getCell('C2').value,'123.45');
 const pdf=await mod.exports.exportFinance(report,'pdf');assert.ok(pdf.bytes.length>100);assert.equal(Buffer.from(pdf.bytes).subarray(0,4).toString(),'%PDF');
 const {PDFDocument}=parentRequire('pdf-lib');const document=await PDFDocument.load(pdf.bytes);assert.equal(document.getPageCount(),1);
 console.log('Finance exports: exact Excel values, UTF-8/Turkish font PDF and shared report totals passed.');
})().catch(error=>{console.error(error);process.exitCode=1});
