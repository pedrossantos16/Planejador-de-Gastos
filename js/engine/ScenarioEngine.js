import { FinancialEngine } from './FinancialEngine.js';
import { STRATEGY_OPTIONS, SCOPE_OPTIONS, PRIORITY_OPTIONS } from '../models/types.js';

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
  /**
   * Avalia a viabilidade estrita de um resultado financeiro.
   */
  static diagnoseViability(result, project) {
    // Checar se há itens ou preços preenchidos
    if (!result.processedItems || result.processedItems.length === 0) {
      return VIABILITY_STATUS.INSUFFICIENT_DATA;
    }

    const hasPricedItems = result.processedItems.some(item => item.totalInstalledCostCents > 0);
    if (!hasPricedItems) {
      return VIABILITY_STATUS.INSUFFICIENT_DATA;
    }

    // Regra 1: Se houver qualquer déficit de caixa no fundo em algum mês -> REQUER AJUSTES
    if (result.firstDeficitMonth !== null) {
      return VIABILITY_STATUS.REQUIRES_ADJUSTMENTS;
    }

    // Regra 2: Se itens essenciais não puderem estar prontos antes da mudança -> REQUER AJUSTES
    if (!result.essentialItemsReadyBeforeMove) {
      return VIABILITY_STATUS.REQUIRES_ADJUSTMENTS;
    }

    // Regra 3: Se houver déficit no orçamento familiar mensal -> REQUER AJUSTES
    if (result.hasFamilyBudgetDeficit) {
      return VIABILITY_STATUS.REQUIRES_ADJUSTMENTS;
    }

    // Regra 4: Testar se o plano completo cabe. Se sim -> VIABLE.
    // Se o plano completo exceder a capacidade acumulada, mas o essencial couber -> ESSENTIAL_ONLY.
    const hasImportantOrOptionalIncluded = result.processedItems.some(
      item => (item.priority === PRIORITY_OPTIONS.IMPORTANT || item.priority === PRIORITY_OPTIONS.OPTIONAL) &&
              (item.scope === SCOPE_OPTIONS.INCLUDE)
    );

    if (hasImportantOrOptionalIncluded) {
      return VIABILITY_STATUS.VIABLE;
    }

    return VIABILITY_STATUS.ESSENTIAL_ONLY;
  }

  /**
   * Gera os 3 cenários comparativos (Econômico, Equilibrado, Conforto) para o mesmo projeto.
   */
  static generateScenarios(project) {
    const baseItems = project.items || [];

    // 1. Cenário Econômico Funcional (Móveis modulados / prontos, foco em prioridade Essencial)
    const itemsEconomic = baseItems.map(item => {
      let strategy = item.strategy;
      if (strategy === STRATEGY_OPTIONS.CUSTOM_WOODWORK || strategy === STRATEGY_OPTIONS.FACTORY_PLANNED) {
        strategy = STRATEGY_OPTIONS.MODULAR;
      }

      // No cenário econômico, itens opcionais são adiados por padrão se o usuário não travou a escolha
      let scope = item.scope;
      if (item.priority === PRIORITY_OPTIONS.OPTIONAL && scope === SCOPE_OPTIONS.INCLUDE) {
        scope = SCOPE_OPTIONS.POSTPONE;
      }

      // Redução de custo estimada para modulados (~30% a menos que sob medida)
      let basePriceCents = item.basePriceCents;
      if (item.strategy === STRATEGY_OPTIONS.CUSTOM_WOODWORK && strategy === STRATEGY_OPTIONS.MODULAR) {
        basePriceCents = Math.round(basePriceCents * 0.70);
      }

      return {
        ...item,
        strategy,
        scope,
        basePriceCents
      };
    });

    // 2. Cenário Equilibrado (Estratégias mistas: sob medida na cozinha/quarto casal, modulados no restante)
    const itemsBalanced = baseItems.map(item => {
      let strategy = item.strategy;
      let basePriceCents = item.basePriceCents;

      // Cozinha e Quarto Casal mantêm sob medida/planejado; demais salas/quartos usam modulado/pronto
      const isKeyRoom = item.roomId === 'room_cozinha' || item.roomId === 'room_quarto_principal';
      if (!isKeyRoom && (strategy === STRATEGY_OPTIONS.CUSTOM_WOODWORK)) {
        strategy = STRATEGY_OPTIONS.MODULAR;
        basePriceCents = Math.round(basePriceCents * 0.75);
      }

      return {
        ...item,
        strategy,
        basePriceCents
      };
    });

    // 3. Cenário Maior Durabilidade / Conforto (Marcenaria sob medida/planejados em todos os ambientes)
    const itemsComfort = baseItems.map(item => {
      let strategy = item.strategy;
      let basePriceCents = item.basePriceCents;

      if (strategy === STRATEGY_OPTIONS.READY_MADE || strategy === STRATEGY_OPTIONS.MODULAR) {
        strategy = STRATEGY_OPTIONS.CUSTOM_WOODWORK;
        basePriceCents = Math.round(basePriceCents * 1.35); // Sob medida ~35% acima de pronto
      }

      return {
        ...item,
        strategy,
        scope: item.scope === SCOPE_OPTIONS.POSTPONE ? SCOPE_OPTIONS.INCLUDE : item.scope,
        basePriceCents
      };
    });

    // Executar simulação para os 3 cenários
    const resEconomic = FinancialEngine.calculate(project, { items: itemsEconomic });
    const resBalanced = FinancialEngine.calculate(project, { items: itemsBalanced });
    const resComfort = FinancialEngine.calculate(project, { items: itemsComfort });

    return {
      economic: {
        id: 'scenario_economic',
        name: 'Econômico Funcional',
        description: 'Prioriza modulados e móveis prontos, reduzindo o investimento inicial sem comprometer a mudança.',
        result: resEconomic,
        status: this.diagnoseViability(resEconomic, project)
      },
      balanced: {
        id: 'scenario_balanced',
        name: 'Equilibrado (Recomendado)',
        description: 'Combina marcenaria sob medida nos ambientes principais (cozinha e suíte) com modulados no restante.',
        result: resBalanced,
        status: this.diagnoseViability(resBalanced, project)
      },
      comfort: {
        id: 'scenario_comfort',
        name: 'Maior Durabilidade & Conforto',
        description: 'Marcenaria sob medida integral em todos os ambientes com aproveitamento total de espaço.',
        result: resComfort,
        status: this.diagnoseViability(resComfort, project)
      }
    };
  }
}
