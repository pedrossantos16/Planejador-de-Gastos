import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultProject, SCOPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../models/types.js';
import { parseMoneyToCents } from '../models/money.js';
import { FinancialEngine } from '../engine/FinancialEngine.js';
import { Recommender } from '../engine/Recommender.js';
import { ScenarioEngine } from '../engine/ScenarioEngine.js';
import { StorageManager } from '../storage/StorageManager.js';
import { mergeItemEdit } from '../ui/ItemsUI.js';

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
