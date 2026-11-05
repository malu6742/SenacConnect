# Senac Connect: protótipo de controle de entrada e saída

Protótipo apenas de front-end (HTML, CSS e JavaScript puro), com dados fictícios. Não há back-end, banco de dados, autenticação real nem integração com catracas.

> **Aviso:** o login é só uma simulação. As credenciais estão no código-fonte e os dados ficam no `localStorage` do navegador. Não use este protótipo para proteger dados de pessoas.

## Como abrir

Abra `index.html` no navegador. Também é possível servir a pasta com um servidor estático, por exemplo `python3 -m http.server`.

## Contas fictícias

| Perfil | E-mail | Senha | Alunos vinculados |
|---|---|---|---|
| Institucional | secretaria@demo.senac.br | senac123 | todos |
| Responsável | maria@demo.senac.br | demo123 | Paulo Mateus, Laura Silva |
| Responsável | carlos@demo.senac.br | demo123 | Juliana Alves |

## Roteiro de demonstração (cerca de 5 minutos)

1. **Aba 1:** entre como *Institucional*. **Aba 2:** entre como *Maria* (a sessão fica em `sessionStorage`, então cada aba mantém o seu perfil).
2. Na aba 2, abra **Solicitar liberação** e peça uma saída do Paulo para o próximo dia útil, às 09:00.
3. A aba 1 exibe o aviso "Nova solicitação". Em **Solicitações de saída**, aprove o pedido (botão verde) ou recuse (botão vermelho, que pede justificativa).
4. A aba 2 recebe a notificação e o status muda para *Aprovada* ou *Recusada*.
5. Na aba 1, abra **Catraca (simulação)**: selecione o Paulo, clique em *Simular identificação*, registre a **entrada** às 07:00 da data escolhida e depois a **saída** às 08:45. O resultado é **Saída autorizada**.
6. Repita com outro aluno sem liberação (por exemplo, Lucas, saída às 09:00): o resultado é **Saída sem liberação**. O alerta aparece no painel institucional e a ocorrência é notificada ao responsável.
7. Use **Restaurar dados fictícios** no menu para recomeçar.

## Regras simuladas

- Saída **depois do fim do turno** → *Saída regular* (não precisa de liberação).
- Saída **antes do fim do turno** com liberação aprovada para o mesmo dia, a partir de 30 minutos antes do horário pedido → *Saída autorizada*. A liberação é marcada como utilizada.
- Saída **antes do fim do turno** sem liberação válida → *Saída sem liberação*, com alerta e notificação.
- A catraca não aceita saída sem entrada aberta, duas entradas seguidas nem eventos fora da ordem cronológica.

Turnos: Informática (manhã, 07:00–11:30), Administração (tarde, 13:00–17:30), Enfermagem (noite, 18:30–22:00).

## Arquivos

| Arquivo | Função |
|---|---|
| `index.html` | Login com os perfis Institucional e Responsável |
| `institucional.html` / `institucional.js` | Painel da escola: indicadores, histórico, solicitações, ocorrências |
| `responsavel.html` / `responsavel.js` | Painel do responsável: situação, solicitação de liberação, histórico, notificações |
| `catraca.js` | Regras e interface da catraca simulada |
| `script.js` | Dados fictícios, armazenamento, sessão simulada, tabela reutilizável e utilitários |
| `style.css` | Estilos compartilhados e responsividade |
| `chegada.html`, `saida.html`, `painel.html` | Páginas antigas, que agora apenas redirecionam |

A comunicação entre abas usa o evento `storage` do navegador. Ela funciona só entre abas do **mesmo navegador**, sem sincronização entre dispositivos ou usuários.
