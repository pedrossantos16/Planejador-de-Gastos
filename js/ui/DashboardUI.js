import { VIABILITY_STATUS, VIABILITY_LABELS } from '../engine/ScenarioEngine.js';

export class DashboardUI {
  /**
   * Renderiza todos os painéis e tabelas da Etapa 5 (Meu Plano, Comparação e Arquivos)
   */
  static render(project, result, scenarios, recommendation) {
    this.renderExecutiveBanner(project, result, recommendation);
    this.renderScenariosGrid(scenarios);
    this.renderRecommendationsList(recommendation);
    this.renderLedgerTable(result);
  }

  /**
   * Renderiza o banner executivo de diagnóstico
   */
  static renderExecutiveBanner(project, result, recommendation) {
    const banner = document.getElementById('resultsBanner');
    if (!banner) return;

    const viability = recommendation.viabilityStatus;
    let badgeClass = 'badge-viable';
    if (viability === VIABILITY_STATUS.REQUIRES_ADJUSTMENTS) badgeClass = 'badge-danger';
    else if (viability === VIABILITY_STATUS.ESSENTIAL_ONLY) badgeClass = 'badge-warning';
    else if (viability === VIABILITY_STATUS.INSUFFICIENT_DATA) badgeClass = 'badge-warning';

    const totalBrl = (result.totalIncludedCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const essentialBrl = (result.totalEssentialCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    const finalBalanceBrl = (result.finalFreeBalanceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    banner.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; flex-wrap:wrap; gap:12px;">
        <div>
          ${project.isDemonstration ? '<span class="badge badge-warning">DEMONSTRAÇÃO FICTÍCIA</span>' : ''}
          <span class="badge ${badgeClass}" style="font-size:13px; margin-bottom:8px;">${escapeHtml(recommendation.viabilityLabel)}</span>
          <h2 style="margin-top:4px;">${escapeHtml(recommendation.headline)}</h2>
          <p style="color:#cbd5e1; max-width:800px; font-size:14px; margin-top:4px;">${escapeHtml(recommendation.summaryText)}</p>
        </div>
      </div>

      <div class="results-summary-grid">
        <div class="metric-card">
          <div class="metric-label">Investimento Total Incluído</div>
          <div class="metric-val">R$ ${totalBrl}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Escopo Essencial (Inadiável)</div>
          <div class="metric-val">R$ ${essentialBrl}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Saldo Livre após contingência</div>
          <div class="metric-val">R$ ${finalBalanceBrl}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Primeiro déficit</div>
          <div class="metric-val">${result.firstDeficitMonth !== null ? `Mês ${result.firstDeficitMonth} — R$ ${(Math.max(0, -result.monthlyLedger[result.firstDeficitMonth].freeBalanceCents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Nenhum'}</div>
        </div>
        <div class="metric-card">
          <div class="metric-label">Pior déficit</div>
          <div class="metric-val">${result.worstDeficitMonth !== null ? `Mês ${result.worstDeficitMonth} — R$ ${(result.maxDeficitCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Nenhum'}</div>
        </div>
      </div>
    `;
  }

  /**
   * Renderiza o grid comparativo dos 3 cenários
   */
  static renderScenariosGrid(scenarios) {
    const grid = document.getElementById('scenariosGrid');
    if (!grid || !scenarios) return;

    const list = Object.values(scenarios);

    grid.innerHTML = list.map(sc => {
      const res = sc.result;
      const status = sc.viability?.status ?? sc.status;
      const isViable = status === VIABILITY_STATUS.VIABLE || status === VIABILITY_STATUS.ESSENTIAL_ONLY;
      const totalBrl = (res.totalIncludedCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const balanceBrl = (res.finalFreeBalanceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const badgeClass = status === VIABILITY_STATUS.REQUIRES_ADJUSTMENTS
        ? 'badge-danger'
        : status === VIABILITY_STATUS.INSUFFICIENT_DATA ? 'badge-warning' : 'badge-viable';

      return `
        <div class="scenario-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <h4 style="font-size:16px; color:#0f172a;">${escapeHtml(sc.name)}</h4>
            <span class="badge ${badgeClass}">${escapeHtml(VIABILITY_LABELS[status] || status)}</span>
          </div>
          <p style="font-size:13px; color:#64748b; margin-bottom:12px; min-height:40px;">${escapeHtml(sc.description)}</p>
          <div style="border-top:1px solid #e2e8f0; padding-top:10px; font-size:13px;">
            <div><strong>Custo Total:</strong> R$ ${totalBrl}</div>
            <div><strong>Saldo Final:</strong> R$ ${balanceBrl}</div>
            <div><strong>Primeiro déficit:</strong> ${res.firstDeficitMonth !== null ? `Mês ${res.firstDeficitMonth}` : 'Nenhum'}</div>
            <div><strong>Dados:</strong> ${res.hasCompleteData ? 'Informados' : 'Análise preliminar'}</div>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * Renderiza as 3 propostas de mudança prioritárias
   */
  static renderRecommendationsList(recommendation) {
    const container = document.getElementById('recommendationsContainer');
    if (!container) return;

    const changes = recommendation.actionableChanges || [];

    if (changes.length === 0) {
      container.innerHTML = `
        <div class="card" style="padding:16px; color:#166534; background-color:#f0fdf4; border-color:#86efac;">
          Sem sugestão automática baseada em preços verificáveis. Revise as cotações e os meses críticos antes de contratar.
        </div>
      `;
      return;
    }

    container.innerHTML = changes.map(ch => `
      <div class="card" style="border-left:4px solid #2563eb; margin-bottom:12px; padding:16px;">
        <h4 style="font-size:15px; color:#0f172a; margin-bottom:4px;">${escapeHtml(ch.title)}</h4>
        <p style="font-size:14px; color:#334155;">${escapeHtml(ch.whatToChange)}</p>
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:10px; margin-top:10px; font-size:13px; background:#f8fafc; padding:10px; border-radius:6px;">
          <div><strong>Impacto Financeiro:</strong> ${escapeHtml(ch.formattedSavings)}</div>
          <div><strong>Efeito no Mês Crítico:</strong> ${escapeHtml(ch.effectOnCriticalMonth)}</div>
          <div><strong>Trade-off:</strong> ${escapeHtml(ch.tradeOff)}</div>
        </div>
      </div>
    `).join('');
  }

  /**
   * Renderiza a tabela de fluxo mensal de caixa (Ledger)
   */
  static renderLedgerTable(result) {
    const tbody = document.getElementById('ledgerTableBody');
    if (!tbody || !result || !result.monthlyLedger) return;

    tbody.innerHTML = result.monthlyLedger.map(row => {
      let marcoTag = '';
      if (row.isKeysMonth && row.isMoveMonth) marcoTag = '<span class="badge badge-warning">🔑 Chaves & Mudança</span>';
      else if (row.isKeysMonth) marcoTag = '<span class="badge badge-warning">🔑 Chaves</span>';
      else if (row.isMoveMonth) marcoTag = '<span class="badge badge-viable">🚚 Mudança</span>';

      const isNegative = row.freeBalanceCents < 0;
      const endBalanceBrl = (row.freeBalanceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const contribBrl = (row.plannedContributionCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const extraBrl = (row.extraIncomeMonthCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const payBrl = (row.paymentsThisMonthCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
      const startBrl = (row.startBalanceCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

      return `
        <tr style="${isNegative ? 'background-color:#fef2f2;' : ''}">
          <td><strong>${monthLabel(result.baseDate, row.monthIndex)}</strong> ${marcoTag}</td>
          <td>R$ ${startBrl}</td>
          <td>R$ ${contribBrl}</td>
          <td>R$ ${extraBrl}</td>
          <td>R$ ${payBrl}</td>
          <td style="${isNegative ? 'color:#dc2626; font-weight:700;' : 'font-weight:600;'}">R$ ${endBalanceBrl}</td>
          <td>${row.familyBudgetDeficitCents > 0 ? `<span class="badge badge-danger">R$ ${(row.familyBudgetDeficitCents/100).toFixed(2)}</span>` : '-'}</td>
        </tr>
      `;
    }).join('');
  }
}

function monthLabel(baseDate, monthIndex) {
  const base = new Date(`${baseDate}T00:00:00Z`);
  const monthDate = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + monthIndex, 1));
  const label = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC'
  }).format(monthDate);
  return `Mês ${monthIndex} (${label})`;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}
