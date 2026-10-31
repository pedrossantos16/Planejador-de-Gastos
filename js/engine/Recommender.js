import { FinancialEngine } from './FinancialEngine.js';
import { VIABILITY_STATUS, VIABILITY_LABELS } from './ScenarioEngine.js';
import { SCOPE_OPTIONS, PRIORITY_OPTIONS, STRATEGY_OPTIONS, STRATEGY_LABELS } from '../models/types.js';

export class Recommender {
  /**
   * Gera o diagnóstico completo com a recomendação principal e até 3 propostas de mudança.
   */
  static analyze(project, financialResult, scenarios) {
    const viability = financialResult ? financialResult.status || this.getViabilityFromResult(financialResult) : VIABILITY_STATUS.INSUFFICIENT_DATA;

    const recommendation = {
      viabilityStatus: viability,
      viabilityLabel: VIABILITY_LABELS[viability],
      headline: '',
      summaryText: '',
      actionableChanges: [],
      riskAnalysis: this.runRiskAnalysis(project, financialResult)
    };

    if (viability === VIABILITY_STATUS.VIABLE) {
      recommendation.headline = 'Seu plano financeiro é viável e atinge o objetivo com segurança!';
      recommendation.summaryText = `Com os aportes previstos e seu saldo acumulado, você conseguirá cobrir R$ ${(financialResult.totalIncludedCostCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} em compras até a data da mudança sem gerar déficits de caixa.`;
    } else if (viability === VIABILITY_STATUS.ESSENTIAL_ONLY) {
      recommendation.headline = 'Seu orçamento cobre 100% do escopo essencial para a mudança.';
      recommendation.summaryText = 'Os itens indispensáveis (cozinha, cama, banheiros) cabem no fluxo de caixa. Recomendamos manter itens opcionais com compra agendada para pós-mudança.';
    } else if (viability === VIABILITY_STATUS.REQUIRES_ADJUSTMENTS) {
      recommendation.headline = 'Atenção: Seu plano apresenta meses com déficit de caixa ou prazos apertados.';
      if (financialResult.firstDeficitMonth !== null) {
        const monthNum = financialResult.firstDeficitMonth;
        const deficitVal = (financialResult.maxDeficitCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
        recommendation.summaryText = `No mês ${monthNum}, haverá um déficit de R$ ${deficitVal} no fundo do projeto (geralmente provocado por pagamentos de sinal ou compras concentradas). Veja as sugestões de ajuste abaixo.`;
      } else if (!financialResult.essentialItemsReadyBeforeMove) {
        recommendation.summaryText = 'Um ou mais itens essenciais estão com prazo de entrega previsto para APÓS a data de mudança desejada.';
      } else {
        recommendation.summaryText = 'Suas despesas recorrentes e obrigações do imóvel excedem a renda informada no modo detalhado.';
      }
    } else {
      recommendation.headline = 'Análise preliminar em andamento.';
      recommendation.summaryText = 'Preencha os valores estimados dos itens e seu orçamento na Etapa 2 para obter um diagnóstico financeiro completo.';
    }

    // Gerar até 3 mudanças prioritárias de escopo ou estratégia
    recommendation.actionableChanges = this.generatePriorityChanges(project, financialResult);

    return recommendation;
  }

  /**
   * Determina a viabilidade a partir do resultado financeiro.
   */
  static getViabilityFromResult(result) {
    if (!result || !result.processedItems || result.processedItems.length === 0) {
      return VIABILITY_STATUS.INSUFFICIENT_DATA;
    }
    if (result.firstDeficitMonth !== null || !result.essentialItemsReadyBeforeMove || result.hasFamilyBudgetDeficit) {
      return VIABILITY_STATUS.REQUIRES_ADJUSTMENTS;
    }
    return VIABILITY_STATUS.VIABLE;
  }

  /**
   * Gera até 3 propostas de mudança concretas para otimizar o plano.
   */
  static generatePriorityChanges(project, result) {
    if (!result || !result.processedItems) return [];

    const changes = [];
    const items = result.processedItems;

    // Proposta 1: Adiar itens Opcionais ou Importantes não essenciais que estão incluídos
    const optionalIncluded = items.filter(
      i => i.priority === PRIORITY_OPTIONS.OPTIONAL && i.scope === SCOPE_OPTIONS.INCLUDE
    );

    if (optionalIncluded.length > 0) {
      const target = optionalIncluded[0];
      const savingsCents = target.totalInstalledCostCents;
      changes.push({
        title: `Adiar item opcional: ${target.name}`,
        whatToChange: `Alterar o escopo de "${target.name}" no ${getRoomName(project, target.roomId)} de "Incluir no plano" para "Adiar pós-mudança".`,
        estimatedSavingsCents: savingsCents,
        formattedSavings: `R$ ${(savingsCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        effectOnCriticalMonth: `Reduz a necessidade de caixa em R$ ${(savingsCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} antes da mudança.`,
        tradeOff: 'Menos conforto decorativo imediato no primeiro mês pós-mudança.',
        conditions: 'Item pode ser adquirido em até 6 a 12 meses após estar morando no imóvel.'
      });
    }

    // Proposta 2: Substituir Marcenaria Sob Medida por Móveis Modulados em ambientes secundários
    const customWoodworkItems = items.filter(
      i => i.strategy === STRATEGY_OPTIONS.CUSTOM_WOODWORK && i.scope === SCOPE_OPTIONS.INCLUDE
    );

    if (customWoodworkItems.length > 0) {
      // Priorizar ambiente secundário (sala, quarto 2) antes da cozinha
      const secondaryCustomItem = customWoodworkItems.find(i => i.roomId !== 'room_cozinha') || customWoodworkItems[0];
      const approxSavingsCents = Math.round(secondaryCustomItem.totalInstalledCostCents * 0.30);

      changes.push({
        title: `Trocar Marcenaria por Modulados: ${secondaryCustomItem.name}`,
        whatToChange: `Mudar a estratégia de "${secondaryCustomItem.name}" de "Marcenaria sob medida" para "Móveis modulados".`,
        estimatedSavingsCents: approxSavingsCents,
        formattedSavings: `Economia aprox. de R$ ${(approxSavingsCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
        effectOnCriticalMonth: `Diminui o valor do sinal inicial e alivia os meses críticos de pagamento.`,
        tradeOff: 'Acabamento padrão com folgas nas laterais (sem ajuste sob medida perfeito nas paredes).',
        conditions: 'Requer medir com precisão a parede para escolher o módulo pronto compatível.'
      });
    }

    // Proposta 3: Ajustar parcelamento do Sinal de itens contratados ou de maior valor
    if (result.firstDeficitMonth !== null) {
      const deficitMonth = result.firstDeficitMonth;
      const ledgerEntry = result.monthlyLedger[deficitMonth];

      if (ledgerEntry && ledgerEntry.paymentDetails && ledgerEntry.paymentDetails.length > 0) {
        const depositPayment = ledgerEntry.paymentDetails.find(p => p.isDeposit) || ledgerEntry.paymentDetails[0];

        changes.push({
          title: `Renegociar Sinal ou Parcelamento do Mês ${deficitMonth}`,
          whatToChange: `Solicitar divisão do sinal de R$ ${(depositPayment.amountCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} (referente a ${depositPayment.itemName}) em 2 ou 3 vezes.`,
          estimatedSavingsCents: Math.round(depositPayment.amountCents * 0.5),
          formattedSavings: `Alívio imediato no Mês ${deficitMonth}`,
          effectOnCriticalMonth: `Elimina o déficit de R$ ${(result.maxDeficitCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} registrado no Mês ${deficitMonth}.`,
          tradeOff: 'Pode exigir negociação direta com o fornecedor da marcenaria.',
          conditions: 'Válido para orçamentos em fase de negociação antes da assinatura final.'
        });
      }
    }

    return changes.slice(0, 3);
  }

  /**
   * Executa a análise de riscos e sensibilidade (Imprevistos).
   */
  static runRiskAnalysis(project, baseResult) {
    if (!baseResult) return [];

    // 1. Imprevisto: Inflação / Aumento de Preços +15% nos itens não contratados
    const priceSurgeResult = FinancialEngine.calculate(project, {
      assumptions: {
        annualInflationRate: (project.assumptions.annualInflationRate || 0) + 0.15,
        applyInflationToUncontracted: true
      }
    });

    // 2. Imprevisto: Atraso das chaves em +6 meses
    const delayedKeysProject = JSON.parse(JSON.stringify(project));
    if (delayedKeysProject.apartment.keysDate) {
      const d = new Date(delayedKeysProject.apartment.keysDate);
      d.setMonth(d.getMonth() + 6);
      delayedKeysProject.apartment.keysDate = d.toISOString().split('T')[0];
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
        name: 'Aumento de Preços (+15% no mercado)',
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
}

function getRoomName(project, roomId) {
  const r = (project.apartment.rooms || []).find(room => room.id === roomId);
  return r ? r.name : 'Ambiente';
}
