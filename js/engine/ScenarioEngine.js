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
      reasons.push(`O caixa livre fica negativo primeiro no mês ${result.firstDeficitMonth}.`);
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
        ? Math.max(0, -firstDeficitEntry.freeBalanceCents)
        : 0,
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
      'apartment.moveDate': 'Data desejada para a mudança'
    };
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
