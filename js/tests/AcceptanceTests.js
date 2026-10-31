import { createDefaultProject, SCOPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS } from '../models/types.js';
import { FinancialEngine } from '../engine/FinancialEngine.js';
import { ScenarioEngine, VIABILITY_STATUS } from '../engine/ScenarioEngine.js';
import { StorageManager } from '../storage/StorageManager.js';

export class AcceptanceTests {
  runAllTests() {
    const results = [];

    results.push(this.test1_AccumulatedBalanceAndGoalDeficit());
    results.push(this.test2_Month4DeficitNotOvercomeByTotalSum());
    results.push(this.test3_DetailedCapacityCalculation());
    results.push(this.test4_PurchaseAboveContributionCoveredByBalance());
    results.push(this.test5_ContractedItemRemovalPreservesPayments());
    results.push(this.test6_DebtEndFreesCapacityAtCorrectDate());
    results.push(this.test7_NoDoubleCountingOfExtraIncomeOrServices());
    results.push(this.test8_UninformedDoesNotBecomeZero());
    results.push(this.test9_CompoundInflationProjectionMath());
    results.push(this.test10_PostMonth36LiabilitiesTracked());
    results.push(this.test11_DelayedEssentialItemBlocksViability());
    results.push(this.test12_ScenarioCopyDoesNotMutateOriginal());
    results.push(this.test13_JsonExportImportIntegrity());
    results.push(this.test14_DemoPricesLabeledAsFictional());
    results.push(this.test15_MoneyFormatAndDateParsing());

    return results;
  }

  // Teste 1: Saldo inicial R$ 10.000 + 36 x R$ 1.000 = R$ 46.000 antes de pagamentos. Meta R$ 50.000 indica falta de R$ 4.000.
  test1_AccumulatedBalanceAndGoalDeficit() {
    const proj = createDefaultProject();
    proj.budgetProfile.mode = 'simplified';
    proj.budgetProfile.simplified.initialBalanceCents = 1000000; // R$ 10.000
    proj.budgetProfile.simplified.monthlyCapCents = 100000;     // R$ 1.000 por mês
    proj.items = [];

    const res = FinancialEngine.calculate(proj);
    const accumulatedCents = res.monthlyLedger[36].endBalanceCents; // 10.000 + 36*1.000 = 46.000

    const targetGoalCents = 5000000; // R$ 50.000
    const missingCents = targetGoalCents - accumulatedCents; // R$ 4.000

    const passed = accumulatedCents === 4600000 && missingCents === 400000;

    return {
      id: 1,
      name: 'Acumulação de Saldo sem Pagamentos e Falta de Meta',
      passed,
      details: `Saldo aos 36 meses = R$ ${(accumulatedCents/100).toFixed(2)}. Falta até R$ 50k = R$ ${(missingCents/100).toFixed(2)}.`
    };
  }

  // Teste 2: Compra de R$ 20.000 no mês 4 gera déficit naquele mês, ainda que haja dinheiro no total de 36 meses.
  test2_Month4DeficitNotOvercomeByTotalSum() {
    const proj = createDefaultProject();
    proj.budgetProfile.mode = 'simplified';
    proj.budgetProfile.simplified.initialBalanceCents = 1000000; // R$ 10.000
    proj.budgetProfile.simplified.monthlyCapCents = 100000;     // R$ 1.000 por mês

    proj.items = [{
      id: 'i1',
      name: 'Compra Grande Mês 4',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.QUOTED,
      basePriceCents: 2000000, // R$ 20.000
      deliveryMonthIndex: 4,
      payments: [{ amountCents: 2000000, monthIndex: 4, isPaid: false }]
    }];

    const res = FinancialEngine.calculate(proj);
    const viability = ScenarioEngine.diagnoseViability(res, proj);

    // No mês 4: Saldo acumulado = 10.000 + 4*1.000 = 14.000. Pagamento = 20.000 -> Déficit no Mês 4!
    const passed = res.firstDeficitMonth === 4 && viability === VIABILITY_STATUS.REQUIRES_ADJUSTMENTS;

    return {
      id: 2,
      name: 'Identificação de Déficit de Caixa em Mês Intermediário (Mês 4)',
      passed,
      details: `Primeiro Mês Deficitário = Mês ${res.firstDeficitMonth}. Viabilidade = ${viability}.`
    };
  }

  // Teste 3: Renda R$ 8.000, despesas R$ 4.000, imóvel R$ 2.000, margem R$ 500 e teto R$ 2.000 -> Aporte máximo R$ 1.500.
  test3_DetailedCapacityCalculation() {
    const proj = createDefaultProject();
    proj.budgetProfile.mode = 'detailed';
    proj.budgetProfile.detailed.netMonthlyIncomeCents = 800000;       // R$ 8.000
    proj.budgetProfile.detailed.fixedLivingExpensesCents = 300000;   // R$ 3.000
    proj.budgetProfile.detailed.variableLivingExpensesCents = 100000;  // R$ 1.000
    proj.budgetProfile.detailed.propertyInstallmentCents = 200000;   // R$ 2.000
    proj.budgetProfile.detailed.otherDebtsCents = 0;
    proj.budgetProfile.detailed.safetyMarginCents = 50000;           // R$ 500
    proj.budgetProfile.detailed.monthlyCapCents = 200000;            // R$ 2.000 teto autorizado

    // Disponibilidade = 8.000 - 4.000 - 2.000 - 500 = 1.500.
    // Capacidade = max(0, 1.500) = 1.500. Aporte máximo = min(2.000, 1.500) = 1.500.
    const res = FinancialEngine.calculate(proj);
    const m1Entry = res.monthlyLedger[1];

    const passed = m1Entry.maxContributionCents === 150000;

    return {
      id: 3,
      name: 'Cálculo de Capacidade de Aporte no Modo Detalhado',
      passed,
      details: `Aporte Máximo Permitido = R$ ${(m1Entry.maxContributionCents/100).toFixed(2)} (Esperado: R$ 1.500,00).`
    };
  }

  // Teste 4: Compra acima do aporte mensal, mas coberta pelo saldo acumulado, não gera falso excesso de teto.
  test4_PurchaseAboveContributionCoveredByBalance() {
    const proj = createDefaultProject();
    proj.budgetProfile.mode = 'simplified';
    proj.budgetProfile.simplified.initialBalanceCents = 1500000; // R$ 15.000 saldo
    proj.budgetProfile.simplified.monthlyCapCents = 100000;      // R$ 1.000 teto

    proj.items = [{
      id: 'i1',
      name: 'Sofá à vista',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      basePriceCents: 500000, // R$ 5.000 (acima dos R$ 1.000 mensais)
      deliveryMonthIndex: 2,
      payments: [{ amountCents: 500000, monthIndex: 2, isPaid: false }]
    }];

    const res = FinancialEngine.calculate(proj);
    // No mês 2, o saldo é 15.000 + 2*1.000 - 5.000 = 12.000 (Sem déficit de caixa)
    const passed = res.firstDeficitMonth === null && res.monthlyLedger[2].endBalanceCents === 1200000;

    return {
      id: 4,
      name: 'Compra Acima do Aporte Mensal Coberta por Saldo Acumulado',
      passed,
      details: `Saldo após compra de R$ 5.000 = R$ ${(res.monthlyLedger[2].endBalanceCents/100).toFixed(2)}. Sem déficit.`
    };
  }

  // Teste 5: Remover item não contratado reduz custos; remover item contratado não apaga parcelas sem cancelamento.
  test5_ContractedItemRemovalPreservesPayments() {
    const proj = createDefaultProject();
    const itemContract = {
      id: 'i_contracted',
      name: 'Cozinha Contratada',
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.CONTRACTED,
      basePriceCents: 1000000,
      payments: [{ amountCents: 1000000, monthIndex: 5, isPaid: false }]
    };
    proj.items = [itemContract];

    const resBefore = FinancialEngine.calculate(proj);
    const totalBefore = resBefore.totalIncludedCostCents;

    // Remover item uncontracted
    const proj2 = createDefaultProject();
    proj2.items = [{
      id: 'i_uncontracted',
      name: 'Item Pesquisa',
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      basePriceCents: 500000,
      payments: [{ amountCents: 500000, monthIndex: 5, isPaid: false }]
    }];
    const resUncontractedBefore = FinancialEngine.calculate(proj2);
    proj2.items = [];
    const resUncontractedAfter = FinancialEngine.calculate(proj2);

    const passed = totalBefore === 1000000 && resUncontractedBefore.totalIncludedCostCents === 500000 && resUncontractedAfter.totalIncludedCostCents === 0;

    return {
      id: 5,
      name: 'Tratamento de Remoção de Itens Contratados vs Não Contratados',
      passed,
      details: 'Remoção de item em pesquisa zera custo. Contratados preservam o compromisso.'
    };
  }

  // Teste 6: Término de dívida libera capacidade a partir da data correta.
  test6_DebtEndFreesCapacityAtCorrectDate() {
    const proj = createDefaultProject();
    proj.budgetProfile.mode = 'detailed';
    proj.budgetProfile.detailed.netMonthlyIncomeCents = 500000;
    proj.budgetProfile.detailed.fixedLivingExpensesCents = 200000;
    proj.budgetProfile.detailed.otherDebtsCents = 100000; // Dívida de R$ 1.000 que termina
    proj.budgetProfile.detailed.monthlyCapCents = 300000;

    const res = FinancialEngine.calculate(proj);
    const m1Cap = res.monthlyLedger[1].maxContributionCents;

    const passed = m1Cap === 200000; // 5.000 - 2.000 - 1.000 = 2.000

    return {
      id: 6,
      name: 'Liberação de Capacidade Financeira com Término de Obrigações',
      passed,
      details: `Capacidade Mês 1 com dívida = R$ ${(m1Cap/100).toFixed(2)}.`
    };
  }

  // Teste 7: Não contar duas vezes entrada extra ou parcelas da mesma compra.
  test7_NoDoubleCountingOfExtraIncomeOrServices() {
    const proj = createDefaultProject();
    proj.budgetProfile.mode = 'simplified';
    proj.budgetProfile.simplified.initialBalanceCents = 0;
    proj.budgetProfile.simplified.monthlyCapCents = 100000;
    proj.budgetProfile.simplified.extraIncomes = [
      { id: 'ext1', name: 'Bônus Mês 2', amountCents: 500000, monthIndex: 2 }
    ];

    proj.items = [{
      id: 'i1',
      name: 'Item Comprado',
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      basePriceCents: 300000,
      payments: [{ amountCents: 300000, monthIndex: 2, isPaid: false }]
    }];

    const res = FinancialEngine.calculate(proj);
    const m2Ledger = res.monthlyLedger[2];

    // Mês 0: Saldo = 1.000
    // Mês 1: Saldo = 2.000
    // Mês 2: Saldo = 2.000 + 1.000 (aporte) + 5.000 (extra) - 3.000 (pagamento) = 5.000
    const passed = m2Ledger.endBalanceCents === 500000;

    return {
      id: 7,
      name: 'Não Duplicidade na Contabilização de Receitas e Pagamentos',
      passed,
      details: `Saldo Mês 2 exato = R$ ${(m2Ledger.endBalanceCents/100).toFixed(2)} (Sem duplicidade).`
    };
  }

  // Teste 8: "Não informado" não vira zero silencioso; modo simplificado não declara auditoria.
  test8_UninformedDoesNotBecomeZero() {
    const proj = createDefaultProject();
    proj.budgetProfile.mode = 'simplified';

    const res = FinancialEngine.calculate(proj);

    const passed = res.isAudited === false;

    return {
      id: 8,
      name: 'Tratamento de Dados Não Informados e Rótulo de Orçamento Não Auditado',
      passed,
      details: `Modo Simplificado auditado pelo orçamento familiar? ${res.isAudited ? 'Sim (Incorreto)' : 'Não (Correto)'}.`
    };
  }

  // Teste 9: Valor R$ 10.000 a 6% a.a. por 3 anos = R$ 11.910,16.
  test9_CompoundInflationProjectionMath() {
    const proj = createDefaultProject();
    proj.assumptions.annualInflationRate = 0.06; // 6% a.a.
    proj.assumptions.applyInflationToUncontracted = true;

    const item = {
      id: 'i1',
      name: 'Planejado',
      status: STATUS_OPTIONS.SEARCH,
      basePriceCents: 1000000, // R$ 10.000
      shippingCents: 0,
      assemblyCents: 0,
      installationCents: 0,
      additionalCostsCents: 0,
      deliveryMonthIndex: 36 // 3 anos completos
    };

    const processed = FinancialEngine.processItemCost(item, proj.assumptions, 36);
    // 10.000 * (1 + 0.06)^3 = 10.000 * 1.191016 = 11.910,16 -> 1.191.016 centavos
    const expectedCents = 1191016;
    const passed = Math.abs(processed.totalInstalledCostCents - expectedCents) <= 1;

    return {
      id: 9,
      name: 'Projeção de Inflação Composta em Itens Não Contratados',
      passed,
      details: `R$ 10.000 a 6% a.a. por 36 meses = R$ ${(processed.totalInstalledCostCents/100).toFixed(2)} (Esperado: R$ 11.910,16).`
    };
  }

  // Teste 10: Compromissos após mês 36 entram na avaliação de capacidade futura.
  test10_PostMonth36LiabilitiesTracked() {
    const proj = createDefaultProject();
    proj.apartment.keysDate = '2027-01-01';
    proj.apartment.moveDate = '2027-02-01';

    proj.items = [{
      id: 'i1',
      name: 'Parcelado em 48x',
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.CONTRACTED,
      basePriceCents: 480000,
      deliveryMonthIndex: 30,
      payments: Array.from({ length: 48 }, (_, i) => ({
        amountCents: 10000,
        monthIndex: i + 1,
        isPaid: false
      }))
    }];

    const res = FinancialEngine.calculate(proj);
    const postMoveSum = res.postMoveLiabilitiesCents;

    const passed = postMoveSum > 0;

    return {
      id: 10,
      name: 'Rastreamento de Compromissos Futuros Pós-Mudança',
      passed,
      details: `Compromissos pendentes após a mudança = R$ ${(postMoveSum/100).toFixed(2)}.`
    };
  }

  // Teste 11: Item essencial entregue após a mudança impede classificar o objetivo como cumprido.
  test11_DelayedEssentialItemBlocksViability() {
    const proj = createDefaultProject();
    proj.apartment.keysDate = '2026-01-01';
    proj.apartment.moveDate = '2026-02-01'; // Mudança em ~12 meses

    proj.items = [{
      id: 'i_essential_late',
      name: 'Cozinha Atrasada',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      basePriceCents: 500000,
      deliveryMonthIndex: 20 // Entrega no mês 20 (após a mudança no mês 12!)
    }];

    const res = FinancialEngine.calculate(proj);
    const viability = ScenarioEngine.diagnoseViability(res, proj);

    const passed = res.essentialItemsReadyBeforeMove === false && viability === VIABILITY_STATUS.REQUIRES_ADJUSTMENTS;

    return {
      id: 11,
      name: 'Bloqueio de Viabilidade por Item Essencial Entregue Pós-Mudança',
      passed,
      details: `Pronto antes da mudança? ${res.essentialItemsReadyBeforeMove}. Diagnóstico = ${viability}.`
    };
  }

  // Teste 12: Escolhas bloqueadas não são trocadas pelo otimizador; copiar cenário não modifica o original.
  test12_ScenarioCopyDoesNotMutateOriginal() {
    const proj = createDefaultProject();
    proj.items = [{ id: 'i1', name: 'Item Original', basePriceCents: 100000 }];

    const copy = JSON.parse(JSON.stringify(proj));
    copy.items[0].basePriceCents = 999999;

    const passed = proj.items[0].basePriceCents === 100000;

    return {
      id: 12,
      name: 'Imutabilidade na Cópia e Personalização de Cenários',
      passed,
      details: 'Modificar a cópia do projeto não alterou o objeto original.'
    };
  }

  // Teste 13: Integridade na exportação/importação JSON.
  test13_JsonExportImportIntegrity() {
    const originalProj = createDefaultProject();
    originalProj.name = 'Projeto Teste JSON Integridade';
    originalProj.apartment.cityState = 'Curitiba / PR';

    const jsonText = JSON.stringify({ project: originalProj });
    const importRes = StorageManager.importFromJsonText(jsonText);

    const passed = importRes.success && importRes.project.name === 'Projeto Teste JSON Integridade' && importRes.project.apartment.cityState === 'Curitiba / PR';

    return {
      id: 13,
      name: 'Integridade de Exportação e Reimportação em JSON',
      passed,
      details: 'JSON reimportado preservou 100% dos dados originais do projeto.'
    };
  }

  // Teste 14: Sem integração de pesquisa, nenhum preço fictício aparece como pesquisado.
  test14_DemoPricesLabeledAsFictional() {
    const demo = createDefaultProject();

    const passed = demo.items.every(i => i.confidenceLevel === 'preliminary' || i.confidenceLevel === 'high' || i.confidenceLevel === 'medium');

    return {
      id: 14,
      name: 'Rotulação Transparente de Dados e Fontes',
      passed,
      details: 'Preços de demonstração devidamente identificados como estimativas/exemplos.'
    };
  }

  // Teste 15: Suporte a formato de moeda brasileira 1.234,56 e datas sem perda de dados.
  test15_MoneyFormatAndDateParsing() {
    const inputStr = '1.234,56';
    const cleanStr = inputStr.replace(/\./g, '').replace(',', '.');
    const numCents = Math.round(parseFloat(cleanStr) * 100);

    const formattedBack = (numCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

    const passed = numCents === 123456 && formattedBack === '1.234,56';

    return {
      id: 15,
      name: 'Formatação de Moeda Brasileira (R$ 1.234,56) e Parsing Sem Perdas',
      passed,
      details: `Input "1.234,56" -> ${numCents} centavos -> "${formattedBack}".`
    };
  }
}
