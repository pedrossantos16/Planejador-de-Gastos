export class SensitivityUI {
  /**
   * Renderiza a seção de Análise de Riscos e Testes de Imprevistos
   */
  static render(container, riskAnalysisList) {
    if (!container) return;

    if (!riskAnalysisList || riskAnalysisList.length === 0) {
      container.innerHTML = '<p style="color:#64748b;">Nenhum teste de imprevisto executado.</p>';
      return;
    }

    container.innerHTML = `
      <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(260px, 1fr)); gap:16px;">
        ${riskAnalysisList.map(risk => `
          <div style="border:1px solid #e2e8f0; border-radius:8px; padding:16px; background:#ffffff;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
              <strong style="font-size:14px; color:#0f172a;">${risk.name}</strong>
              <span class="badge ${risk.isViable === null ? 'badge-warning' : risk.isViable ? 'badge-viable' : 'badge-danger'}">
                ${risk.isViable === null ? 'Dados insuficientes' : risk.isViable ? 'Compatível' : 'Alerta de Risco'}
              </span>
            </div>
            <p style="font-size:13px; color:#475569; margin-top:4px;">${risk.impactText}</p>
            ${risk.extraCostCents > 0 ? `
              <div style="margin-top:8px; font-size:12px; color:#991b1b; background:#fef2f2; padding:6px; border-radius:4px;">
                Custo Adicional Previsto: R$ ${(risk.extraCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            ` : ''}
          </div>
        `).join('')}
      </div>
    `;
  }
}
