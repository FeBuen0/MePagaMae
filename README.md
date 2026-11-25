# MePagaMãe

Controle de reembolsos da família. Interface simples para celular: os filhos enviam e a mãe confere, aprova e registra o pagamento.

## Usar

1. Crie uma conta com nome, usuário e senha (mínimo de 8 caracteres).
2. Crie a família como filho ou responsável. Em **Família → Adicionar pessoa**, gere um link e envie para a família.
3. Cada convidado cria a própria conta. O convite dos filhos aceita até 10 pessoas; o convite do responsável, uma pessoa. Expiram em 7 dias. Há um responsável por família.
4. Envie CSV, OFX ou PDF com texto selecionável, ou adicione um gasto. Confira valores, datas e categorias antes do envio.
5. O responsável aprova os gastos. Depois de transferir o dinheiro pelo banco, marca **Já paguei**.

As senhas são gerenciadas pelo Supabase Auth. O usuário é convertido em um identificador interno `usuario@mepagamae.invalid`; não é um e-mail real, não há envio de mensagens e o acesso não exige cadastrar e-mails da família. Recuperação por e-mail ainda não está disponível.

## Gemini

Em **Família → Ativar Gemini**, quem criou a família ou o responsável informa uma chave obtida no Google AI Studio. A chave é testada e guardada no Supabase Vault, criptografada e sem retorno ao navegador. Cada família usa sua própria chave.

**Identificar com Gemini** envia somente as descrições. Sugere o estabelecimento e uma categoria; não altera valores, datas, autoria ou situação. A descrição original é preservada. Sugestões com confiança inferior a 0,8 deixam a categoria para a pessoa escolher. Toda importação exige revisão. PDF escaneado e OCR não estão incluídos.

Modelo: `gemini-3.5-flash-lite`, via Interactions API, revisão `2026-05-20`. Limite do aplicativo: 50 chamadas por família por dia, incluindo testes de chave. A API também tem quotas e cobrança próprias da conta Google. O site continua permitindo categorização manual se a API falhar.

## Executar

```sh
npm ci
npm run dev
npm run check
npm run build
```

O worker PDF é copiado da versão fixada de `pdfjs-dist` durante dev/build. Arquivos e pastas de build, ambiente e dependências não devem ser publicados no GitHub.

## Configuração do servidor

1. Aplique as migrações de `supabase/migrations` em ordem. Elas configuram tabelas, permissões, convites, pagamentos, Vault e limites.
2. Gere um segredo aleatório de pelo menos 32 bytes. Guarde o valor somente no segredo de produção `FAMILY_API_SECRET`. Configure seu SHA-256 no `APP_SECRET_SHA256` da função.
3. Publique `supabase/functions/family-api/index.ts` como `family-api`. `verify_jwt=false` desliga a verificação legada do gateway; o código exige o segredo do servidor e valida o JWT real do usuário com `auth.getUser` em todas as operações protegidas.
4. Configure `SUPABASE_EDGE_URL=https://PROJECT.supabase.co/functions/v1/family-api` e `FAMILY_API_SECRET` no ambiente de produção. Nunca publique o segredo ou a service role key no código.
5. Para provisionar uma chave já guardada no servidor, configure os segredos `GEMINI_API_KEY` e `GEMINI_FAMILY_ID` com o UUID exato da família do dono. No próximo carregamento por quem criou a família ou pelo responsável, ela é movida para o Vault. Remova esses dois segredos após concluir. Sem um UUID configurado, nenhuma família pode usar a chave do dono.
6. Publique o frontend. A página de entrada deve ser acessível aos convidados. Os dados permanecem privados: todo acesso passa pela API autenticada, com verificação de família e perfil no servidor. `/api/health` retorna somente o estado da conexão.

Tabelas e funções não dão acesso direto a `anon` ou `authenticated`. O bucket `cec-receipts` é privado; comprovantes só são disponibilizados temporariamente ao dono ou responsável da mesma família. A API protege o cadastro/login por limite de tentativas, usa valores inteiros em centavos e evita submissões e pagamentos repetidos. Não há pagamentos bancários automáticos.

O repositório GitHub e a hospedagem Sites têm fluxos de publicação separados; alterações no GitHub não publicam automaticamente o site.
