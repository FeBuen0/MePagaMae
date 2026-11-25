import {amountCents,categorize,Category} from './model';
export type Draft={description:string; amount:number; date:string; category:Category|''; include:boolean; guessed:boolean};
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
export function parseStatement(text:string,kind:string,year:number,direction:'negative'|'positive'='negative'):{rows:Draft[];skipped:number} {
 const result:Draft[]=[];let skipped=0;
 if(kind==='ofx'||text.includes('<STMTTRN>')){
  for(const block of text.split(/<STMTTRN>/i).slice(1)){const field=(k:string)=>block.match(new RegExp('<'+k+'>([^<\\r\\n]+)','i'))?.[1]?.trim()||'';const amount=amountCents(field('TRNAMT'));if(amount>=0){skipped++;continue;}const dt=dateValue(field('DTPOSTED'),year);const r=dt&&row(field('MEMO')||field('NAME'),amount,dt);if(r)result.push(r);else skipped++;}
 } else if(kind==='csv'){
  const first=text.split(/\r?\n/)[0]||'';const sep=first.includes(';')?';':first.includes('\t')?'\t':',';const records=splitCSV(text.replace(/^\uFEFF/,''),sep);if(records.length<2)return {rows:[],skipped:0};
  const head=records[0].map(x=>x.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim());
  const di=head.findIndex(x=>/^(data|date|dt|data.*compra|data.*lancamento)/.test(x));
  const ni=head.findIndex(x=>/descricao|description|title|historico|estabelecimento|memo|lancamento/.test(x));
  const ai=head.findIndex(x=>/^(valor|amount|value|saida|debito|valor.*compra)/.test(x));
  if(di<0||ni<0||ai<0)throw new Error('O CSV precisa ter colunas de data, descrição e valor. Ex.: data;descrição;valor');
  const debitOnly=/saida|debito/.test(head[ai]);
  for(const cells of records.slice(1)){const amount=amountCents(cells[ai]||'');const description=cells[ni]||'';if(((direction==='negative'?amount>=0:amount<0)&&!debitOnly)||/saldo|pagamento.*fatura|rendimento|estorno|recebido|credito em conta/i.test(description)){skipped++;continue;}const dt=dateValue(cells[di]||'',year);const r=dt&&row(description,amount,dt);if(r)result.push(r);else skipped++;}
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
