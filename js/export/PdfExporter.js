import { STRATEGY_LABELS, PRIORITY_LABELS, STATUS_LABELS } from '../models/types.js';

export class PdfExporter {
  /**
   * Imprime / Salva PDF Executivo ou Detalhado
   * @param {Object} project Projeto
   * @param {Object} result Resultado financeiro
   * @param {boolean} [isDetailed=false] Se true, inclui o relatório detalhado completo
   */
  static exportToPdf(project, result, isDetailed = false) {
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    if (!printWindow) {
      alert('Por favor, permita pop-ups para gerar a impressão em PDF do relatório.');
      return;
    }

    const title = isDetailed ? 'Relatório Detalhado de Planejamento' : 'Resumo Executivo do Planejamento';
    const todayStr = new Date().toLocaleDateString('pt-BR');

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <title>${title} - ${project.name}</title>
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: system-ui, -apple-system, sans-serif; color: #1e293b; line-height: 1.5; font-size: 13px; margin: 0; padding: 0; }
          h1 { color: #0f172a; font-size: 20px; border-bottom: 2px solid #2563eb; padding-bottom: 6px; margin-bottom: 4px; }
          h2 { color: #1e293b; font-size: 15px; margin-top: 18px; margin-bottom: 8px; border-left: 3px solid #2563eb; padding-left: 8px; }
          .subtitle { color: #64748b; font-size: 12px; margin-bottom: 16px; }
          .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 16px; }
          .card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 14px; }
          .card-title { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; letter-spacing: 0.5px; }
          .card-val { font-size: 18px; font-weight: 700; color: #0f172a; margin-top: 2px; }
          table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
          th { background: #f1f5f9; text-align: left; padding: 8px; font-weight: 600; color: #334155; border-bottom: 1px solid #cbd5e1; }
          td { padding: 7px 8px; border-bottom: 1px solid #e2e8f0; }
          .text-right { text-align: right; }
          .status-tag { display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }
          .status-viable { background: #dcfce7; color: #166534; }
          .status-warning { background: #fef3c7; color: #92400e; }
          .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 10px; }
          @media print {
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="no-print" style="background:#eff6ff; padding:10px 16px; margin-bottom:16px; border-radius:6px; display:flex; justify-content:space-between; align-items:center;">
          <span>Visualização de Impressão do PDF. Clique no botão ao lado para salvar ou imprimir.</span>
          <button onclick="window.print()" style="background:#2563eb; color:#fff; border:none; padding:8px 16px; border-radius:4px; cursor:pointer; font-weight:600;">Imprimir / Salvar PDF</button>
        </div>

        <h1>${project.name}</h1>
        <div class="subtitle">${title} • Gerado em ${todayStr} • Horizonte: ${result.monthsToKeys} meses até as chaves e ${result.monthsToMove} meses até a mudança</div>

        <div class="grid">
          <div class="card">
            <div class="card-title">Investimento Total Previsto</div>
            <div class="card-val">R$ ${(result.totalIncludedCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="card">
            <div class="card-title">Status de Viabilidade</div>
            <div class="card-val" style="font-size:14px; margin-top:4px;">
              ${result.firstDeficitMonth !== null
                ? `<span class="status-tag status-warning">REQUER AJUSTES (Déficit no Mês ${result.firstDeficitMonth})</span>`
                : `<span class="status-tag status-viable">PLANO VIÁVEL E COMPATÍVEL</span>`}
            </div>
          </div>
          <div class="card">
            <div class="card-title">Escopo Essencial (Inadiável)</div>
            <div class="card-val">R$ ${(result.totalEssentialCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
          <div class="card">
            <div class="card-title">Saldo Final do Fundo de Mobília</div>
            <div class="card-val">R$ ${(result.finalBalanceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
        </div>

        <h2>Detalhamento do Investimento por Categoria</h2>
        <table>
          <thead>
            <tr>
              <th>Prioridade do Escopo</th>
              <th class="text-right">Qtd Itens</th>
              <th class="text-right">Total Investido</th>
              <th class="text-right">% do Orçamento</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Essencial para mudar</td>
              <td class="text-right">${countItemsByPriority(result, 'essential')}</td>
              <td class="text-right">R$ ${(result.totalEssentialCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td class="text-right">${calcPercent(result.totalEssentialCostCents, result.totalIncludedCostCents)}%</td>
            </tr>
            <tr>
              <td>Importante para o dia a dia</td>
              <td class="text-right">${countItemsByPriority(result, 'important')}</td>
              <td class="text-right">R$ ${(result.totalImportantCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td class="text-right">${calcPercent(result.totalImportantCostCents, result.totalIncludedCostCents)}%</td>
            </tr>
            <tr>
              <td>Opcional / Desejável</td>
              <td class="text-right">${countItemsByPriority(result, 'optional')}</td>
              <td class="text-right">R$ ${(result.totalOptionalCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
              <td class="text-right">${calcPercent(result.totalOptionalCostCents, result.totalIncludedCostCents)}%</td>
            </tr>
          </tbody>
        </table>

        <h2>Lista Principal de Itens no Plano</h2>
        <table>
          <thead>
            <tr>
              <th>Ambiente</th>
              <th>Item</th>
              <th>Estratégia</th>
              <th>Situação</th>
              <th class="text-right">Total Instalado</th>
            </tr>
          </thead>
          <tbody>
            ${(result.processedItems || [])
              .filter(i => i.scope === 'include' || i.scope === 'already_owned')
              .map(item => `
                <tr>
                  <td>${getRoomName(project, item.roomId)}</td>
                  <td><strong>${item.name}</strong></td>
                  <td>${STRATEGY_LABELS[item.strategy] || item.strategy}</td>
                  <td>${STATUS_LABELS[item.status] || item.status}</td>
                  <td class="text-right">R$ ${(item.totalInstalledCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>

        ${isDetailed ? `
          <h2>Cronograma Sintético por Trimestre</h2>
          <table>
            <thead>
              <tr>
                <th>Período</th>
                <th class="text-right">Aportes (R$)</th>
                <th class="text-right">Pagamentos (R$)</th>
                <th class="text-right">Saldo Fundo (R$)</th>
              </tr>
            </thead>
            <tbody>
              ${renderQuarterlySummary(result.monthlyLedger)}
            </tbody>
          </table>
        ` : ''}

        <div class="footer">
          "Meu Apê Planejado" • Planejamento e gestão financeira de mobília sem segredos.
        </div>
      </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
  }
}

function countItemsByPriority(result, priority) {
  return (result.processedItems || []).filter(
    i => (i.scope === 'include' || i.scope === 'already_owned') && i.priority === priority
  ).length;
}

function calcPercent(part, total) {
  if (!total || total === 0) return '0.0';
  return ((part / total) * 100).toFixed(1);
}

function getRoomName(project, roomId) {
  const r = (project.apartment.rooms || []).find(room => room.id === roomId);
  return r ? r.name : 'Ambiente';
}

function renderQuarterlySummary(ledger) {
  if (!ledger) return '';
  const rows = [];
  for (let q = 0; q < ledger.length; q += 3) {
    const slice = ledger.slice(q, q + 3);
    const aportes = slice.reduce((s, m) => s + m.plannedContributionCents, 0);
    const pagamentos = slice.reduce((s, m) => s + m.paymentsThisMonthCents, 0);
    const endBalance = slice[slice.length - 1].endBalanceCents;
    const startMonth = q;
    const endMonth = Math.min(ledger.length - 1, q + 2);

    rows.push(`
      <tr>
        <td>Mês ${startMonth} ao ${endMonth}</td>
        <td class="text-right">R$ ${(aportes / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">R$ ${(pagamentos / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
        <td class="text-right">R$ ${(endBalance / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</td>
      </tr>
    `);
  }
  return rows.join('');
}
