import App from './ui';
import { getChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const user = await getChatGPTUser();
  return <App identity={user ? { id:user.userId, name:user.displayName, email:user.email } : null}/>;
}
