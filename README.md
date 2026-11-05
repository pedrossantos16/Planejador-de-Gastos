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
- A contingência é uma parcela protegida calculada sobre o custo total incluído; continua sendo parte do saldo, sem virar pagamento. Em projetos novos ela usa uma **data-alvo** editável (etapa 4): antes dela mostra-se a reserva em formação e o valor faltante; a partir dela verifica-se se a reserva se mantém após os pagamentos. Déficit de caixa (saldo negativo) e insuficiência de contingência são diagnósticos distintos. A regra é versionada (`ruleSchemaVersion`, `contingencyRule`): projetos da versão publicada (sem marcador) usam a reserva integral desde o mês 0; projetos com o marcador de compilação intermediária usam a regra do primeiro desembolso. Como a origem não é comprovável, esses projetos ficam sinalizados para revisão e o diagnóstico não muda até o usuário confirmar a migração para a data-alvo, vendo o antes/depois.
- Quitação: compra marcada como paga exige confirmação. "Declarada, data desconhecida" é diferente de "não confirmada"; recusar não confirma, e a análise fica preliminar (dados insuficientes) até a confirmação. Quitações históricas não são descontadas novamente do saldo inicial e não exibem data técnica.
- Exportações: XLSX (valores calculados, sem fórmulas) e PDF (prévia de impressão) trazem regra, percentual e valor da reserva, data-alvo, diagnósticos de caixa e de contingência e pendências, a partir do mesmo resultado da tela.
- Pagamentos automáticos são marcados como vinculados à entrega. Ao mudar a entrega, só pagamentos futuros, não quitados e vinculados são deslocados, mediante confirmação; parcelas negociadas, pagamentos realizados e dados antigos sem vínculo identificado nunca são alterados automaticamente.
- Compra marcada como paga sem histórico fica registrada como quitação declarada/importada, com data não informada, e é listada para confirmação. Salvar de novo o item não cria outra quitação; despesas acessórias pendentes são preservadas.
- Itens comprado/entregue/instalado e contratado/pago parcialmente têm preço fechado: não recebem reajuste, a compra principal é tratada como paga e parcelas pendentes (frete, montagem, instalação) permanecem no fluxo mesmo se o escopo mudar. Marcar um item como comprado pede confirmação.
- Se os dados forem inválidos (por exemplo, mudança antes das chaves), o resultado anterior é descartado e as exportações analíticas ficam bloqueadas até corrigir; o backup JSON continua disponível.
- Cada hipótese do painel de riscos usa a mesma regra de viabilidade do plano; dados insuficientes aparecem como "não avaliável".
- Prévia PDF abre uma janela de impressão; escolha **Salvar como PDF** no diálogo do navegador. XLSX contém valores calculados, não fórmulas vivas; alterações na planilha não recalculam o site.

## Planejamento residencial — Fase 1

- A entrada começa pelo imóvel e pelas funções desejadas. `goalImportance` registra a importância declarada pelo usuário; `needCriticality` é uma derivação explícita, revisável e separada da prioridade financeira. Estilo, até três imagens locais e preferências também são salvos no projeto.
- O planejador sugere necessidades sem presumir produtos ou preços. Cada sugestão pode ser descartada ou adicionada manualmente ao controle financeiro; itens adicionados começam com preço pendente e não são tratados como custo zero.
- Sugestões não escolhem estratégia de compra: entram como `auto` com `strategyStatus: pending_research`. Estratégias anteriores, como `ready_made`, continuam válidas.
- O texto de móveis existentes gera candidatos estruturados, mas só um candidato confirmado e marcado para reaproveitamento pode suprimir uma necessidade de categoria compatível. Correspondência genérica de palavras não descarta móveis.
- As medidas manuais usam centímetros e aceitam múltiplas portas e janelas, elementos fixos, bancadas, pilares, shafts, equipamentos, zonas de circulação e pontos hidráulicos, elétricos e de gás. Projetos antigos preservam portas, janelas e obstáculos durante a migração.
- A planta considera zonas de uso, acesso lateral desejável para camas, aberturas, alturas configuradas para janelas e grupos funcionais (refeições, trabalho, dormitório e TV). Conflitos entre home office e hóspedes podem apresentar até três alternativas e seus trade-offs. A ausência de colisão não basta: layout incompleto ou corredor bloqueado é sinalizado.
- `catalogEnvelope` descreve faixas típicas; cada posicionamento gera um `layoutEnvelope` contextual. Uma futura busca de produtos deverá usar o envelope do layout, não apenas a faixa típica.
- Todas as dimensões e folgas são heurísticas com fonte/tipo/confiança baixa, não normas técnicas. Confirme medidas no imóvel e no produto. Interpretação automática de plantas, pesquisa real de produtos, integração externa e otimização financeira automática não foram iniciadas.

## Limitações atuais

O fluxo principal de persistência, cálculo mensal, edição preservadora de pagamentos, importação segura e os módulos iniciais de necessidades/geometria estão cobertos por testes. Comparações com cotações alternativas verificadas, editor completo de pagamentos/cancelamentos, planejamento detalhado de obrigações por período e relatórios executivos/para fornecedores ainda precisam ser implementados antes de tratar a análise como uma recomendação financeira completa.
