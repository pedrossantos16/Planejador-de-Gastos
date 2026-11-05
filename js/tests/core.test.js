import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, SCOPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../models/types.js';
import { parseMoneyToCents } from '../models/money.js';
import { FinancialEngine } from '../engine/FinancialEngine.js';
import { Recommender } from '../engine/Recommender.js';
import { ScenarioEngine } from '../engine/ScenarioEngine.js';
import { StorageManager } from '../storage/StorageManager.js';
import { mergeItemEdit } from '../ui/ItemsUI.js';
import { planDeliveryShift, settlementState } from '../models/payments.js';
import { buildAnalysisSummary, XLSX_LIMITATION, PDF_LIMITATION } from '../export/AnalysisSummary.js';
import { ExcelExporter } from '../export/ExcelExporter.js';
import { PdfExporter } from '../export/PdfExporter.js';
import { NeedsEngine } from '../engine/NeedsEngine.js';
import { LayoutEngine } from '../engine/LayoutEngine.js';

function projectWithBaseDate() {
  const project = createDefaultProject();
  project.baseDate = '2026-01-15';
  project.apartment.keysDate = '2029-01-15';
  project.apartment.moveDate = '2029-02-15';
  return project;
}

function setSimpleBudget(project, initialBalanceCents, monthlyCapCents) {
  project.budgetProfile.mode = 'simplified';
  project.budgetProfile.simplified.initialBalanceCents = initialBalanceCents;
  project.budgetProfile.simplified.monthlyCapCents = monthlyCapCents;
}

test('36 aportes começam no mês 1 e somam R$ 46.000 ao saldo inicial', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 1_000_000, 100_000);
  project.items = [];

  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });

  assert.equal(result.monthlyLedger[0].plannedContributionCents, 0);
  assert.equal(result.monthlyLedger[36].endBalanceCents, 4_600_000);
});

test('um pagamento no mês 4 sinaliza déficit mesmo com saldo final projetado positivo', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 1_000_000, 100_000);
  project.items = [{
    id: 'item-sinal',
    name: 'Sinal',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.QUOTED,
    basePriceCents: 2_000_000,
    deliveryMonthIndex: 4,
    payments: [{ amountCents: 2_000_000, monthIndex: 4, isPaid: false }]
  }];

  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });

  assert.equal(result.firstDeficitMonth, 4);
  assert.ok(result.finalBalanceCents > 0);
});

test('modo detalhado limita o aporte à capacidade calculada e ao teto autorizado', () => {
  const project = projectWithBaseDate();
  const detail = project.budgetProfile.detailed;
  project.budgetProfile.mode = 'detailed';
  detail.initialBalanceCents = 0;
  detail.monthlyCapCents = 200_000;
  detail.netMonthlyIncomeCents = 800_000;
  detail.fixedLivingExpensesCents = 300_000;
  detail.variableLivingExpensesCents = 100_000;
  detail.propertyInstallmentCents = 200_000;
  detail.otherDebtsCents = 0;
  detail.safetyMarginCents = 50_000;
  project.items = [];

  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });

  assert.equal(result.monthlyLedger[1].maxContributionCents, 150_000);
});

test('mês zero é aceito e pagamento no mês 60 mantém o horizonte original', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 100_000);
  project.items = [{
    id: 'item-pagamento',
    name: 'Pagamento imediato e parcela futura',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.QUOTED,
    basePriceCents: 100_000,
    deliveryMonthIndex: 0,
    payments: [
      { amountCents: 0, monthIndex: 0, isPaid: false },
      { amountCents: 100_000, monthIndex: 60, isPaid: false }
    ]
  }];

  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });

  assert.equal(result.processedItems[0].deliveryMonthIndex, 0);
  assert.equal(result.monthlyLedger[0].paymentsThisMonthCents, 0);
  assert.equal(result.monthlyLedger[60].paymentsThisMonthCents, 100_000);
  assert.equal(result.horizonMonths, 60);
});

test('pagamento já realizado não é debitado novamente, mas frete futuro continua no fluxo', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 500_000, 0);
  project.items = [{
    id: 'item-quitado',
    name: 'Item comprado',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.BOUGHT,
    basePriceCents: 500_000,
    shippingCents: 5_000,
    deliveryMonthIndex: 5,
    payments: [
      { amountCents: 500_000, monthIndex: 2, isPaid: true, description: 'Compra já paga' },
      { amountCents: 5_000, monthIndex: 5, isPaid: false, description: 'Frete futuro' }
    ]
  }];

  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });

  assert.equal(result.monthlyLedger[2].paymentsThisMonthCents, 0);
  assert.equal(result.monthlyLedger[5].paymentsThisMonthCents, 5_000);
  assert.equal(result.monthlyLedger[5].paymentDetails[0].description, 'Frete futuro');
});

test('editar nome preserva contrato e pagamentos; alterar estimativa só recalcula pendências', () => {
  const existing = {
    id: 'item-contratado',
    name: 'Nome anterior',
    status: STATUS_OPTIONS.CONTRACTED,
    scope: SCOPE_OPTIONS.INCLUDE,
    basePriceCents: 1_000_000,
    shippingCents: 10_000,
    assemblyCents: 20_000,
    installationCents: 30_000,
    additionalCostsCents: 40_000,
    supplier: 'Fornecedor',
    source: 'Proposta assinada',
    dimensions: '2 x 3 m',
    payments: [
      { amountCents: 300_000, monthIndex: 1, isPaid: true },
      { amountCents: 800_000, monthIndex: 5, isPaid: false }
    ]
  };
  const updates = {
    ...existing,
    name: 'Nome atualizado',
    installationTotalCents: 50_000,
    deliveryMonthIndex: 5
  };
  const renamed = mergeItemEdit(existing, updates, {});
  assert.equal(renamed.name, 'Nome atualizado');
  assert.deepEqual(renamed.payments, existing.payments);
  assert.equal(renamed.supplier, existing.supplier);
  assert.equal(renamed.source, existing.source);
  assert.equal(renamed.dimensions, existing.dimensions);
  assert.equal(renamed.additionalCostsCents, existing.additionalCostsCents);

  const estimate = {
    id: 'item-estimado',
    name: 'Armário',
    status: STATUS_OPTIONS.SEARCH,
    scope: SCOPE_OPTIONS.INCLUDE,
    basePriceCents: 1_000_000,
    shippingCents: 0,
    installationCents: 0,
    assemblyCents: 0,
    additionalCostsCents: 0,
    payments: [
      { amountCents: 300_000, monthIndex: 1, isPaid: true },
      { amountCents: 700_000, monthIndex: 5, isPaid: false }
    ]
  };
  const repriced = mergeItemEdit(estimate, {
    ...estimate,
    basePriceCents: 700_000,
    installationTotalCents: 0,
    deliveryMonthIndex: 5
  }, {});
  assert.equal(repriced.payments[0].amountCents, 300_000);
  assert.equal(repriced.payments[0].isPaid, true);
  assert.equal(repriced.payments[1].amountCents, 400_000);
});

test('preço desconhecido não é zero e zero explícito continua válido', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 0);
  project.items = [{
    id: 'item-sem-preco',
    name: 'Cama',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.SEARCH,
    deliveryMonthIndex: 1
  }];
  const unknownResult = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.ok(unknownResult.missingFields.includes('price:item-sem-preco'));

  project.items[0].basePriceCents = 0;
  const zeroResult = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.ok(!zeroResult.missingFields.includes('price:item-sem-preco'));
  assert.equal(parseMoneyToCents('-100'), null);
});

test('choque único de 15% e inflação anual composta são cálculos diferentes', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 0);
  project.assumptions.annualInflationRate = 0;
  project.items = [{
    id: 'item-preco',
    name: 'Sofá',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.SEARCH,
    basePriceCents: 1_000_000,
    deliveryMonthIndex: 36
  }];
  const shocked = Recommender.applyOneTimePriceShock(project, 0.15);
  assert.equal(FinancialEngine.calculate(shocked, { referenceDate: '2026-01-15' }).totalIncludedCostCents, 1_150_000);

  project.assumptions.annualInflationRate = 0.06;
  project.assumptions.applyInflationToUncontracted = true;
  assert.equal(FinancialEngine.calculate(project, { referenceDate: '2026-01-15' }).totalIncludedCostCents, 1_191_016);
});

test('cenário de atraso desloca a mudança com segurança para depois das chaves', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 100_000);
  project.apartment.keysDate = '2029-01-31';
  project.apartment.moveDate = '2029-02-28';
  project.items = [];

  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  const risks = Recommender.runRiskAnalysis(project, result);

  assert.equal(Recommender.shiftDateByMonths('2026-08-31', 6), '2027-02-28');
  assert.equal(risks.length, 3);
});

test('contingência zero permanece zero e a parcela protegida reduz o saldo livre', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 2_000_000, 0);
  project.assumptions.contingencyRule = 'first_disbursement';
  project.assumptions.contingencyPercent = 0;
  project.items = [{
    id: 'item-reserva',
    name: 'Armário',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.SEARCH,
    basePriceCents: 1_000_000,
    deliveryMonthIndex: 1
  }];
  const noReserve = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  project.assumptions.contingencyPercent = 0.1;
  const withReserve = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(noReserve.contingencyProtectedCents, 0);
  assert.equal(noReserve.finalFreeBalanceCents - withReserve.finalFreeBalanceCents, 100_000);
});

test('uma conclusão preliminar usa a regra canônica, sem tratar preço pendente como viável', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 0);
  project.items = [{
    id: 'item-pendente',
    name: 'Cama',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.SEARCH,
    deliveryMonthIndex: 5
  }];
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(ScenarioEngine.evaluateViability(result).status, 'insufficient_data');
});

test('validar/importar é puro e falha sem substituir o projeto salvo', () => {
  const memory = new Map();
  const fakeStorage = {
    getItem: key => memory.get(key) ?? null,
    setItem: (key, value) => memory.set(key, value),
    removeItem: key => memory.delete(key)
  };
  StorageManager.setStorage(fakeStorage);
  const original = JSON.stringify(projectWithBaseDate());
  memory.set('meu_ape_planejado_project', original);

  const imported = StorageManager.importFromJsonText('{"project":{"apartment":{}}}');

  assert.equal(imported.success, false);
  assert.equal(memory.get('meu_ape_planejado_project'), original);
  StorageManager.setStorage(null);
});

function boughtItem(overrides = {}) {
  return {
    id: 'item-comprado',
    name: 'Sofá',
    scope: SCOPE_OPTIONS.INCLUDE,
    priority: PRIORITY_OPTIONS.ESSENTIAL,
    status: STATUS_OPTIONS.QUOTED,
    basePriceCents: 100_000,
    shippingCents: 10_000,
    installationCents: 0,
    assemblyCents: 0,
    additionalCostsCents: 0,
    deliveryMonthIndex: 5,
    payments: [],
    ...overrides
  };
}

test('marcar item como comprado pelo formulário não gera novo débito da compra, mas mantém o frete', () => {
  const quoted = boughtItem();
  const merged = mergeItemEdit(quoted, {
    ...quoted,
    status: STATUS_OPTIONS.BOUGHT,
    installationTotalCents: 0
  }, {});
  const project = projectWithBaseDate();
  setSimpleBudget(project, 20_000, 0);
  project.items = [merged];

  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });

  assert.equal(result.monthlyLedger[5].paymentsThisMonthCents, 10_000);
  assert.equal(result.monthlyLedger[0].paymentsThisMonthCents, 0);
  assert.equal(result.firstDeficitMonth, null);
});

test('item comprado sem pagamentos registrados também não debita a compra de novo', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 0);
  project.items = [boughtItem({ status: STATUS_OPTIONS.BOUGHT, shippingCents: 0 })];
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.firstDeficitMonth, null);
});

test('frete pendente de item comprado permanece mesmo quando o escopo vira excluído', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 100_000, 0);
  project.items = [boughtItem({
    status: STATUS_OPTIONS.BOUGHT,
    scope: SCOPE_OPTIONS.EXCLUDE,
    payments: [
      { amountCents: 100_000, monthIndex: 1, isPaid: true },
      { amountCents: 10_000, monthIndex: 5, isPaid: false, description: 'Frete' }
    ]
  })];
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.monthlyLedger[5].paymentsThisMonthCents, 10_000);
});

test('item entregue não recebe reajuste de inflação', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 0);
  project.assumptions.annualInflationRate = 0.1;
  project.assumptions.applyInflationToUncontracted = true;
  project.items = [boughtItem({
    status: STATUS_OPTIONS.DELIVERED, shippingCents: 0, deliveryMonthIndex: 36
  })];
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.totalIncludedCostCents, 100_000);
});

test('mudança no mesmo mês, mas antes das chaves, é rejeitada', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 0);
  project.apartment.keysDate = '2029-01-25';
  project.apartment.moveDate = '2029-01-05';
  assert.throws(() => FinancialEngine.calculate(project, { referenceDate: '2026-01-15' }), /antes da entrega/);
});

test('contingência é exigida a partir do primeiro desembolso, não do mês zero', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 100_000);
  project.assumptions.contingencyRule = 'first_disbursement';
  project.assumptions.contingencyPercent = 0.1;
  project.items = [boughtItem({
    basePriceCents: 1_000_000, shippingCents: 0, deliveryMonthIndex: 36
  })];
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.contingencyStartMonth, 36);
  assert.equal(result.firstDeficitMonth, null);
  assert.equal(result.monthlyLedger[36].freeBalanceCents, 2_500_000);
});

test('projeto só com itens excluídos ou essencial adiado não é considerado viável', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 1_000_000, 100_000);
  project.items = [boughtItem({ scope: SCOPE_OPTIONS.EXCLUDE })];
  let result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(ScenarioEngine.evaluateViability(result).status, 'insufficient_data');

  project.items = [
    boughtItem({ id: 'a', scope: SCOPE_OPTIONS.POSTPONE }),
    boughtItem({ id: 'b', priority: PRIORITY_OPTIONS.OPTIONAL })
  ];
  result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(ScenarioEngine.evaluateViability(result).status, 'requires_adjustments');
});

test('painel de riscos não aprova plano com dados insuficientes', () => {
  const project = projectWithBaseDate();
  project.budgetProfile.mode = 'simplified';
  project.items = [boughtItem({ basePriceCents: null })];
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  const risks = Recommender.runRiskAnalysis(project, result);
  assert.ok(risks.every(risk => risk.isViable === null));
});

function formUpdates(overrides = {}) {
  return {
    id: 'item-form', roomId: 'r1', name: 'Sofá', priority: PRIORITY_OPTIONS.ESSENTIAL,
    scope: SCOPE_OPTIONS.INCLUDE, strategy: 'balanced', status: STATUS_OPTIONS.QUOTED,
    basePriceCents: 120_000, shippingCents: 0, installationTotalCents: 0, deliveryMonthIndex: 10,
    ...overrides
  };
}

function itemWithPayments(payments) {
  return boughtItem({
    basePriceCents: 120_000, shippingCents: 0, deliveryMonthIndex: 5,
    status: STATUS_OPTIONS.CONTRACTED, payments
  });
}

test('mudança de entrega desloca somente pagamento pendente vinculado, com confirmação', () => {
  const existing = itemWithPayments([
    { amountCents: 50_000, monthIndex: 5, isPaid: false, linkedToDelivery: true },
    { amountCents: 70_000, monthIndex: 5, isPaid: false, linkedToDelivery: true }
  ]);
  const declined = mergeItemEdit(existing, formUpdates(), {}, {});
  assert.deepEqual(declined.payments.map(p => p.monthIndex), [5, 5]);
  const shifted = mergeItemEdit(existing, formUpdates(), {}, { shiftLinkedPayments: true });
  assert.deepEqual(shifted.payments.map(p => p.monthIndex), [10, 10]);
});

test('parcela negociada independente da entrega e dado antigo sem vínculo não são deslocados', () => {
  const existing = itemWithPayments([
    { amountCents: 40_000, monthIndex: 5, isPaid: false, linkedToDelivery: true },
    { amountCents: 40_000, monthIndex: 8, isPaid: false, linkedToDelivery: false },
    { amountCents: 40_000, monthIndex: 6, isPaid: false }
  ]);
  const plan = planDeliveryShift(existing, 10);
  assert.equal(plan.shiftable.length, 1);
  assert.equal(plan.independentCount, 1);
  assert.equal(plan.unlinkedCount, 1);
  const shifted = mergeItemEdit(existing, formUpdates(), {}, { shiftLinkedPayments: true });
  assert.deepEqual(shifted.payments.map(p => p.monthIndex), [10, 8, 6]);
});

test('pagamento realizado permanece inalterado ao mudar a entrega', () => {
  const existing = itemWithPayments([
    { amountCents: 20_000, monthIndex: 1, isPaid: true, linkedToDelivery: true },
    { amountCents: 100_000, monthIndex: 5, isPaid: false, linkedToDelivery: true }
  ]);
  const shifted = mergeItemEdit(existing, formUpdates(), {}, { shiftLinkedPayments: true });
  assert.equal(shifted.payments[0].monthIndex, 1);
  assert.equal(shifted.payments[0].isPaid, true);
  assert.equal(shifted.payments[1].monthIndex, 10);
});

function contingencyProject(initialCents, capCents, items) {
  const project = projectWithBaseDate();
  setSimpleBudget(project, initialCents, capCents);
  project.assumptions.contingencyRule = 'target';
  project.assumptions.contingencyPercent = 0.1;
  project.assumptions.contingencyTargetDate = '2028-01-15';
  project.items = items;
  return project;
}

function scheduledItem(id, amountCents, month) {
  return boughtItem({
    id, name: id, basePriceCents: amountCents, shippingCents: 0, deliveryMonthIndex: month,
    status: STATUS_OPTIONS.CONTRACTED,
    payments: [{ amountCents, monthIndex: month, isPaid: false }]
  });
}

test('compra pequena antecipada não antecipa a data-alvo da contingência', () => {
  const project = contingencyProject(60_000, 10_000, [scheduledItem('pequena', 50_000, 2)]);
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.contingency.targetMonth, 24);
  assert.equal(result.contingencyStartMonth, 24);
  assert.equal(result.monthlyLedger[2].contingencyProtectedCents, 0);
  assert.equal(result.monthlyLedger[2].freeBalanceCents, result.monthlyLedger[2].endBalanceCents);
  assert.equal(result.firstDeficitMonth, null);
});

test('reserva insuficiente na data-alvo difere de déficit de caixa', () => {
  const project = contingencyProject(100_000, 0, [scheduledItem('sinal', 100_000, 3)]);
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.firstDeficitMonth, null);
  assert.equal(result.contingency.sufficientAtTarget, false);
  assert.equal(result.contingency.shortfallAtTargetCents, 10_000);
  assert.equal(result.contingency.firstReserveShortfallMonth, 24);
  const viability = ScenarioEngine.evaluateViability(result, project);
  assert.equal(viability.status, 'requires_adjustments');
  assert.equal(viability.firstReserveShortfallMonth, 24);
});

test('déficit de caixa antes da data-alvo é reportado como déficit, não como falta de reserva', () => {
  const project = contingencyProject(0, 10_000, [scheduledItem('sinal', 100_000, 3)]);
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.firstDeficitMonth, 3);
  assert.equal(result.monthlyLedger[3].deficitCents, 70_000);
  assert.equal(result.contingency.firstReserveShortfallMonth, null);
  assert.equal(result.contingency.sufficientAtTarget, true);
  assert.equal(ScenarioEngine.evaluateViability(result, project).firstDeficitAmountCents, 70_000);
});

test('contingência continua parte protegida do saldo, não uma despesa adicional', () => {
  const project = contingencyProject(100_000, 0, [scheduledItem('sinal', 100_000, 3)]);
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.monthlyLedger[24].paymentsThisMonthCents, 0);
  assert.equal(result.finalBalanceCents, 0);
});

test('salvar de novo um item comprado não duplica a quitação nem o pendente acessório', () => {
  const existing = boughtItem({ basePriceCents: 100_000, shippingCents: 10_000, deliveryMonthIndex: 5 });
  const bought = formUpdates({
    id: existing.id, basePriceCents: 100_000, shippingCents: 10_000,
    deliveryMonthIndex: 5, status: STATUS_OPTIONS.BOUGHT
  });
  const first = mergeItemEdit(existing, bought, {}, {});
  const second = mergeItemEdit(first, bought, {}, { confirmSettlement: true });
  const third = mergeItemEdit(second, bought, {}, {});
  const paid = third.payments.filter(p => p.isPaid);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].amountCents, 100_000);
  assert.equal(paid[0].paidDate, null);
  assert.equal(paid[0].dateUnknown, true);
  assert.equal(third.payments.filter(p => !p.isPaid).length, 1);
  assert.equal(third.payments.filter(p => !p.isPaid)[0].amountCents, 10_000);
});

test('importação de item comprado sem histórico não inventa data e pede confirmação', () => {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 1_000_000, 100_000);
  project.items = [boughtItem({
    status: STATUS_OPTIONS.BOUGHT, basePriceCents: 100_000, shippingCents: 10_000, payments: []
  })];
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  const settlement = result.processedItems[0].calculatedPayments.find(p => p.isPaid);
  assert.equal(settlement.paidDate, null);
  assert.equal(settlement.origin, 'imported_unconfirmed');
  assert.equal(result.settlementReview.length, 1);
  assert.equal(result.monthlyLedger[5].paymentsThisMonthCents, 10_000);
});

function mainProjectWithoutRuleMarker() {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 0, 100_000);
  project.assumptions.contingencyPercent = 0.1;
  project.items = [scheduledItem('compra', 1_000_000, 36)];
  const raw = JSON.parse(JSON.stringify(project));
  delete raw.assumptions.contingencyRule;
  delete raw.assumptions.contingencyRuleConfirmed;
  delete raw.assumptions.ruleSchemaVersion;
  delete raw.assumptions.contingencyMode;
  delete raw.assumptions.contingencyTargetDate;
  return raw;
}

test('projeto da versão publicada sem marcador migra para a reserva desde o mês 0, sem confirmar a origem', () => {
  const migrated = StorageManager.migrateAndValidateSchema(mainProjectWithoutRuleMarker());
  assert.equal(migrated.assumptions.contingencyRule, 'month_zero');
  assert.equal(migrated.assumptions.contingencyRuleConfirmed, false);
  assert.equal(migrated.assumptions.ruleSchemaVersion, 2);
  const result = FinancialEngine.calculate(migrated, { referenceDate: '2026-01-15' });
  assert.equal(result.contingencyStartMonth, 0);
  assert.equal(result.firstDeficitMonth, 0);
  assert.equal(result.contingency.ruleNeedsReview, true);
  const viability = ScenarioEngine.evaluateViability(result, migrated);
  // As interpretações possíveis divergem (déficit no mês 0 x sem déficit): a conclusão é provisória.
  assert.equal(result.contingency.ruleAmbiguity.material, true);
  assert.equal(viability.status, 'insufficient_data');
  assert.ok(result.missingFields.includes('contingencyRule'));
  assert.ok(viability.reasons.some(reason => /Conclusão provisória/.test(reason)));
  assert.ok(viability.missingFieldLabels.some(label => /regra de contingência/.test(label)));
});

test('origem da regra não comprovada sem efeito material mantém a conclusão, com aviso de revisão', () => {
  const raw = mainProjectWithoutRuleMarker();
  raw.items = [];
  const migrated = StorageManager.migrateAndValidateSchema(raw);
  const result = FinancialEngine.calculate(migrated, { referenceDate: '2026-01-15' });
  assert.equal(result.contingency.ruleAmbiguity.material, false);
  assert.ok(!result.missingFields.includes('contingencyRule'));
});

test('marcador de compilação intermediária mantém o primeiro desembolso e a regra explícita não exige revisão', () => {
  const raw = mainProjectWithoutRuleMarker();
  raw.assumptions.contingencyMode = 'legacy';
  const intermediate = StorageManager.migrateAndValidateSchema(raw);
  assert.equal(intermediate.assumptions.contingencyRule, 'first_disbursement');
  assert.equal(intermediate.assumptions.contingencyRuleConfirmed, false);
  const result = FinancialEngine.calculate(intermediate, { referenceDate: '2026-01-15' });
  assert.equal(result.contingencyStartMonth, 36);
  assert.equal(result.firstDeficitMonth, null);

  raw.assumptions.contingencyRule = 'first_disbursement';
  raw.assumptions.contingencyRuleConfirmed = true;
  const confirmed = StorageManager.migrateAndValidateSchema(raw);
  assert.equal(FinancialEngine.calculate(confirmed, { referenceDate: '2026-01-15' }).contingency.ruleNeedsReview, false);
  const fresh = StorageManager.migrateAndValidateSchema(JSON.parse(JSON.stringify(createDefaultProject())));
  assert.equal(fresh.assumptions.contingencyRule, 'target');
});

test('migrar e reimportar não altera o diagnóstico da regra anterior', () => {
  const migrated = StorageManager.migrateAndValidateSchema(mainProjectWithoutRuleMarker());
  const again = StorageManager.migrateAndValidateSchema(JSON.parse(JSON.stringify(migrated)));
  const first = FinancialEngine.calculate(migrated, { referenceDate: '2026-01-15' });
  const second = FinancialEngine.calculate(again, { referenceDate: '2026-01-15' });
  assert.equal(second.contingency.rule, 'month_zero');
  assert.equal(second.firstDeficitMonth, first.firstDeficitMonth);
  assert.equal(second.finalFreeBalanceCents, first.finalFreeBalanceCents);
});

function unconfirmedBoughtProject() {
  const project = projectWithBaseDate();
  setSimpleBudget(project, 1_000_000, 0);
  project.items = [boughtItem({
    id: 'sofa', name: 'Sofá', status: STATUS_OPTIONS.BOUGHT,
    basePriceCents: 100_000, shippingCents: 10_000, payments: []
  })];
  return project;
}

test('quitação não confirmada torna a análise preliminar e explica o que confirmar', () => {
  const project = unconfirmedBoughtProject();
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  const viability = ScenarioEngine.evaluateViability(result, project);
  assert.equal(viability.status, 'insufficient_data');
  assert.ok(result.missingFields.includes('settlement:sofa'));
  assert.ok(viability.missingFieldLabels.some(label => /Confirmar se a compra de Sofá/.test(label)));
});

test('recusar a confirmação não confirma a quitação; confirmar registra data desconhecida', () => {
  const project = unconfirmedBoughtProject();
  const existing = project.items[0];
  const updates = formUpdates({
    id: 'sofa', basePriceCents: 100_000, shippingCents: 10_000, deliveryMonthIndex: 5,
    status: STATUS_OPTIONS.BOUGHT
  });
  const refused = mergeItemEdit(existing, updates, {}, { confirmSettlement: false });
  assert.equal(settlementState(refused), 'unconfirmed');
  assert.equal(refused.payments.length, 0);
  const accepted = mergeItemEdit(existing, updates, {}, { confirmSettlement: true });
  assert.equal(settlementState(accepted), 'confirmed_unknown_date');
  const paid = accepted.payments.filter(p => p.isPaid);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].origin, 'declared_by_user');
  assert.equal(paid[0].paidDate, null);
});

test('quitação importada persistida como não confirmada não conta como paga até ser confirmada', () => {
  const existing = boughtItem({
    status: STATUS_OPTIONS.BOUGHT, basePriceCents: 100_000, shippingCents: 0,
    payments: [{ amountCents: 100_000, monthIndex: 0, isPaid: true, dateUnknown: true, paidDate: null, origin: 'imported_unconfirmed' }]
  });
  assert.equal(settlementState(existing), 'unconfirmed');
  const updates = formUpdates({ id: existing.id, basePriceCents: 100_000, shippingCents: 0, deliveryMonthIndex: 5, status: STATUS_OPTIONS.BOUGHT });
  const confirmed = mergeItemEdit(existing, updates, {}, { confirmSettlement: true });
  assert.equal(confirmed.payments.length, 1);
  assert.equal(confirmed.payments[0].origin, 'declared_by_user');
});

test('quitação histórica confirmada não é descontada de novo do saldo inicial', () => {
  const project = unconfirmedBoughtProject();
  project.items[0] = mergeItemEdit(project.items[0], formUpdates({
    id: 'sofa', basePriceCents: 100_000, shippingCents: 10_000, deliveryMonthIndex: 5,
    status: STATUS_OPTIONS.BOUGHT
  }), {}, { confirmSettlement: true });
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  assert.equal(result.monthlyLedger[0].endBalanceCents, 1_000_000);
  assert.equal(result.monthlyLedger[0].paymentsThisMonthCents, 0);
  assert.equal(result.monthlyLedger[5].paymentsThisMonthCents, 10_000);
  assert.equal(result.settlementReview.length, 0);
});

function reserveShortfallProject() {
  const project = contingencyProject(100_000, 0, [scheduledItem('sinal', 100_000, 3)]);
  project.items.push(boughtItem({
    id: 'extra', name: 'Sofá <b>', status: STATUS_OPTIONS.QUOTED, basePriceCents: 0, shippingCents: 0, payments: []
  }));
  return project;
}

test('resumo de exportação usa o resultado calculado: regra, reserva, data-alvo, caixa e contingência', () => {
  const project = reserveShortfallProject();
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  result.viability = ScenarioEngine.evaluateViability(result, project);
  const summary = buildAnalysisSummary(project, result);
  const byLabel = Object.fromEntries(summary.rows.map(row => [row.label, row]));
  assert.match(byLabel['Regra de contingência'].text, /data-alvo/);
  assert.equal(byLabel['Percentual da reserva'].text, '10%');
  assert.equal(byLabel['Valor da reserva protegida'].cents, result.contingency.protectedCents);
  assert.match(byLabel['Data-alvo da contingência'].text, /2028-01-15/);
  assert.equal(byLabel['Reserva faltante na data-alvo'].cents, result.contingency.shortfallAtTargetCents);
  assert.match(byLabel['Diagnóstico de caixa'].text, /Sem déficit/);
  assert.match(byLabel['Diagnóstico de contingência'].text, /não se mantém/);
  assert.equal(byLabel['Conclusão'].text, result.viability.label);

  const legacy = JSON.parse(JSON.stringify(project));
  legacy.assumptions.contingencyRule = 'month_zero';
  legacy.assumptions.contingencyRuleConfirmed = false;
  const legacyResult = FinancialEngine.calculate(legacy, { referenceDate: '2026-01-15' });
  legacyResult.viability = ScenarioEngine.evaluateViability(legacyResult, legacy);
  const legacySummary = buildAnalysisSummary(legacy, legacyResult);
  assert.ok(legacySummary.rows[0].text.includes('mês 0'));
  assert.ok(legacySummary.pending.includes('Confirmar a regra de contingência do projeto'));
});

test('XLSX e PDF incluem as mesmas informações de contingência da tela e identificam as limitações', () => {
  const project = reserveShortfallProject();
  const result = FinancialEngine.calculate(project, { referenceDate: '2026-01-15' });
  result.viability = ScenarioEngine.evaluateViability(result, project);

  const sheets = {};
  const previousXlsx = globalThis.XLSX;
  globalThis.XLSX = {
    utils: {
      book_new: () => ({}),
      aoa_to_sheet: rows => rows,
      book_append_sheet: (_wb, sheet, name) => { sheets[name] = sheet; }
    },
    writeFile: () => {}
  };
  try {
    ExcelExporter.exportToExcel(project, result);
  } finally {
    globalThis.XLSX = previousXlsx;
  }
  const flat = sheets.Resumo.map(row => row.join('|'));
  assert.ok(flat.some(line => line.startsWith('Valor da reserva protegida:|') &&
    line.endsWith(String(result.contingency.protectedCents / 100))));
  assert.ok(flat.some(line => line.startsWith('Data-alvo da contingência:|2028-01-15')));
  assert.ok(flat.some(line => line.startsWith('Diagnóstico de contingência:')));
  assert.ok(flat.some(line => line.startsWith('Pendências que limitam a conclusão:')));
  assert.ok(flat.some(line => line.includes(XLSX_LIMITATION)));
  assert.ok(sheets.Premissas.some(row => row[0] === 'Regra de contingência:'));
  assert.ok(sheets.Itens[0].includes('Quitação'));

  let html = '';
  const fakeOpen = () => ({ document: { write: value => { html = value; }, close: () => {} } });
  const hadWindow = typeof globalThis.window !== 'undefined';
  const previousOpen = hadWindow ? globalThis.window.open : undefined;
  if (hadWindow) globalThis.window.open = fakeOpen; else globalThis.window = { open: fakeOpen };
  try {
    PdfExporter.exportToPdf(project, result, false);
  } finally {
    if (hadWindow) globalThis.window.open = previousOpen; else delete globalThis.window;
  }
  assert.ok(html.includes('Contingência, Diagnóstico e Pendências'));
  assert.ok(html.includes('Reserva faltante na data-alvo'));
  assert.ok(html.includes(PDF_LIMITATION));
  assert.ok(!html.includes('Sofá <b>'));
});

test('necessidades residenciais seguem prioridades e criam envelopes dimensionais', () => {
  const project = createDefaultProject();
  project.apartment.approxAreaM2 = 39;
  project.apartment.residentsCount = 2;
  project.livingProfile.goals.homeOffice = 'high';
  project.livingProfile.goals.guestRoom = 'low';
  project.apartment.rooms.find(room => room.id === 'room_quarto_2').geometry = {
    widthCm: 240,
    lengthCm: 300,
    door: { wall: 'south', offsetCm: 0, widthCm: 80, swing: 'inward' },
    windows: [],
    obstacles: [{ label: 'Pilar', xCm: 180, yCm: 100, widthCm: 40, lengthCm: 40 }]
  };

  const needs = NeedsEngine.generateNeeds(project);
  const needIds = needs.map(need => need.id);
  assert.ok(needIds.includes('office-desk'));
  assert.ok(needIds.includes('office-chair'));
  assert.ok(needIds.includes('living-television'));
  assert.ok(!needIds.includes('guest-bed'));
  assert.equal(needs.find(need => need.id === 'living-dining-seats').quantity, 2);

  const slots = LayoutEngine.buildFurnitureSlots(needs);
  const desk = slots.find(slot => slot.needId === 'office-desk');
  assert.equal(slots.filter(slot => slot.needId === 'living-dining-seats').length, 2);
  assert.equal(desk.roomId, 'room_quarto_2');
  assert.ok(desk.minWidthCm <= desk.idealWidthCm);
  assert.ok(desk.idealWidthCm <= desk.maxWidthCm);
  assert.equal(desk.confidence, 'low');
});

test('layout preliminar respeita porta e obstáculos e sinaliza envelopes sem encaixe', () => {
  const room = {
    id: 'room_test',
    geometry: {
      widthCm: 240,
      lengthCm: 300,
      door: { wall: 'south', offsetCm: 0, widthCm: 80, swing: 'inward' },
      windows: [],
      obstacles: [{ label: 'Pilar', xCm: 180, yCm: 100, widthCm: 40, lengthCm: 40 }]
    }
  };
  const slot = {
    id: 'slot-desk',
    needId: 'desk',
    roomId: room.id,
    name: 'Mesa de trabalho',
    category: 'desk',
    minWidthCm: 80,
    idealWidthCm: 120,
    maxWidthCm: 160,
    minDepthCm: 45,
    idealDepthCm: 60,
    maxDepthCm: 75,
    priority: 'important'
  };
  const layout = LayoutEngine.generateLayout([room], [slot])[0];
  assert.equal(layout.placements.length, 1);
  const placement = layout.placements[0];
  assert.ok(placement.x + placement.width <= 240);
  assert.ok(placement.y + placement.length <= 300);
  assert.ok(!(placement.x < 220 && placement.x + placement.width > 180 &&
    placement.y < 140 && placement.y + placement.length > 100));
  assert.ok(!(placement.x < 80 && placement.x + placement.width > 0 &&
    placement.y + placement.length > 220));
  assert.match(layout.limitations.join(' '), /circula/);

  const impossible = {
    ...slot,
    id: 'slot-too-large',
    minWidthCm: 250,
    idealWidthCm: 260,
    maxWidthCm: 280,
    minDepthCm: 310,
    idealDepthCm: 320,
    maxDepthCm: 340
  };
  const blocked = LayoutEngine.generateLayout([room], [impossible])[0];
  assert.equal(blocked.placements.length, 0);
  assert.equal(blocked.unplaced.length, 1);
});

test('projetos antigos recebem perfil residencial e geometria padrão sem perder seus dados', () => {
  const legacy = createDefaultProject();
  legacy.apartment.rooms = [
    { id: 'room_antigo', name: 'Quarto', type: 'bedroom' }
  ];
  legacy.apartment.existingFurniture = undefined;
  delete legacy.livingProfile;
  const migrated = StorageManager.migrateAndValidateSchema(legacy);

  assert.equal(migrated.apartment.rooms[0].geometry.widthCm, null);
  assert.equal(migrated.livingProfile.goals.storage, 'medium');
  assert.deepEqual(migrated.items, []);
});
