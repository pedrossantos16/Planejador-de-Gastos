import { STRATEGY_LABELS, PRIORITY_LABELS, SCOPE_LABELS, STATUS_LABELS } from '../models/types.js';
import { ScenarioEngine } from '../engine/ScenarioEngine.js';
import { buildAnalysisSummary, XLSX_LIMITATION } from './AnalysisSummary.js';
import { settlementState, SETTLEMENT_STATE_LABELS } from '../models/payments.js';

export class ExcelExporter {
  /**
   * Exporta o projeto e resultado financeiro para uma planilha Excel real (.xlsx)
   */
  static exportToExcel(project, result) {
    const viability = result.viability || ScenarioEngine.evaluateViability(result);
    const analysis = buildAnalysisSummary(project, { ...result, viability });
    const activeProfile = project.budgetProfile.mode === 'detailed'
      ? project.budgetProfile.detailed
      : project.budgetProfile.simplified;
    if (typeof XLSX === 'undefined') {
      alert('A biblioteca SheetJS (XLSX) não foi carregada. Verifique sua conexão ou recursos locais.');
      return;
    }

    const wb = XLSX.utils.book_new();

    // 1. Aba: Resumo Executivo
    const summaryData = [
      ['MEU APÊ PLANEJADO - RESUMO DO PROJETO'],
      ['Projeto:', project.name || 'Meu Apê Planejado'],
      ['Tipo de dados:', project.isDemonstration ? 'DEMONSTRAÇÃO FICTÍCIA — não é pesquisa de mercado' : 'Planejamento baseado nas informações fornecidas'],
      ['Data de Exportação:', new Date().toLocaleDateString('pt-BR')],
      ['Modo de Orçamento:', project.budgetProfile.mode === 'detailed' ? 'Detalhado (conforme dados informados)' : 'Simplificado'],
      ['Data-base do planejamento:', result.baseDate],
      ['Prazo até a Entrega das Chaves:', result.monthsToKeys === null ? 'Não informado' : `${result.monthsToKeys} meses (${project.apartment.keysDate})`],
      ['Prazo até a Mudança Desejada:', result.monthsToMove === null ? 'Não informado' : `${result.monthsToMove} meses (${project.apartment.moveDate})`],
      [''],
      ['INDICADORES FINANCEIROS CHAVE', 'VALOR (R$)'],
      ['Investimento Total no Escopo Incluído', result.totalIncludedCostCents / 100],
      ['Investimento no Escopo Essencial', result.totalEssentialCostCents / 100],
      ['Investimento no Escopo Importante', result.totalImportantCostCents / 100],
      ['Investimento no Escopo Opcional', result.totalOptionalCostCents / 100],
      ['Total de Aportes Previstos no Período', result.totalContributionsCents / 100],
      ['Saldo Final Acumulado no Fundo', result.finalBalanceCents / 100],
      ['Saldo Livre após contingência', result.finalFreeBalanceCents / 100],
      ['Compromissos Futuros Pós-Mudança', result.postMoveLiabilitiesCents / 100],
      [''],
      ['DIAGNÓSTICO DE VIABILIDADE'],
      ['Status:', viability.label],
      ['Campos pendentes:', viability.missingFields.join(', ')],
      ['Primeiro Mês com Déficit:', viability.firstDeficitMonth === null ? 'Nenhum' : `Mês ${viability.firstDeficitMonth}`],
      ['Valor do Primeiro Déficit (R$):', viability.firstDeficitAmountCents / 100],
      ['Mês do Pior Déficit:', viability.worstDeficitMonth === null ? 'Nenhum' : `Mês ${viability.worstDeficitMonth}`],
      ['Déficit Máximo Registrado (R$):', viability.maxDeficitCents / 100],
      [''],
      ['CONTINGÊNCIA E PENDÊNCIAS'],
      ...analysis.rows.map(row => [row.label + ':', row.cents !== undefined ? row.cents / 100 : row.text]),
      ['Pendências que limitam a conclusão:', analysis.pending.length ? analysis.pending.join('; ') : 'Nenhuma'],
      [''],
      ['LIMITAÇÃO DO ARQUIVO', XLSX_LIMITATION]
    ];
    const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, wsSummary, 'Resumo');

    // 2. Aba: Itens por Ambiente
    const itemHeaders = [
      'Ambiente', 'Item', 'Especificação', 'Estratégia', 'Prioridade', 'Escopo',
      'Situação', 'Preço Base (R$)', 'Frete (R$)', 'Montagem (R$)', 'Instalação (R$)',
      'Custos Adicionais (R$)', 'Total Instalado (R$)', 'Mês Entrega', 'Fornecedor / Fonte', 'Grau Confiança', 'Quitação'
    ];
    const itemRows = [itemHeaders];

    (result.processedItems || []).forEach(item => {
      const roomName = getRoomName(project, item.roomId);
      itemRows.push([
        roomName,
        item.name,
        item.specification || '',
        STRATEGY_LABELS[item.strategy] || item.strategy,
        PRIORITY_LABELS[item.priority] || item.priority,
        SCOPE_LABELS[item.scope] || item.scope,
        STATUS_LABELS[item.status] || item.status,
        item.priceKnown === false ? '' : (item.basePriceCents || 0) / 100,
        (item.shippingCents || 0) / 100,
        (item.assemblyCents || 0) / 100,
        (item.installationCents || 0) / 100,
        (item.additionalCostsCents || 0) / 100,
        item.priceKnown === false ? '' : (item.totalInstalledCostCents || 0) / 100,
        item.deliveryMonthIndex !== undefined ? `Mês ${item.deliveryMonthIndex}` : 'N/A',
        item.supplier || '',
        item.confidenceLevel || 'medium',
        SETTLEMENT_STATE_LABELS[settlementState(item)] || ''
      ]);
    });
    const wsItems = XLSX.utils.aoa_to_sheet(itemRows);
    XLSX.utils.book_append_sheet(wb, wsItems, 'Itens');

    // 3. Aba: Fluxo Mensal
    const ledgerHeaders = [
      'Mês', 'Marco', 'Saldo Inicial (R$)', 'Aporte Máximo (R$)', 'Aporte Planejado (R$)',
      'Entradas Extras (R$)', 'Rendimentos (R$)', 'Pagamentos do Projeto (R$)', 'Saldo Final Fundo (R$)', 'Déficit Orçamento Familiar (R$)'
    ];
    const ledgerRows = [ledgerHeaders];

    (result.monthlyLedger || []).forEach(row => {
      let marco = '';
      if (row.isKeysMonth && row.isMoveMonth) marco = 'Chaves & Mudança';
      else if (row.isKeysMonth) marco = 'Entrega das Chaves';
      else if (row.isMoveMonth) marco = 'Data da Mudança';

      ledgerRows.push([
        `Mês ${row.monthIndex}`,
        marco,
        row.startBalanceCents / 100,
        row.maxContributionCents / 100,
        row.plannedContributionCents / 100,
        row.extraIncomeMonthCents / 100,
        row.yieldCents / 100,
        row.paymentsThisMonthCents / 100,
        row.endBalanceCents / 100,
        row.familyBudgetDeficitCents / 100
      ]);
    });
    const wsLedger = XLSX.utils.aoa_to_sheet(ledgerRows);
    XLSX.utils.book_append_sheet(wb, wsLedger, 'Fluxo Mensal');

    // 4. Aba: Compromissos Futuros
    const futureHeaders = ['Mês', 'Item', 'Descrição da Parcela', 'Valor (R$)', 'Status'];
    const futureRows = [futureHeaders];

    (result.monthlyLedger || []).forEach(row => {
      if (row.monthIndex > result.monthsToMove && row.paymentDetails && row.paymentDetails.length > 0) {
        row.paymentDetails.forEach(pay => {
          futureRows.push([
            `Mês ${row.monthIndex}`,
            pay.itemName,
            pay.description,
            pay.amountCents / 100,
            'Pendente pós-mudança'
          ]);
        });
      }
    });
    const wsFuture = XLSX.utils.aoa_to_sheet(futureRows);
    XLSX.utils.book_append_sheet(wb, wsFuture, 'Compromissos Futuros');

    // 5. Aba: Premissas e Fontes
    const assumptionsData = [
      ['PREMISSAS ADOTADAS NO PLANEJAMENTO'],
      ['Taxa Anual de Inflação (g):', `${(project.assumptions.annualInflationRate || 0) * 100}% a.a.`],
      ['Aplicar Inflação a Itens Não Contratados:', project.assumptions.applyInflationToUncontracted ? 'Sim' : 'Não'],
      ['Taxa de Rendimento do Fundo:', `${(project.assumptions.yieldRateAnnual || 0) * 100}% a.a.`],
      ['Margem de Contingência:', `${(project.assumptions.contingencyPercent || 0) * 100}%`],
      ['Regra de contingência:', analysis.rows[0].text],
      ['Data-alvo da contingência:', analysis.rows.find(row => row.label === 'Data-alvo da contingência').text],
      ['Saldo Inicial do Projeto (R$):', activeProfile.initialBalanceCents === null ? '' : (activeProfile.initialBalanceCents || 0) / 100],
      ['Teto de Aporte Mensal (R$):', activeProfile.monthlyCapCents === null ? '' : (activeProfile.monthlyCapCents || 0) / 100]
    ];
    const wsAssumptions = XLSX.utils.aoa_to_sheet(assumptionsData);
    XLSX.utils.book_append_sheet(wb, wsAssumptions, 'Premissas');

    // Gerar o arquivo e realizar o download
    const demoPrefix = project.isDemonstration ? 'Demonstracao_Ficticia_' : '';
    const filename = `${demoPrefix}Planejamento_Ape_${sanitizeFileName(project.name)}_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  }
}

function getRoomName(project, roomId) {
  const r = (project.apartment.rooms || []).find(room => room.id === roomId);
  return r ? r.name : 'Ambiente';
}

function sanitizeFileName(name) {
  return (name || 'projeto').replace(/[^a-zA-Z0-9_-]/g, '_');
}
