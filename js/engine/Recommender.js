import { FinancialEngine } from './FinancialEngine.js';
import { ScenarioEngine, VIABILITY_STATUS, VIABILITY_LABELS } from './ScenarioEngine.js';

export class Recommender {
  /**
   * Gera o diagnóstico completo com a recomendação principal e até 3 propostas de mudança.
   */
  static analyze(project, financialResult, scenarios) {
    const viability = financialResult
      ? financialResult.viability || ScenarioEngine.evaluateViability(financialResult, project)
      : { status: VIABILITY_STATUS.INSUFFICIENT_DATA, reasons: [], missingFields: [] };
    const viabilityStatus = typeof viability === 'string' ? viability : viability.status;

    const recommendation = {
      viability,
      viabilityStatus,
      viabilityLabel: VIABILITY_LABELS[viabilityStatus],
      headline: '',
      summaryText: '',
      actionableChanges: [],
      riskAnalysis: this.runRiskAnalysis(project, financialResult)
    };

    if (viabilityStatus === VIABILITY_STATUS.VIABLE) {
      recommendation.headline = 'O escopo informado é compatível com os dados do planejamento.';
      recommendation.summaryText = `Com os aportes e pagamentos previstos, os R$ ${(financialResult.totalIncludedCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} do escopo cabem no caixa projetado. Valores estimados e compromissos posteriores continuam sujeitos às premissas informadas.`;
    } else if (viabilityStatus === VIABILITY_STATUS.ESSENTIAL_ONLY) {
      recommendation.headline = 'Seu orçamento cobre 100% do escopo essencial para a mudança.';
      recommendation.summaryText = 'Os itens indispensáveis (cozinha, cama, banheiros) cabem no fluxo de caixa. Recomendamos manter itens opcionais com compra agendada para pós-mudança.';
    } else if (viabilityStatus === VIABILITY_STATUS.REQUIRES_ADJUSTMENTS) {
      recommendation.headline = 'Atenção: Seu plano apresenta meses com déficit de caixa ou prazos apertados.';
      if (financialResult.firstDeficitMonth !== null) {
        const monthNum = viability.firstDeficitMonth;
        const deficitVal = (viability.firstDeficitAmountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        const worstDeficit = (viability.maxDeficitCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        recommendation.summaryText = `O primeiro déficit é de R$ ${deficitVal} no mês ${monthNum}. O pior déficit é de R$ ${worstDeficit} no mês ${viability.worstDeficitMonth}. Verifique as propostas antes de assumir mudanças.`;
      } else if (!financialResult.essentialItemsReadyBeforeMove) {
        recommendation.summaryText = 'Um ou mais itens essenciais estão com prazo de entrega previsto para APÓS a data de mudança desejada.';
      } else {
        recommendation.summaryText = 'Suas despesas recorrentes e obrigações do imóvel excedem a renda informada no modo detalhado.';
      }
    } else {
      recommendation.headline = 'Análise preliminar em andamento.';
      const missingLabels = viability.missingFieldLabels || [];
      recommendation.summaryText = `Ainda faltam informações para concluir. ${missingLabels.length ? `Informe: ${missingLabels.join('; ')}.` : 'Inclua o orçamento e os itens que pretende avaliar.'}`;
    }

    // Gerar até 3 mudanças prioritárias de escopo ou estratégia
    recommendation.actionableChanges = this.generatePriorityChanges(project, financialResult);

    return recommendation;
  }

  /**
   * Determina a viabilidade a partir do resultado financeiro.
   */
  static getViabilityFromResult(result) {
    return ScenarioEngine.evaluateViability(result).status;
  }

  /**
   * Gera até 3 propostas de mudança concretas para otimizar o plano.
   */
  static generatePriorityChanges(project, result) {
    return [];
  }

  /**
   * Executa a análise de riscos e sensibilidade (Imprevistos).
   */
  static runRiskAnalysis(project, baseResult) {
    if (!baseResult) return [];

    // Choque único de 15% é separado da inflação anual configurada.
    const priceSurgeResult = FinancialEngine.calculate(this.applyOneTimePriceShock(project, 0.15));

    // 2. Imprevisto: Atraso das chaves em +6 meses
    const delayedKeysProject = JSON.parse(JSON.stringify(project));
    if (delayedKeysProject.apartment.keysDate) {
      delayedKeysProject.apartment.keysDate = this.shiftDateByMonths(
        delayedKeysProject.apartment.keysDate,
        6
      );
      if (delayedKeysProject.apartment.moveDate) {
        delayedKeysProject.apartment.moveDate = this.shiftDateByMonths(
          delayedKeysProject.apartment.moveDate,
          6
        );
      }
    }
    const delayedKeysResult = FinancialEngine.calculate(delayedKeysProject);

    // 3. Imprevisto: Redução de 25% na capacidade de aporte mensal
    const reducedCapProject = JSON.parse(JSON.stringify(project));
    if (reducedCapProject.budgetProfile.mode === 'simplified') {
      reducedCapProject.budgetProfile.simplified.monthlyCapCents = Math.round(
        reducedCapProject.budgetProfile.simplified.monthlyCapCents * 0.75
      );
    } else {
      reducedCapProject.budgetProfile.detailed.monthlyCapCents = Math.round(
        reducedCapProject.budgetProfile.detailed.monthlyCapCents * 0.75
      );
    }
    const reducedCapResult = FinancialEngine.calculate(reducedCapProject);

    return [
      {
        id: 'risk_price_surge',
        name: 'Hipótese: choque único de preços (+15%)',
        impactText: priceSurgeResult.firstDeficitMonth !== null
          ? `Gera déficit no Mês ${priceSurgeResult.firstDeficitMonth} (R$ ${(priceSurgeResult.maxDeficitCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })})`
          : 'Plano continua viável mesmo com aumento de 15%.',
        isViable: priceSurgeResult.firstDeficitMonth === null,
        extraCostCents: priceSurgeResult.totalIncludedCostCents - baseResult.totalIncludedCostCents
      },
      {
        id: 'risk_delayed_keys',
        name: 'Atraso na Entrega das Chaves (+6 meses)',
        impactText: delayedKeysResult.firstDeficitMonth !== null
          ? `Adia aportes e gera ajuste no Mês ${delayedKeysResult.firstDeficitMonth}.`
          : 'Permite acumular mais 6 meses de aportes, aumentando a reserva final.',
        isViable: delayedKeysResult.firstDeficitMonth === null,
        extraCostCents: 0
      },
      {
        id: 'risk_reduced_capacity',
        name: 'Queda de 25% nos Aportes Mensais',
        impactText: reducedCapResult.firstDeficitMonth !== null
          ? `Gera déficit acumulado no Mês ${reducedCapResult.firstDeficitMonth} de R$ ${(reducedCapResult.maxDeficitCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
          : 'Ainda sustentável com teto de aporte reduzido.',
        isViable: reducedCapResult.firstDeficitMonth === null,
        extraCostCents: 0
      }
    ];
  }

  static applyOneTimePriceShock(project, shockRate) {
    if (!Number.isFinite(shockRate) || shockRate < 0) {
      throw new Error('O choque de preço deve ser uma taxa não negativa.');
    }
    return {
      ...project,
      items: (project.items || []).map(item => {
        const isFirm = item.status === 'contracted' || item.status === 'paid_partial' ||
          item.status === 'bought' || item.status === 'delivered' || item.status === 'installed';
        if (isFirm) return { ...item };
        const shocked = { ...item };
        ['basePriceCents', 'shippingCents', 'assemblyCents', 'installationCents', 'additionalCostsCents']
          .forEach(field => {
            if (Number.isSafeInteger(item[field])) {
              shocked[field] = Math.round(item[field] * (1 + shockRate));
            }
          });
        return shocked;
      })
    };
  }

  static shiftDateByMonths(dateString, monthDelta) {
    const [year, month, day] = dateString.split('-').map(Number);
    const shiftedMonth = new Date(Date.UTC(year, month - 1 + monthDelta, 1));
    const lastDay = new Date(Date.UTC(
      shiftedMonth.getUTCFullYear(),
      shiftedMonth.getUTCMonth() + 1,
      0
    )).getUTCDate();
    shiftedMonth.setUTCDate(Math.min(day, lastDay));
    return shiftedMonth.toISOString().slice(0, 10);
  }
}
