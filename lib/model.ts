export const categories = ['Alimentação','Transporte','Estudos','Saúde','Compras','Lazer','Outros'] as const;
export type Category = typeof categories[number];
export type Status = 'review'|'approved'|'paid'|'rejected';
export type Member = {user_id:string; name:string; role:'parent'|'child'; email?:string};
export type Expense = {id:string; user_id:string; description:string; amount:number; date:string; category:Category; status:Status; note:string; receipt_path?:string|null; receipt_name?:string|null; created_at?:string; review_note?:string|null};
export type FamilyData = {family:{id:string;name:string;creator_id:string}; me:Member; members:Member[]; expenses:Expense[]};
export const statusLabel:Record<Status,string> = {review:'A revisar',approved:'A pagar',paid:'Pago',rejected:'Não aprovado'};
export const money=(n:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(n/100);
export function categorize(description:string):Category|'' {
 const s=description.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(uber|99|taxi|onibus|metro|transporte|estacionamento|combustivel|posto|pedagio|cabify)\b/.test(s))return 'Transporte';
 if(/\b(ifood|restaurante|mercado|supermercado|padaria|lanchonete|lanche|pizzaria|pizza|burger|cafe|cafeteria|alimentacao|mcdonald|rappi|subway|assai|condor|muffato)\b/.test(s))return 'Alimentação';
 if(/\b(farmacia|drogaria|hospital|clinica|consulta|medico|dentista|saude|panvel|droga raia)\b/.test(s))return 'Saúde';
 if(/\b(puc|pucpr|faculdade|curso|livraria|papelaria|xerox|copiadora|udemy|alura|mensalidade escolar)\b/.test(s))return 'Estudos';
 if(/\b(cinema|ingresso|teatro|netflix|spotify|parque|jogo|steam)\b/.test(s))return 'Lazer';
 return '';
}
export function amountCents(v:string):number {
 let s=v.trim().replace(/R\$|\s/g,'');
 if(s.includes(',')){if(s.lastIndexOf(',')>s.lastIndexOf('.'))s=s.replace(/\./g,'').replace(',','.');else s=s.replace(/,/g,'');}
 if(!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(s))return 0;
 const n=Number(s);return Number.isFinite(n)?Math.round(n*100):0;
}
export function localDate(){ const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
