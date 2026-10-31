import { SCOPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../models/types.js';

/**
 * Motor Financeiro Determinístico para "Meu Apê Planejado"
 *
 * Executa todos os cálculos monetários em CENTAVOS (inteiros).
 * Regra fundamental: Saldo total positivo ao final dos 36 meses NÃO compensa
 * um déficit de caixa em um mês intermediário (ex: pagamento de sinal no mês 4).
 */
export class FinancialEngine {
  /**
   * Calcula a simulação financeira completa de um projeto.
   * @param {Object} project Objeto de projeto completo
   * @param {Object} [optionsOverride] Sobrescritas opcionais para cenários/sensibilidade
   * @returns {Object} Resultado detalhado do plano financeiro
   */
  static calculate(project, optionsOverride = {}) {
    const assumptions = { ...project.assumptions, ...optionsOverride.assumptions };
    const items = optionsOverride.items || project.items || [];
    const budgetProfile = optionsOverride.budgetProfile || project.budgetProfile;

    // 1. Prazos e Datas
    const now = new Date();
    const keysDate = new Date(project.apartment.keysDate || now);
    const moveDate = new Date(project.apartment.moveDate || now);

    const monthsToKeys = Math.max(1, Math.round((keysDate - now) / (1000 * 60 * 60 * 24 * 30.4375)));
    const monthsToMove = Math.max(monthsToKeys, Math.round((moveDate - now) / (1000 * 60 * 60 * 24 * 30.4375)));

    // Horizonte de projeção: no mínimo 36 meses, ou até 6 meses após a mudança
    const horizonMonths = Math.max(36, monthsToMove + 6);

    // 2. Processar e Projetar Custos dos Itens
    const processedItems = items.map(item => this.processItemCost(item, assumptions, horizonMonths));

    // 3. Mapear Pagamentos do Projeto por Mês
    const monthlyProjectPayments = new Array(horizonMonths + 1).fill(0);
    const monthlyPaymentDetails = Array.from({ length: horizonMonths + 1 }, () => []);

    processedItems.forEach(item => {
      if (item.scope === SCOPE_OPTIONS.INCLUDE || item.scope === SCOPE_OPTIONS.ALREADY_OWNED) {
        item.calculatedPayments.forEach(pay => {
          const m = Math.min(horizonMonths, Math.max(0, pay.monthIndex));
          monthlyProjectPayments[m] += pay.amountCents;
          monthlyPaymentDetails[m].push({
            itemId: item.id,
            itemName: item.name,
            description: pay.description,
            amountCents: pay.amountCents,
            isDeposit: pay.isDeposit
          });
        });
      }
    });

    // 4. Calcular Capacidade Mensal e Livro do Fundo (Ledger)
    const isDetailed = budgetProfile.mode === 'detailed';
    const profileData = isDetailed ? budgetProfile.detailed : budgetProfile.simplified;

    const initialBalanceCents = profileData.initialBalanceCents || 0;
    const monthlyCapCents = profileData.monthlyCapCents || 0;
    const extraIncomes = profileData.extraIncomes || [];
    const atypicalMonths = profileData.atypicalMonths || {};

    const monthlyLedger = [];
    let currentBalanceCents = initialBalanceCents;
    let totalContributionsCents = 0;
    let maxDeficitCents = 0;
    let firstDeficitMonth = null;
    let hasFamilyBudgetDeficit = false;

    // Rendimento mensal composto: (1 + anual)^(1/12) - 1
    const yieldAnnual = assumptions.yieldRateAnnual || 0;
    const monthlyYieldRate = yieldAnnual > 0 ? Math.pow(1 + yieldAnnual, 1 / 12) - 1 : 0;

    for (let m = 0; m <= horizonMonths; m++) {
      // Extra incomes exclusivamente para este mês
      const extraIncomeMonthCents = extraIncomes
        .filter(ext => Number(ext.monthIndex) === m)
        .reduce((sum, ext) => sum + (ext.amountCents || 0), 0);

      // Capacidade e Aporte Máximo do Mês m
      let netAvailabilityCents = monthlyCapCents;
      let capacityCents = monthlyCapCents;
      let maxContributionCents = monthlyCapCents;
      let familyBudgetDeficitCents = 0;

      if (isDetailed) {
        const netIncome = profileData.netMonthlyIncomeCents || 0;
        const livingExp = (profileData.fixedLivingExpensesCents || 0) + (profileData.variableLivingExpensesCents || 0);
        const propertyExp = (profileData.propertyInstallmentCents || 0) + (m >= monthsToKeys ? (profileData.postMoveExpensesCents || 0) : 0);
        const otherDebts = profileData.otherDebtsCents || 0;
        const safetyMargin = profileData.safetyMarginCents || 0;

        netAvailabilityCents = netIncome - livingExp - propertyExp - otherDebts - safetyMargin;
        if (netAvailabilityCents < 0) {
          familyBudgetDeficitCents = Math.abs(netAvailabilityCents);
          hasFamilyBudgetDeficit = true;
        }

        capacityCents = Math.max(0, netAvailabilityCents);
        const configuredCap = atypicalMonths[m] !== undefined ? atypicalMonths[m] : monthlyCapCents;
        maxContributionCents = Math.min(configuredCap, capacityCents);
      } else {
        if (atypicalMonths[m] !== undefined) {
          maxContributionCents = atypicalMonths[m];
        }
      }

      // Determinar aporte planejado para cobrir pagamentos e manter saldo saudável
      const paymentsThisMonthCents = monthlyProjectPayments[m];

      // O aporte adotado é o máximo autorizado para construir reserva ou cobrir o mês
      const plannedContributionCents = maxContributionCents;
      totalContributionsCents += plannedContributionCents;

      // Rendimentos do fundo acumulado
      const yieldCents = Math.round(Math.max(0, currentBalanceCents) * monthlyYieldRate);

      // Atualização do Saldo do Fundo
      const startBalanceCents = currentBalanceCents;
      const endBalanceCents = startBalanceCents + plannedContributionCents + extraIncomeMonthCents + yieldCents - paymentsThisMonthCents;

      if (endBalanceCents < 0) {
        const deficit = Math.abs(endBalanceCents);
        if (deficit > maxDeficitCents) {
          maxDeficitCents = deficit;
        }
        if (firstDeficitMonth === null) {
          firstDeficitMonth = m;
        }
      }

      monthlyLedger.push({
        monthIndex: m,
        isKeysMonth: m === monthsToKeys,
        isMoveMonth: m === monthsToMove,
        startBalanceCents,
        maxContributionCents,
        plannedContributionCents,
        extraIncomeMonthCents,
        yieldCents,
        paymentsThisMonthCents,
        endBalanceCents,
        familyBudgetDeficitCents,
        paymentDetails: monthlyPaymentDetails[m]
      });

      currentBalanceCents = endBalanceCents;
    }

    // 5. Consolidar Totais por Escopo e Prioridade
    let totalEssentialCostCents = 0;
    let totalImportantCostCents = 0;
    let totalOptionalCostCents = 0;
    let totalIncludedCostCents = 0;

    let essentialItemsReadyBeforeMove = true;
    const delayedEssentialItems = [];

    processedItems.forEach(item => {
      if (item.scope === SCOPE_OPTIONS.INCLUDE || item.scope === SCOPE_OPTIONS.ALREADY_OWNED) {
        totalIncludedCostCents += item.totalInstalledCostCents;

        if (item.priority === PRIORITY_OPTIONS.ESSENTIAL) {
          totalEssentialCostCents += item.totalInstalledCostCents;
          if (item.deliveryMonthIndex > monthsToMove && item.scope === SCOPE_OPTIONS.INCLUDE) {
            essentialItemsReadyBeforeMove = false;
            delayedEssentialItems.push(item);
          }
        } else if (item.priority === PRIORITY_OPTIONS.IMPORTANT) {
          totalImportantCostCents += item.totalInstalledCostCents;
        } else if (item.priority === PRIORITY_OPTIONS.OPTIONAL) {
          totalOptionalCostCents += item.totalInstalledCostCents;
        }
      }
    });

    // Compromissos futuros após o mês de mudança
    let postMoveLiabilitiesCents = 0;
    for (let m = monthsToMove + 1; m <= horizonMonths; m++) {
      postMoveLiabilitiesCents += monthlyProjectPayments[m];
    }

    return {
      monthsToKeys,
      monthsToMove,
      horizonMonths,
      processedItems,
      monthlyLedger,
      totalEssentialCostCents,
      totalImportantCostCents,
      totalOptionalCostCents,
      totalIncludedCostCents,
      totalContributionsCents,
      finalBalanceCents: monthlyLedger[horizonMonths] ? monthlyLedger[horizonMonths].endBalanceCents : 0,
      firstDeficitMonth,
      maxDeficitCents,
      hasFamilyBudgetDeficit,
      essentialItemsReadyBeforeMove,
      delayedEssentialItems,
      postMoveLiabilitiesCents,
      isAudited: isDetailed
    };
  }

  /**
   * Calcula o custo total instalado e projeta o valor com inflação (g) se aplicável.
   */
  static processItemCost(item, assumptions, horizonMonths) {
    const isUncontracted = item.status !== STATUS_OPTIONS.CONTRACTED &&
                         item.status !== STATUS_OPTIONS.BOUGHT &&
                         item.status !== STATUS_OPTIONS.INSTALLED;

    const annualInflation = assumptions.annualInflationRate || 0;
    const applyInflation = assumptions.applyInflationToUncontracted && isUncontracted && annualInflation > 0;

    // Custo base total sem reajuste (em centavos)
    const rawBaseCost = (item.basePriceCents || 0) +
                        (item.shippingCents || 0) +
                        (item.assemblyCents || 0) +
                        (item.installationCents || 0) +
                        (item.additionalCostsCents || 0);

    // Mês de entrega / pagamento principal previsto
    const deliveryMonth = Math.min(horizonMonths, Math.max(0, item.deliveryMonthIndex || 36));

    // Ajuste de inflação se aplicável: P_t = P_0 * (1 + g)^(t/12)
    let totalInstalledCostCents = rawBaseCost;
    if (applyInflation && deliveryMonth > 0) {
      const inflationFactor = Math.pow(1 + annualInflation, deliveryMonth / 12);
      totalInstalledCostCents = Math.round(rawBaseCost * inflationFactor);
    }

    // Calcular parcelas proporcionalmente
    let calculatedPayments = [];
    if (item.payments && item.payments.length > 0) {
      const originalSum = item.payments.reduce((s, p) => s + (p.amountCents || 0), 0);
      let runningSum = 0;

      calculatedPayments = item.payments.map((pay, idx) => {
        let amount = pay.amountCents || 0;
        if (applyInflation && originalSum > 0) {
          if (idx === item.payments.length - 1) {
            // Ajustar centavos residuais na última parcela
            amount = totalInstalledCostCents - runningSum;
          } else {
            const ratio = pay.amountCents / originalSum;
            amount = Math.round(totalInstalledCostCents * ratio);
            runningSum += amount;
          }
        }
        return {
          ...pay,
          amountCents: amount
        };
      });
    } else {
      // Se não houver parcelas configuradas, criar 1 pagamento único no mês de entrega
      calculatedPayments = [{
        amountCents: totalInstalledCostCents,
        monthIndex: deliveryMonth,
        isPaid: item.status === STATUS_OPTIONS.BOUGHT || item.status === STATUS_OPTIONS.INSTALLED,
        description: 'Pagamento total do item',
        isDeposit: false
      }];
    }

    return {
      ...item,
      rawBaseCostCents: rawBaseCost,
      totalInstalledCostCents,
      deliveryMonthIndex: deliveryMonth,
      calculatedPayments
    };
  }
}
