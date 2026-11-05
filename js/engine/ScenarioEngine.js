import { FinancialEngine } from './FinancialEngine.js';
import { SCOPE_OPTIONS, PRIORITY_OPTIONS } from '../models/types.js';

export const VIABILITY_STATUS = {
  VIABLE: 'viable',                   // Compatível com as premissas informadas
  ESSENTIAL_ONLY: 'essential_only',   // Compatível apenas com o essencial
  REQUIRES_ADJUSTMENTS: 'requires_adjustments', // Exige ajustes concretos
  INSUFFICIENT_DATA: 'insufficient_data' // Dados insuficientes para concluir
};

export const VIABILITY_LABELS = {
  viable: 'Plano Viável e Compatível',
  essential_only: 'Viável Apenas para o Escopo Essencial',
  requires_adjustments: 'Plano Exige Ajustes Financeiros ou de Prazo',
  insufficient_data: 'Análise Preliminar (Dados Insuficientes)'
};

export class ScenarioEngine {
  static evaluateViability(result, project = null) {
    const reasons = [];
    const missingFields = result?.missingFields || [];
    if (!result || !result.processedItems || result.selectedItemCount === 0 ||
        result.processedItems.length === 0) {
      reasons.push('Ainda não há itens incluídos no escopo para avaliar o planejamento.');
    }
    if (result?.postponedEssentialItems?.length) {
      reasons.push(`Há itens essenciais adiados para depois da mudança: ${result.postponedEssentialItems.map(item => item.name).join(', ')}.`);
    }
    if (!result?.hasCompleteData || missingFields.length > 0) {
      reasons.push('Há dados essenciais não informados; esta análise é preliminar.');
    }
    if (result?.firstDeficitMonth !== null && result?.firstDeficitMonth !== undefined) {
      reasons.push(result.contingency?.mode === 'target'
        ? `O caixa fica negativo primeiro no mês ${result.firstDeficitMonth}.`
        : `O caixa livre fica negativo primeiro no mês ${result.firstDeficitMonth}.`);
    }
    const reserveShortfallMonth = result?.contingency?.firstReserveShortfallMonth ?? null;
    if (reserveShortfallMonth !== null) {
      reasons.push(`A contingência não se mantém formada a partir do mês ${reserveShortfallMonth} (falta até R$ ${(result.contingency.maxReserveShortfallCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}), embora o caixa não fique negativo.`);
    }
    if (result?.settlementReview?.length) {
      reasons.push(`Análise preliminar: confirme se foi paga a compra de ${result.settlementReview.map(item => item.name).join(', ')}. Se não foi paga, o valor ainda é uma saída futura e muda a projeção.`);
    }
    if (result?.contingency?.ruleNeedsReview) {
      const ambiguity = result.contingency.ruleAmbiguity;
      const describe = entry => `${entry.rule === 'month_zero' ? 'reserva desde o mês 0' : 'reserva desde o primeiro desembolso'}: ${entry.firstDeficitMonth === null ? 'sem déficit' : `déficit a partir do mês ${entry.firstDeficitMonth}`}`;
      reasons.push(ambiguity?.material
        ? `Conclusão provisória: este projeto foi salvo sem a versão da regra de contingência e não é possível comprovar qual regra valia. O resultado depende dela (${ambiguity.alternatives.map(describe).join('; ')}). Confirme a regra ou adote a regra com data-alvo.`
        : 'A regra de contingência de origem não pôde ser comprovada, mas as interpretações possíveis levam ao mesmo resultado. Revise e confirme a regra com data-alvo.');
    }
    if (result?.hasFamilyBudgetDeficit) {
      reasons.push('As obrigações informadas excedem a renda mensal em pelo menos um mês.');
    }
    if (result?.essentialItemsReadyBeforeMove === false) {
      reasons.push('Há itens essenciais que não estarão prontos até a mudança.');
    }

    let status = VIABILITY_STATUS.VIABLE;
    if (!result || !result.processedItems?.length || result.selectedItemCount === 0 ||
        !result.hasCompleteData || missingFields.length > 0) {
      status = VIABILITY_STATUS.INSUFFICIENT_DATA;
    } else if (result.firstDeficitMonth !== null || result.hasFamilyBudgetDeficit ||
        (result.contingency?.firstReserveShortfallMonth ?? null) !== null ||
        result.essentialItemsReadyBeforeMove === false ||
        result.postponedEssentialItems?.length > 0) {
      status = VIABILITY_STATUS.REQUIRES_ADJUSTMENTS;
    } else {
      const selectedItems = result.processedItems.filter(item =>
        item.scope === SCOPE_OPTIONS.INCLUDE || item.scope === SCOPE_OPTIONS.ALREADY_OWNED
      );
      const hasEssentialItems = selectedItems.some(item => item.priority === PRIORITY_OPTIONS.ESSENTIAL);
      const hasOtherSelectedItems = selectedItems.some(item =>
        item.priority !== PRIORITY_OPTIONS.ESSENTIAL
      );
      if (hasEssentialItems && !hasOtherSelectedItems) status = VIABILITY_STATUS.ESSENTIAL_ONLY;
    }

    const firstDeficitEntry = result?.firstDeficitMonth === null
      ? null
      : result?.monthlyLedger?.[result.firstDeficitMonth];
    return {
      status,
      label: VIABILITY_LABELS[status],
      reasons,
      missingFields: [...missingFields],
      missingFieldLabels: missingFields.map(field => this.describeMissingField(field, project)),
      firstDeficitMonth: result?.firstDeficitMonth ?? null,
      firstDeficitAmountCents: firstDeficitEntry
        ? (firstDeficitEntry.deficitCents ?? Math.max(0, -firstDeficitEntry.freeBalanceCents))
        : 0,
      firstReserveShortfallMonth: result?.contingency?.firstReserveShortfallMonth ?? null,
      maxReserveShortfallCents: result?.contingency?.maxReserveShortfallCents ?? 0,
      settlementReview: result?.settlementReview ?? [],
      contingency: result?.contingency ?? null,
      worstDeficitMonth: result?.worstDeficitMonth ?? null,
      maxDeficitCents: result?.maxDeficitCents ?? 0,
      balanceAtMoveCents: result?.balanceAtMoveCents ?? null,
      finalBalanceCents: result?.finalBalanceCents ?? null,
      postMoveLiabilitiesCents: result?.postMoveLiabilitiesCents ?? 0
    };
  }

  static describeMissingField(field, project) {
    const labels = {
      initialBalanceCents: 'Saldo reservado exclusivamente para o projeto',
      monthlyCapCents: 'Teto mensal autorizado',
      netMonthlyIncomeCents: 'Renda líquida mensal',
      fixedLivingExpensesCents: 'Despesas fixas de vida',
      variableLivingExpensesCents: 'Despesas variáveis',
      propertyInstallmentCents: 'Parcela mensal do imóvel',
      otherDebtsCents: 'Outras dívidas mensais',
      safetyMarginCents: 'Margem de segurança mensal',
      postMoveExpensesCents: 'Despesas mensais adicionais após as chaves',
      'apartment.keysDate': 'Data prevista das chaves',
      'apartment.moveDate': 'Data desejada para a mudança',
      'assumptions.contingencyTargetDate': 'Data-alvo para ter a contingência formada'
    };
    if (field === 'contingencyRule') {
      return 'Confirmar qual regra de contingência valia para este projeto (ou adotar a regra com data-alvo)';
    }
    if (field.startsWith('settlement:')) {
      const itemId = field.slice('settlement:'.length);
      const item = project?.items?.find(entry => entry.id === itemId);
      return item ? `Confirmar se a compra de ${item.name} já foi paga` : 'Confirmar a quitação de uma compra';
    }
    if (field.startsWith('price:')) {
      const itemId = field.slice('price:'.length);
      const item = project?.items?.find(entry => entry.id === itemId);
      return item ? `Preço informado para ${item.name}` : 'Preço de um item incluído';
    }
    return labels[field] || field;
  }

  static diagnoseViability(result) {
    return this.evaluateViability(result).status;
  }

  /**
   * Gera os 3 cenários comparativos (Econômico, Equilibrado, Conforto) para o mesmo projeto.
   */
  static generateScenarios(project) {
    const result = FinancialEngine.calculate(project);
    result.viability = this.evaluateViability(result, project);
    return {
      base: {
          id: 'scenario_base',
          name: project.isDemonstration ? 'Plano informado (demonstração fictícia)' : 'Plano informado',
          description: 'Alternativas de preço só serão comparadas quando houver cotações cadastradas com fonte e especificação.',
          result,
          viability: result.viability,
          status: result.viability.status
      }
    };
  }
}
