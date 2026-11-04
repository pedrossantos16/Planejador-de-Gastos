# Meu Apê Planejado

Aplicação estática em HTML, CSS e JavaScript ES modules, compatível com publicação em subdiretório do GitHub Pages.

## Desenvolvimento e testes

- Não há dependências de build ou runtime da aplicação.
- Com Node.js 20 instalado, execute `npm test` para rodar os testes de motor, persistência e fluxo de itens.
- SheetJS 0.20.3 é carregado de um CDN para gerar XLSX. Sem rede, o restante do planejador continua disponível; a exportação XLSX informa que a biblioteca não foi carregada.

## Dados, salvamento e recuperação

- Os projetos são armazenados somente no `localStorage` do navegador deste dispositivo; não há sincronização com nuvem nem envio de dados financeiros.
- Em computador compartilhado, outras pessoas que usem o mesmo perfil do navegador podem acessar esses dados. Use **Backup JSON** antes de limpar os dados do navegador ou trocar de dispositivo.
- Demonstrações são fictícias, permanecem em memória e não substituem o projeto salvo.
- Importar um JSON valida o conteúdo antes de mostrar uma prévia e pedir confirmação. O projeto atual é baixado como backup antes da substituição.
- Um JSON corrompido ou com versão incompatível não é sobrescrito automaticamente. **Backup JSON** exporta o conteúdo original para recuperação; crie um novo projeto apenas depois de salvar essa cópia.
- O backup JSON é um arquivo local, não uma cópia automática nem sincronização.

## Datas e cálculos

- A data-base fica registrada no projeto. Mês 0 representa o saldo inicial; aportes mensais começam no mês 1.
- Os pagamentos mantêm seus meses originais e a projeção se estende até o último compromisso, limitada a 100 anos para evitar entrada malformada.
- Valores monetários são centavos inteiros. Campo vazio representa dado desconhecido; zero informado representa zero.
- A contingência é uma parcela protegida calculada sobre o custo total incluído; continua sendo parte do saldo, sem virar pagamento. Em projetos novos ela usa uma **data-alvo** editável (etapa 4): antes dela mostra-se a reserva em formação e o valor faltante; a partir dela verifica-se se a reserva se mantém após os pagamentos. Déficit de caixa (saldo negativo) e insuficiência de contingência são diagnósticos distintos. Projetos salvos antes desta regra são migrados no modo **regra anterior** (reserva integral exigida desde o primeiro desembolso) até o usuário confirmar a nova configuração.
- Pagamentos automáticos são marcados como vinculados à entrega. Ao mudar a entrega, só pagamentos futuros, não quitados e vinculados são deslocados, mediante confirmação; parcelas negociadas, pagamentos realizados e dados antigos sem vínculo identificado nunca são alterados automaticamente.
- Compra marcada como paga sem histórico fica registrada como quitação declarada/importada, com data não informada, e é listada para confirmação. Salvar de novo o item não cria outra quitação; despesas acessórias pendentes são preservadas.
- Itens comprado/entregue/instalado e contratado/pago parcialmente têm preço fechado: não recebem reajuste, a compra principal é tratada como paga e parcelas pendentes (frete, montagem, instalação) permanecem no fluxo mesmo se o escopo mudar. Marcar um item como comprado pede confirmação.
- Se os dados forem inválidos (por exemplo, mudança antes das chaves), o resultado anterior é descartado e as exportações analíticas ficam bloqueadas até corrigir; o backup JSON continua disponível.
- Cada hipótese do painel de riscos usa a mesma regra de viabilidade do plano; dados insuficientes aparecem como "não avaliável".
- Prévia PDF abre uma janela de impressão; escolha **Salvar como PDF** no diálogo do navegador. XLSX contém valores calculados, não fórmulas vivas; alterações na planilha não recalculam o site.

## Limitações atuais

O fluxo principal de persistência, cálculo mensal, edição preservadora de pagamentos e importação segura está coberto por testes. Comparações com cotações alternativas verificadas, editor completo de pagamentos/cancelamentos, planejamento detalhado de obrigações por período e relatórios executivos/para fornecedores ainda precisam ser implementados antes de tratar a análise como uma recomendação financeira completa.
