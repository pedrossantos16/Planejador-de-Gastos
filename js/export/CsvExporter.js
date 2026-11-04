import { STRATEGY_LABELS, PRIORITY_LABELS, SCOPE_LABELS, STATUS_LABELS } from '../models/types.js';

export class CsvExporter {
  /**
   * Exporta a lista de itens para arquivo CSV no formato padrão brasileiro (separador ;)
   */
  static exportItemsCsv(project, result) {
    const headers = [
      'Ambiente', 'Item', 'Especificacao', 'Estrategia', 'Prioridade', 'Escopo',
      'Situacao', 'PrecoBase_BRL', 'Frete_BRL', 'Montagem_BRL', 'Instalacao_BRL',
      'CustosAdicionais_BRL', 'TotalInstalado_BRL', 'MesEntrega', 'Fornecedor'
    ];

    const lines = [headers.join(';')];

    (result.processedItems || []).forEach(item => {
      const roomName = getRoomName(project, item.roomId);
      const row = [
        escapeCsv(roomName),
        escapeCsv(item.name),
        escapeCsv(item.specification || ''),
        escapeCsv(STRATEGY_LABELS[item.strategy] || item.strategy),
        escapeCsv(PRIORITY_LABELS[item.priority] || item.priority),
        escapeCsv(SCOPE_LABELS[item.scope] || item.scope),
        escapeCsv(STATUS_LABELS[item.status] || item.status),
        item.priceKnown === false ? '' : formatNumberBrl((item.basePriceCents || 0) / 100),
        formatNumberBrl((item.shippingCents || 0) / 100),
        formatNumberBrl((item.assemblyCents || 0) / 100),
        formatNumberBrl((item.installationCents || 0) / 100),
        formatNumberBrl((item.additionalCostsCents || 0) / 100),
        item.priceKnown === false ? '' : formatNumberBrl((item.totalInstalledCostCents || 0) / 100),
        `Mes ${item.deliveryMonthIndex !== undefined ? item.deliveryMonthIndex : 'N/A'}`,
        escapeCsv(item.supplier || '')
      ];
      lines.push(row.join(';'));
    });

    const demoPrefix = project.isDemonstration ? 'Demonstracao_Ficticia_' : '';
    downloadCsvFile(lines.join('\r\n'), `${demoPrefix}Itens_Ape_${sanitizeFileName(project.name)}.csv`);
  }

  /**
   * Exporta o fluxo financeiro mensal para CSV
   */
  static exportLedgerCsv(project, result) {
    const headers = [
      'Mes', 'Marco', 'SaldoInicial_BRL', 'AporteMaximo_BRL', 'AportePlanejado_BRL',
      'EntradasExtras_BRL', 'Rendimentos_BRL', 'PagamentosProjeto_BRL',
      'SaldoFinalFundo_BRL', 'SaldoLivreAposContingencia_BRL', 'DeficitOrcamentoFamiliar_BRL'
    ];

    const lines = [headers.join(';')];

    (result.monthlyLedger || []).forEach(row => {
      let marco = '';
      if (row.isKeysMonth && row.isMoveMonth) marco = 'Chaves & Mudanca';
      else if (row.isKeysMonth) marco = 'Entrega Chaves';
      else if (row.isMoveMonth) marco = 'Mudanca';

      const line = [
        `Mes ${row.monthIndex}`,
        escapeCsv(marco),
        formatNumberBrl(row.startBalanceCents / 100),
        formatNumberBrl(row.maxContributionCents / 100),
        formatNumberBrl(row.plannedContributionCents / 100),
        formatNumberBrl(row.extraIncomeMonthCents / 100),
        formatNumberBrl(row.yieldCents / 100),
        formatNumberBrl(row.paymentsThisMonthCents / 100),
        formatNumberBrl(row.endBalanceCents / 100),
        formatNumberBrl(row.freeBalanceCents / 100),
        formatNumberBrl(row.familyBudgetDeficitCents / 100)
      ];
      lines.push(line.join(';'));
    });

    const demoPrefix = project.isDemonstration ? 'Demonstracao_Ficticia_' : '';
    downloadCsvFile(lines.join('\r\n'), `${demoPrefix}Fluxo_Mensal_Ape_${sanitizeFileName(project.name)}.csv`);
  }
}

function escapeCsv(str) {
  if (str === null || str === undefined || str === '') return '""';
  const value = String(str);
  const safe = /^[\s]*[=+\-@]/.test(value) ? `'${value}` : value;
  const clean = safe.replace(/"/g, '""');
  return `"${clean}"`;
}

function formatNumberBrl(val) {
  return String((val || 0).toFixed(2)).replace('.', ',');
}

function downloadCsvFile(content, fileName) {
  // UTF-8 BOM (\uFEFF) para garantir caracteres acentuados no Excel PT-BR
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function getRoomName(project, roomId) {
  const r = (project.apartment.rooms || []).find(room => room.id === roomId);
  return r ? r.name : 'Ambiente';
}

function sanitizeFileName(name) {
  return (name || 'projeto').replace(/[^a-zA-Z0-9_-]/g, '_');
}
