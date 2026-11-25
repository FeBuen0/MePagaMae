import {amountCents,categorize,Category} from './model';
export type Draft={description:string; note?:string; merchant?:string; amount:number; date:string; category:Category|''; include:boolean; guessed:boolean};
function dateValue(s:string,year:number):string|null {
 let m=s.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})/);let y:number,mo:number,d:number;
 if(m){y=+m[1];mo=+m[2];d=+m[3];}else{m=s.trim().match(/^(\d{1,2})[\/.](\d{1,2})(?:[\/.](\d{2,4}))?/);if(!m)return null;y=m[3]?(+m[3]<100?2000+ +m[3]:+m[3]):year;mo=+m[2];d=+m[1];}
 const dt=new Date(Date.UTC(y,mo-1,d));if(dt.getUTCMonth()!==mo-1||dt.getUTCDate()!==d)return null;
 return `${y}-${String(mo).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
}
function row(description:string,amount:number,date:string):Draft|null {
 if(!description.trim()||!amount||!date)return null;
 const category=categorize(description);return {description:description.trim().slice(0,180),amount:Math.abs(amount),date,category,include:true,guessed:!!category};
}
function splitCSV(text:string,sep:string):string[][] {
 const out:string[][]=[];let cells:string[]=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(c===sep&&!quoted){cells.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;cells.push(cell);if(cells.some(x=>x.trim()))out.push(cells);cells=[];cell='';}else cell+=c;}
 cells.push(cell);if(cells.some(x=>x.trim()))out.push(cells);return out;
}
const normalized=(value:string)=>value.replace(/^\uFEFF/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/\s+/g,' ');
function csvColumns(cells:string[]){
 const head=cells.map(normalized);
 const date=head.findIndex(x=>/^(data|date|dt)(?:\b|_)/.test(x));
 const detail=head.findIndex(x=>/^(descricao|description|title|estabelecimento|memo)(?:\b|_)/.test(x));
 const history=head.findIndex(x=>/^(historico|history|tipo(?: de)? (?:transacao|lancamento)|transaction type)(?:\b|_)/.test(x));
 const fallback=head.findIndex(x=>/^(historico|history|lancamento)(?:\b|_)/.test(x));
 const description=detail>=0?detail:fallback;
 const amount=head.findIndex(x=>/^(valor|amount|value|saida|debito)(?:\b|_)/.test(x));
 return {date,description,history,amount,debitOnly:amount>=0&&/saida|debito/.test(head[amount])};
}
function csvTable(text:string){
 // Bank exports often put account details and balances before the actual table.
 // Match the complete table header instead of assuming that the first line is it.
 for(const separator of [';','\t',',']){
  const records=splitCSV(text.replace(/^\uFEFF/,''),separator);
  for(let i=0;i<Math.min(records.length,100);i++){
   const columns=csvColumns(records[i]);
   if(columns.date>=0&&columns.description>=0&&columns.amount>=0)return {records:records.slice(i+1),...columns};
  }
 }
 throw new Error('Não conseguimos reconhecer o formato deste extrato. Você pode tentar OFX ou adicionar os gastos manualmente.');
}
export function parseStatement(text:string,kind:string,year:number,direction:'negative'|'positive'='negative'):{rows:Draft[];skipped:number} {
 const result:Draft[]=[];let skipped=0;
 if(kind==='ofx'||text.includes('<STMTTRN>')){
  for(const block of text.split(/<STMTTRN>/i).slice(1)){const field=(k:string)=>block.match(new RegExp('<'+k+'>([^<\\r\\n]+)','i'))?.[1]?.trim()||'';const amount=amountCents(field('TRNAMT'));if(amount>=0){skipped++;continue;}const dt=dateValue(field('DTPOSTED'),year);const r=dt&&row(field('MEMO')||field('NAME'),amount,dt);if(r)result.push(r);else skipped++;}
 } else if(kind==='csv'){
  if(!text.trim())return {rows:[],skipped:0};
  const table=csvTable(text);
  for(const cells of table.records){
   const amount=amountCents(cells[table.amount]||'');
   // Prefer the merchant description when the bank also provides a generic history.
   const history=table.history>=0?(cells[table.history]||'').trim():'';
   const description=(cells[table.description]||'').trim()||history;
   const context=normalized(history+' '+description);
   const movement=normalized(history);
   const notExpense=/saldo|pagamento.*fatura|rendimento|estorno|recebido|credito em conta/.test(context)
    ||/^(aplicacao|resgate)(?:$| (?:automatic[oa]|financeir[oa]|de |em ))/.test(movement);
   if(((direction==='negative'?amount>=0:amount<0)&&!table.debitOnly)||notExpense){skipped++;continue;}
   const dt=dateValue(cells[table.date]||'',year);const item=dt&&row(description,amount,dt);
   if(item)result.push(item);else skipped++;
  }
 }else{
  for(const line of text.split(/\r?\n/)){const m=line.trim().match(/^(\d{1,2}[\/.]\d{1,2}(?:[\/.]\d{2,4})?|\d{4}-\d{2}-\d{2})\s+(.+?)\s+(?:R\$\s*)?(-?[\d.]+,\d{2})(?:\s*[DC])?\s*$/i);if(!m)continue;const dt=dateValue(m[1],year);if(/saldo|rendimento|recebido|estorno|pagamento.*fatura/i.test(m[2])){skipped++;continue;}const r=dt&&row(m[2],amountCents(m[3]),dt);if(r)result.push(r);}
 }
 return {rows:result.slice(0,300),skipped:skipped+Math.max(0,result.length-300)};
}
export async function readStatement(file:File,year:number,direction:'negative'|'positive'='negative'){
 const kind=file.name.split('.').pop()?.toLowerCase()||'';
 if(file.size>8*1024*1024)throw new Error('Envie um extrato de até 8 MB.');
 if(kind==='pdf'){
  const pdfjs=await import('pdfjs-dist');pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const task=pdfjs.getDocument({data:new Uint8Array(await file.arrayBuffer())});const doc=await task.promise;
  let text='';
  try{if(doc.numPages>35)throw new Error('Envie um PDF com até 35 páginas.');for(let p=1;p<=doc.numPages;p++){const page=await doc.getPage(p);const content=await page.getTextContent();let y:number|null=null;for(const item of content.items){if(!('str'in item))continue;const current=item.transform[5];if(y!==null&&Math.abs(y-current)>4)text+='\n';text+=item.str+' ';y=current;}text+='\n';}}finally{await task.destroy();}
  return parseStatement(text,'text',year,direction);
 }
 if(!['csv','ofx','txt'].includes(kind))throw new Error('Use CSV, OFX ou PDF com texto selecionável. Fotos podem ser anexadas a um gasto manual.');
 return parseStatement(await file.text(),kind,year,direction);
}
