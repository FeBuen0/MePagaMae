'use client';
import {FormEvent,useEffect,useState} from 'react';
import {Home,ArrowRight,LoaderCircle,Eye,EyeOff} from 'lucide-react';
import {Account,authenticate,completeEmailAccount,session,signOut} from '../lib/auth';
import App from './ui';
export default function Auth(){
 const [account,setAccount]=useState<Account|null>(null),[ready,setReady]=useState(false),[create,setCreate]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[show,setShow]=useState(false),[invite,setInvite]=useState(false);
 useEffect(()=>{
  const sync=()=>setAccount(session()?.user||null);sync();setReady(true);
  setInvite(new URLSearchParams(window.location.search).has('convite'));
  window.addEventListener('mepagamae-auth',sync);window.addEventListener('storage',sync);
  return()=>{window.removeEventListener('mepagamae-auth',sync);window.removeEventListener('storage',sync)};
 },[]);
 const upgrading=!!account?.email?.endsWith('@mepagamae.invalid');
 async function submit(e:FormEvent<HTMLFormElement>){
  e.preventDefault();const f=new FormData(e.currentTarget);setBusy(true);setError('');
  const payload={email:String(f.get('email')).trim().toLowerCase(),password:String(f.get('password')),name:String(f.get('name')||'')};
  try{if(upgrading)await completeEmailAccount(payload);else await authenticate(create?'register':'login',payload)}
  catch(e){setError(e instanceof Error?e.message:'Tente novamente.')}
  finally{setBusy(false)}
 }
 if(!ready)return <div className="auth-loading"><LoaderCircle className="spin" size={24}/></div>;
 if(account&&!upgrading)return <App key={account.id} identity={account}/>;
 return <main className="auth-page">
  <div className="auth-brand"><Home size={25} strokeWidth={1.7}/>MePagaMãe</div>
  <section className="auth-card">
   <h1>{upgrading?'Atualizar acesso':create?'Criar conta':'Entrar'}</h1>
   <p>{upgrading?'Adicione seu e-mail à conta que você já usa. Sua família e seus gastos serão mantidos.':invite?'Entre ou crie sua conta para aceitar o convite.':'Os gastos da família, em um só lugar.'}</p>
   <form onSubmit={submit} key={upgrading?'upgrade':create?'signup':'login'}>
    {(create||upgrading)&&<label>Nome<input name="name" autoComplete="name" disabled={busy} defaultValue={upgrading?account?.name:''} maxLength={40} required placeholder="Como podemos chamar você?"/></label>}
    <label>E-mail<input name="email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" disabled={busy} maxLength={254} required placeholder="voce@exemplo.com"/></label>
    <label>{upgrading?'Senha atual':'Senha'}<div className="password-field">
     <input name="password" type={show?'text':'password'} disabled={busy} autoComplete={create&&!upgrading?'new-password':'current-password'} minLength={8} maxLength={128} required placeholder={create&&!upgrading?'Pelo menos 8 caracteres':'Sua senha'}/>
     <button type="button" aria-label={show?'Ocultar senha':'Mostrar senha'} onClick={()=>setShow(!show)}>{show?<EyeOff size={18}/>:<Eye size={18}/>}</button>
    </div></label>
    {error&&<div className="error-box" role="alert">{error}</div>}
    <button className="button dark full" disabled={busy}>{busy?<LoaderCircle className="spin" size={18}/>:<ArrowRight size={18}/>} {upgrading?'Salvar e continuar':create?'Criar conta':'Entrar'}</button>
   </form>
   <div className="auth-switch">{upgrading?<button disabled={busy} onClick={()=>signOut()}>Sair da conta</button>:<>{create?'Já tem uma conta?':'Primeira vez aqui?'} <button disabled={busy} onClick={()=>{setCreate(!create);setError('');setShow(false)}}>{create?'Entrar':'Criar conta'}</button></>}</div>
  </section>
  <p className="auth-footnote">Cada pessoa usa a própria conta.</p>
 </main>;
}
