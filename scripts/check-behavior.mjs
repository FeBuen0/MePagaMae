import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const dir=await fs.mkdtemp(path.join(os.tmpdir(),'conta-check-'));
try{
 for(const name of ['model','import']){const source=(await fs.readFile(`lib/${name}.ts`,'utf8')).replace("from './model'","from './model.mjs'");await fs.writeFile(path.join(dir,name+'.mjs'),ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText);}
 const {categorize,amountCents}=await import(pathToFileURL(path.join(dir,'model.mjs')));
 const {parseStatement}=await import(pathToFileURL(path.join(dir,'import.mjs')));
 assert.equal(amountCents('R$ 1.234,56'),123456);assert.equal(amountCents('1,234.56'),123456);assert.equal(amountCents('27.90'),2790);assert.equal(amountCents('27,90'),2790);assert.equal(amountCents('-42.50'),-4250);assert.equal(amountCents(''),0);assert.equal(amountCents('abc'),0);
 assert.equal(categorize('UBER * TRIP'), 'Transporte');assert.equal(categorize('Farmácia Panvel'), 'Saúde');assert.equal(categorize('iFood'), 'Alimentação');assert.equal(categorize('Transferência para João'), '');
 const csv='data;descrição;valor\n25/11/2026;Uber;-27,90\n24/11/2026;Salário;1500,00\n23/11/2026;Estorno;-12,00\n31/11/2026;Inválido;-1,00';
 const account=parseStatement(csv,'csv',2026,'negative');assert.equal(account.rows.length,1);assert.equal(account.rows[0].amount,2790);assert.equal(account.rows[0].date,'2026-11-25');assert.equal(account.rows[0].category,'Transporte');assert.equal(account.skipped,3);
 const card=parseStatement('date,title,amount\n2026-11-25,"Café, almoço",32.50\n2026-11-24,Estorno,-12.00','csv',2026,'positive');assert.equal(card.rows.length,1);assert.equal(card.rows[0].description,'Café, almoço');assert.equal(card.rows[0].amount,3250);
 const quoted=parseStatement('data;descrição;valor\n25/11/2026;"Uber\nvolta";-22,90','csv',2026,'negative');assert.equal(quoted.rows.length,1);assert.equal(quoted.rows[0].amount,2290);
 const ofx='<STMTTRN><DTPOSTED>20261125000000<TRNAMT>-21.50<MEMO>Uber</STMTTRN><STMTTRN><DTPOSTED>20261124<TRNAMT>100.00<MEMO>Entrada</STMTTRN>';
 const parsed=parseStatement(ofx,'ofx',2026);assert.equal(parsed.rows.length,1);assert.equal(parsed.rows[0].amount,2150);assert.equal(parsed.rows[0].date,'2026-11-25');
 assert.throws(()=>parseStatement('a;b;c\nx;y;z','csv',2026),/colunas/);
 assert.equal(parseStatement('25/11 Restaurante almoço 32,50\n24/11 Saldo anterior 1.500,00','text',2026).rows.length,1);
 console.log('OK: valores em centavos, categorias, datas, CSV de conta/cartão, créditos, estornos, aspas, OFX e texto de PDF.');
}finally{await fs.rm(dir,{recursive:true,force:true})}
