import {
  SCOPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS, FIRM_STATUSES, SETTLED_STATUSES
} from '../models/types.js';
import { needsSettlementConfirmation, SETTLEMENT_ORIGIN, PAYMENT_SOURCE } from '../models/payments.js';
import {
  CONTINGENCY_RULE, resolveContingencyRule, contingencyRuleNeedsReview
} from '../models/contingencyRules.js';

const MAX_PROJECTION_MONTHS = 1200;

export class FinancialEngine {
  static calculate(project, optionsOverride = {}) {
    if (!project?.apartment || !project?.budgetProfile ||
        !['simplified', 'detailed'].includes(project.budgetProfile.mode)) {
      throw new Error('O projeto não possui um modo de orçamento válido.');
    }
    const assumptions = { ...project.assumptions, ...(optionsOverride.assumptions || {}) };
    const items = optionsOverride.items || project.items || [];
    const budgetProfile = optionsOverride.budgetProfile || project.budgetProfile;
    const profileData = budgetProfile.mode === 'detailed' ? budgetProfile.detailed : budgetProfile.simplified;
    validateMoneyFields(profileData, [
      'initialBalanceCents', 'monthlyCapCents', 'netMonthlyIncomeCents',
      'fixedLivingExpensesCents', 'variableLivingExpensesCents',
      'propertyInstallmentCents', 'otherDebtsCents', 'emergencyReserveCents',
      'safetyMarginCents', 'postMoveExpensesCents'
    ], 'orçamento');
    validateRate(assumptions.annualInflationRate ?? 0, 'inflação anual');
    validateRate(assumptions.yieldRateAnnual ?? 0, 'rendimento anual');
    validateRate(assumptions.contingencyPercent ?? 0, 'contingência');
    const baseDate = optionsOverride.referenceDate || project.baseDate || project.createdAt?.slice(0, 10);
    if (!isValidDate(baseDate)) throw new Error('A data-base do planejamento é inválida.');

    const keysDate = project.apartment.keysDate || '';
    const moveDate = project.apartment.moveDate || '';
    if (keysDate && !isValidDate(keysDate)) throw new Error('A data prevista das chaves é inválida.');
    if (moveDate && !isValidDate(moveDate)) throw new Error('A data prevista da mudança é inválida.');
    const monthsToKeys = keysDate ? monthIndex(baseDate, keysDate) : null;
    const monthsToMove = moveDate ? monthIndex(baseDate, moveDate) : null;
    if (monthsToKeys !== null && monthsToKeys < 0) {
      throw new Error('A data das chaves é anterior à data-base. Confirme se o imóvel já foi entregue.');
    }
    if (monthsToMove !== null && monthsToMove < 0) {
      throw new Error('A data da mudança é anterior à data-base.');
    }
    if (keysDate && moveDate && moveDate < keysDate) {
      throw new Error('A mudança não pode estar prevista antes da entrega das chaves.');
    }
    const contingencyRule = resolveContingencyRule(assumptions);
    const contingencyMode = contingencyRule === CONTINGENCY_RULE.TARGET ? 'target' : 'legacy';
    const contingencyTargetDate = contingencyMode === 'target' ? (assumptions.contingencyTargetDate || '') : '';
    if (contingencyTargetDate && !isValidDate(contingencyTargetDate)) {
      throw new Error('A data-alvo da contingência é inválida.');
    }
    const targetMonth = contingencyTargetDate ? monthIndex(baseDate, contingencyTargetDate) : null;
    if (targetMonth !== null && targetMonth < 0) {
      throw new Error('A data-alvo da contingência é anterior à data-base.');
    }

    const processedItems = items.map(item => this.processItemCost(item, assumptions));
    const latestPaymentMonth = processedItems.reduce((latest, item) =>
      item.calculatedPayments.reduce((last, payment) =>
        payment.isPaid ? last : Math.max(last, payment.monthIndex), latest), 0);
    const lastRelevantDate = Math.max(monthsToKeys ?? 0, monthsToMove ?? 0);
    const horizonMonths = Math.max(36, lastRelevantDate + 6, latestPaymentMonth, targetMonth ?? 0);
    if (horizonMonths > MAX_PROJECTION_MONTHS) {
      throw new Error('O horizonte excede 100 anos. Revise as datas e vencimentos informados.');
    }
    const monthlyProjectPayments = Array(horizonMonths + 1).fill(0);
    const monthlyPaymentDetails = Array.from({ length: horizonMonths + 1 }, () => []);

    processedItems.forEach(item => {
      const commitmentExists = FIRM_STATUSES.includes(item.status);
      const selectedForPlan = item.scope === SCOPE_OPTIONS.INCLUDE ||
        item.scope === SCOPE_OPTIONS.ALREADY_OWNED || commitmentExists;
      if (!selectedForPlan) return;

      item.calculatedPayments.forEach(payment => {
        if (payment.isPaid) return;
        const month = payment.monthIndex;
        if (!Number.isInteger(month) || month < 0) {
          throw new Error(`Mês de pagamento inválido no item "${item.name}".`);
        }
        monthlyProjectPayments[month] += payment.amountCents;
        monthlyPaymentDetails[month].push({
          itemId: item.id,
          itemName: item.name,
          description: payment.description || 'Pagamento',
          amountCents: payment.amountCents,
          isDeposit: !!payment.isDeposit
        });
      });
    });

    const missingFields = [];
    const requiredBudgetFields = budgetProfile.mode === 'detailed'
      ? ['initialBalanceCents', 'netMonthlyIncomeCents', 'fixedLivingExpensesCents',
        'variableLivingExpensesCents', 'propertyInstallmentCents', 'otherDebtsCents',
        'safetyMarginCents', 'monthlyCapCents', 'postMoveExpensesCents']
      : ['initialBalanceCents', 'monthlyCapCents'];
    requiredBudgetFields.forEach(field => {
      if (profileData[field] === null || profileData[field] === undefined) missingFields.push(field);
    });
    processedItems.forEach(item => {
      if ((item.scope === SCOPE_OPTIONS.INCLUDE || item.scope === SCOPE_OPTIONS.POSTPONE) &&
          item.priceKnown === false) {
        missingFields.push(`price:${item.id}`);
      }
    });
    if (monthsToKeys === null) missingFields.push('apartment.keysDate');
    if (monthsToMove === null) missingFields.push('apartment.moveDate');
    if (contingencyMode === 'target' && (assumptions.contingencyPercent ?? 0) > 0 && targetMonth === null) {
      missingFields.push('assumptions.contingencyTargetDate');
    }

    const initialBalanceCents = profileData.initialBalanceCents ?? 0;
    const monthlyCapCents = profileData.monthlyCapCents ?? 0;
    const extraIncomes = profileData.extraIncomes || [];
    const atypicalMonths = profileData.atypicalMonths || {};
    extraIncomes.forEach(income => {
      if (!Number.isSafeInteger(income.amountCents) || income.amountCents < 0 ||
          !Number.isInteger(income.monthIndex) || income.monthIndex < 0) {
        throw new Error(`Entrada extra inválida: ${income.name || income.id || 'sem identificação'}.`);
      }
    });
    Object.entries(atypicalMonths).forEach(([month, amount]) => {
      if (!/^\d+$/.test(month) || Number(month) === 0 ||
          !Number.isSafeInteger(amount) || amount < 0) {
        throw new Error(`Aporte planejado inválido para o mês ${month}.`);
      }
    });
    const isDetailed = budgetProfile.mode === 'detailed';
    const totalIncludedCostCents = processedItems
      .filter(item => item.scope === SCOPE_OPTIONS.INCLUDE || item.scope === SCOPE_OPTIONS.ALREADY_OWNED)
      .reduce((sum, item) => sum + item.totalInstalledCostCents, 0);
    const contingencyProtectedCents = Math.round(
      totalIncludedCostCents * (assumptions.contingencyPercent ?? 0)
    );
    // A reserva só é exigida a partir do primeiro desembolso previsto; antes disso ela está em formação.
    // Regra anterior (projetos migrados): reserva integral desde o primeiro desembolso.
    const firstPaymentMonth = monthlyProjectPayments.findIndex(amount => amount > 0);
    const contingencyStartMonth = contingencyMode === 'target'
      ? targetMonth
      : (contingencyRule === CONTINGENCY_RULE.MONTH_ZERO || firstPaymentMonth === -1 ? 0 : firstPaymentMonth);
    let firstReserveShortfallMonth = null;
    let worstReserveShortfallMonth = null;
    let maxReserveShortfallCents = 0;
    const monthlyLedger = [];
    let currentBalanceCents = initialBalanceCents;
    let totalContributionsCents = 0;
    let maxDeficitCents = 0;
    let worstDeficitMonth = null;
    let firstDeficitMonth = null;
    let hasFamilyBudgetDeficit = false;
    const yieldAnnual = assumptions.yieldRateAnnual ?? 0;
    const monthlyYieldRate = yieldAnnual > 0 ? Math.pow(1 + yieldAnnual, 1 / 12) - 1 : 0;

    for (let month = 0; month <= horizonMonths; month++) {
      const extraIncomeMonthCents = extraIncomes
        .filter(income => Number(income.monthIndex) === month)
        .reduce((sum, income) => sum + (income.amountCents || 0), 0);
      let netAvailabilityCents = monthlyCapCents;
      let capacityCents = monthlyCapCents;
      let maxContributionCents = 0;
      let familyBudgetDeficitCents = 0;

      if (isDetailed) {
        const income = profileData.netMonthlyIncomeCents ?? 0;
        const living = (profileData.fixedLivingExpensesCents ?? 0) +
          (profileData.variableLivingExpensesCents ?? 0);
        const property = (profileData.propertyInstallmentCents ?? 0) +
          (monthsToKeys !== null && month >= monthsToKeys ? (profileData.postMoveExpensesCents ?? 0) : 0);
        const debts = profileData.otherDebtsCents ?? 0;
        const safetyMargin = profileData.safetyMarginCents ?? 0;
        netAvailabilityCents = income - living - property - debts - safetyMargin;
        if (netAvailabilityCents < 0) {
          familyBudgetDeficitCents = Math.abs(netAvailabilityCents);
          hasFamilyBudgetDeficit = true;
        }
        capacityCents = Math.max(0, netAvailabilityCents);
        const configuredCap = atypicalMonths[month] ?? monthlyCapCents;
        maxContributionCents = month === 0 ? 0 : Math.min(configuredCap, capacityCents);
      } else {
        const configuredCap = atypicalMonths[month] ?? monthlyCapCents;
        maxContributionCents = month === 0 ? 0 : configuredCap;
      }

      const plannedContributionCents = maxContributionCents;
      totalContributionsCents += plannedContributionCents;
      const yieldCents = Math.round(Math.max(0, currentBalanceCents) * monthlyYieldRate);
      const startBalanceCents = currentBalanceCents;
      const paymentsThisMonthCents = monthlyProjectPayments[month];
      const endBalanceCents = startBalanceCents + plannedContributionCents +
        extraIncomeMonthCents + yieldCents - paymentsThisMonthCents;
      const reserveApplies = contingencyStartMonth !== null && month >= contingencyStartMonth;
      const requiredReserveCents = reserveApplies ? contingencyProtectedCents : 0;
      const freeBalanceCents = endBalanceCents - requiredReserveCents;
      const reserveFormedCents = Math.max(0, Math.min(contingencyProtectedCents, endBalanceCents));
      const reserveShortfallCents = contingencyProtectedCents - reserveFormedCents;
      // Regra anterior: déficit = saldo livre negativo. Nova regra: déficit = caixa negativo.
      const deficitCents = contingencyMode === 'legacy'
        ? Math.max(0, -freeBalanceCents)
        : Math.max(0, -endBalanceCents);

      if (deficitCents > 0) {
        if (firstDeficitMonth === null) firstDeficitMonth = month;
        if (deficitCents > maxDeficitCents) {
          maxDeficitCents = deficitCents;
          worstDeficitMonth = month;
        }
      }
      if (contingencyMode === 'target' && reserveApplies && endBalanceCents >= 0 && reserveShortfallCents > 0) {
        if (firstReserveShortfallMonth === null) firstReserveShortfallMonth = month;
        if (reserveShortfallCents > maxReserveShortfallCents) {
          maxReserveShortfallCents = reserveShortfallCents;
          worstReserveShortfallMonth = month;
        }
      }

      monthlyLedger.push({
        monthIndex: month,
        isKeysMonth: monthsToKeys !== null && month === monthsToKeys,
        isMoveMonth: monthsToMove !== null && month === monthsToMove,
        startBalanceCents,
        maxContributionCents,
        plannedContributionCents,
        extraIncomeMonthCents,
        yieldCents,
        paymentsThisMonthCents,
        endBalanceCents,
        freeBalanceCents,
        deficitCents,
        contingencyProtectedCents: requiredReserveCents,
        reserveTargetCents: contingencyProtectedCents,
        reserveFormedCents,
        reserveShortfallCents,
        familyBudgetDeficitCents,
        paymentDetails: monthlyPaymentDetails[month]
      });
      currentBalanceCents = endBalanceCents;
    }

    let totalEssentialCostCents = 0;
    let totalImportantCostCents = 0;
    let totalOptionalCostCents = 0;
    let essentialItemsReadyBeforeMove = monthsToMove === null ? null : true;
    const delayedEssentialItems = [];
    const postponedEssentialItems = processedItems.filter(item =>
      item.scope === SCOPE_OPTIONS.POSTPONE && item.priority === PRIORITY_OPTIONS.ESSENTIAL);
    const selectedItemCount = processedItems.filter(item =>
      item.scope === SCOPE_OPTIONS.INCLUDE || item.scope === SCOPE_OPTIONS.ALREADY_OWNED).length;

    processedItems.forEach(item => {
      if (item.scope !== SCOPE_OPTIONS.INCLUDE && item.scope !== SCOPE_OPTIONS.ALREADY_OWNED) return;
      if (item.priority === PRIORITY_OPTIONS.ESSENTIAL) {
        totalEssentialCostCents += item.totalInstalledCostCents;
        if (monthsToMove !== null && item.deliveryMonthIndex > monthsToMove &&
            item.scope === SCOPE_OPTIONS.INCLUDE) {
          essentialItemsReadyBeforeMove = false;
          delayedEssentialItems.push(item);
        }
      } else if (item.priority === PRIORITY_OPTIONS.IMPORTANT) {
        totalImportantCostCents += item.totalInstalledCostCents;
      } else if (item.priority === PRIORITY_OPTIONS.OPTIONAL) {
        totalOptionalCostCents += item.totalInstalledCostCents;
      }
    });

    // Quitação não confirmada pode ser uma saída futura: a conclusão fica preliminar.
    const settlementReview = processedItems
      .filter(item => item.scope === SCOPE_OPTIONS.INCLUDE && needsSettlementConfirmation(item))
      .map(item => ({ id: item.id, name: item.name, amountCents: item.basePriceCents }));
    settlementReview.forEach(entry => missingFields.push(`settlement:${entry.id}`));

    const postMoveStart = monthsToMove === null ? horizonMonths + 1 : monthsToMove + 1;
    const postMoveLiabilitiesCents = monthlyProjectPayments
      .slice(postMoveStart)
      .reduce((sum, amount) => sum + amount, 0);

    return {
      baseDate,
      monthsToKeys,
      monthsToMove,
      horizonMonths,
      processedItems,
      monthlyLedger,
      totalEssentialCostCents,
      totalImportantCostCents,
      totalOptionalCostCents,
      totalIncludedCostCents,
      contingencyProtectedCents,
      contingencyStartMonth,
      postponedEssentialItems,
      selectedItemCount,
      totalContributionsCents,
      finalBalanceCents: monthlyLedger[horizonMonths].endBalanceCents,
      finalFreeBalanceCents: monthlyLedger[horizonMonths].freeBalanceCents,
      balanceAtMoveCents: monthsToMove === null ? null : monthlyLedger[monthsToMove]?.endBalanceCents ?? null,
      firstDeficitMonth,
      maxDeficitCents,
      worstDeficitMonth,
      hasFamilyBudgetDeficit,
      essentialItemsReadyBeforeMove,
      delayedEssentialItems,
      postMoveLiabilitiesCents,
      missingFields,
      hasCompleteData: missingFields.length === 0,
      contingency: {
        mode: contingencyMode,
        rule: contingencyRule,
        ruleNeedsReview: contingencyRuleNeedsReview(assumptions),
        percent: assumptions.contingencyPercent ?? 0,
        protectedCents: contingencyProtectedCents,
        targetDate: contingencyTargetDate || null,
        targetMonth,
        projectedAtTargetCents: targetMonth !== null ? monthlyLedger[targetMonth].endBalanceCents : null,
        formedAtTargetCents: targetMonth !== null ? monthlyLedger[targetMonth].reserveFormedCents : null,
        shortfallAtTargetCents: targetMonth !== null ? monthlyLedger[targetMonth].reserveShortfallCents : null,
        sufficientAtTarget: targetMonth !== null
          ? monthlyLedger[targetMonth].reserveShortfallCents === 0
          : null,
        firstReserveShortfallMonth,
        worstReserveShortfallMonth,
        maxReserveShortfallCents
      },
      settlementReview,
      isAudited: false
    };
  }

  static processItemCost(item, assumptions, _horizonMonths) {
    validateMoneyFields(item, [
      'basePriceCents', 'shippingCents', 'assemblyCents',
      'installationCents', 'additionalCostsCents'
    ], `item "${item.name || item.id || ''}"`);
    const isFirm = FIRM_STATUSES.includes(item.status);
    const isSettled = SETTLED_STATUSES.includes(item.status);
    const annualInflation = assumptions.annualInflationRate ?? 0;
    const applyInflation = !!assumptions.applyInflationToUncontracted &&
      !isFirm && annualInflation > 0;
    const basePrice = item.basePriceCents ?? 0;
    const accessoryCosts = (item.shippingCents ?? 0) + (item.assemblyCents ?? 0) +
      (item.installationCents ?? 0) + (item.additionalCostsCents ?? 0);
    const rawBaseCost = (item.scope === SCOPE_OPTIONS.ALREADY_OWNED ? 0 : basePrice) + accessoryCosts;
    const priceKnown = item.scope === SCOPE_OPTIONS.ALREADY_OWNED ||
      Number.isSafeInteger(item.basePriceCents);
    const deliveryMonth = item.deliveryMonthIndex ?? 36;
    if (!Number.isInteger(deliveryMonth) || deliveryMonth < 0) {
      throw new Error(`Mês de entrega inválido no item "${item.name}".`);
    }

    const totalInstalledCostCents = applyInflation && deliveryMonth > 0
      ? Math.round(rawBaseCost * Math.pow(1 + annualInflation, deliveryMonth / 12))
      : rawBaseCost;
    let calculatedPayments;

    if (Array.isArray(item.payments) && item.payments.length > 0) {
      item.payments.forEach(payment => {
        if (!Number.isSafeInteger(payment.amountCents) || payment.amountCents < 0 ||
            !Number.isInteger(payment.monthIndex) || payment.monthIndex < 0) {
          throw new Error(`Pagamento inválido no item "${item.name}".`);
        }
      });
      const paidPayments = item.payments.filter(payment => payment.isPaid);
      const pendingPayments = item.payments.filter(payment => !payment.isPaid);
      calculatedPayments = [...paidPayments.map(payment => ({ ...payment }))];

      if (isFirm) {
        calculatedPayments.push(...pendingPayments.map(payment => ({ ...payment })));
      } else {
        const paidTotal = paidPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
        const targetPending = Math.max(0, totalInstalledCostCents - paidTotal);
        const originalPending = pendingPayments.reduce((sum, payment) => sum + payment.amountCents, 0);
        if (pendingPayments.length > 0 && originalPending > 0) {
          let allocated = 0;
          pendingPayments.forEach((payment, index) => {
            const amountCents = index === pendingPayments.length - 1
              ? targetPending - allocated
              : Math.round(targetPending * payment.amountCents / originalPending);
            allocated += amountCents;
            calculatedPayments.push({ ...payment, amountCents });
          });
        } else if (targetPending > 0) {
          calculatedPayments.push({
            amountCents: targetPending,
            monthIndex: deliveryMonth,
            isPaid: false,
            description: 'Pagamento pendente',
            linkedToDelivery: true,
            isDeposit: false
          });
        }
      }
    } else if (isSettled) {
      // Compra principal já quitada; só custos acessórios ainda são devidos.
      calculatedPayments = [];
      if (basePrice > 0 && item.scope !== SCOPE_OPTIONS.ALREADY_OWNED) {
        calculatedPayments.push({
          amountCents: basePrice, monthIndex: 0, isPaid: true,
          description: 'Compra declarada como paga (sem histórico; data não informada)',
          isDeposit: false, dateUnknown: true, paidDate: null,
          origin: SETTLEMENT_ORIGIN.IMPORTED_UNCONFIRMED
        });
      }
      if (accessoryCosts > 0) {
        calculatedPayments.push({
          amountCents: accessoryCosts, monthIndex: deliveryMonth, isPaid: false,
          description: 'Custos acessórios pendentes', isDeposit: false,
          linkedToDelivery: true, source: PAYMENT_SOURCE.AUTO_ACCESSORY
        });
      }
    } else {
      calculatedPayments = totalInstalledCostCents > 0 ? [{
        amountCents: totalInstalledCostCents,
        monthIndex: deliveryMonth,
        isPaid: false,
        description: 'Pagamento total do item',
        linkedToDelivery: true,
        isDeposit: false
      }] : [];
    }

    return {
      ...item,
      priceKnown,
      rawBaseCostCents: rawBaseCost,
      totalInstalledCostCents,
      deliveryMonthIndex: deliveryMonth,
      calculatedPayments
    };
  }
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function monthIndex(baseDate, targetDate) {
  const base = new Date(`${baseDate}T00:00:00Z`);
  const target = new Date(`${targetDate}T00:00:00Z`);
  if (target.getTime() < base.getTime() &&
      target.getUTCFullYear() === base.getUTCFullYear() &&
      target.getUTCMonth() === base.getUTCMonth()) {
    throw new Error('A data do evento é anterior ao dia da data-base no mesmo mês.');
  }
  return (target.getUTCFullYear() - base.getUTCFullYear()) * 12 +
    target.getUTCMonth() - base.getUTCMonth();
}

function validateMoneyFields(object, fields, label) {
  fields.forEach(field => {
    const value = object?.[field];
    if (value !== null && value !== undefined &&
        (!Number.isSafeInteger(value) || value < 0)) {
      throw new Error(`Valor de ${label} inválido em ${field}; use centavos inteiros não negativos.`);
    }
  });
}

function validateRate(value, label) {
  if (!Number.isFinite(value) || value < 0 || value > 5) {
    throw new Error(`A taxa de ${label} deve ser um percentual decimal entre 0 e 5.`);
  }
}
