import { createDefaultProject, SCOPE_OPTIONS, PRIORITY_OPTIONS, STATUS_OPTIONS, STRATEGY_OPTIONS } from './types.js';

/**
 * Projetos Demonstrativos Pré-configurados (Explicitamente Rotulados como Fictícios)
 */

/**
 * 1. CENÁRIO VIÁVEL
 * Orçamento equilibrado, saldo acumulado cobre entradas e itens essenciais prontos na mudança.
 */
export function getDemoViableProject() {
  const proj = createDefaultProject();
  proj.name = 'Exemplo: Planejamento Viável (Demonstração)';

  proj.budgetProfile.mode = 'simplified';
  proj.budgetProfile.simplified.initialBalanceCents = 1200000; // R$ 12.000,00 saldo inicial
  proj.budgetProfile.simplified.monthlyCapCents = 150000;      // R$ 1.500,00 por mês
  proj.budgetProfile.simplified.extraIncomes = [
    { id: 'ext_1', name: 'Restituição IR Mês 12', amountCents: 300000, monthIndex: 12 },
    { id: 'ext_2', name: 'Décimo Terceiro Mês 24', amountCents: 400000, monthIndex: 24 }
  ];

  proj.items = [
    {
      id: 'item_cozinha_planejada',
      roomId: 'room_cozinha',
      name: 'Armários Planejados Cozinha',
      specification: 'MDF Naval 18mm, dobradiças com amortecedor, 4 gavetas',
      dimensions: '3.20m de bancada',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.QUOTED,
      strategy: STRATEGY_OPTIONS.CUSTOM_WOODWORK,
      basePriceCents: 1200000, // R$ 12.000,00
      shippingCents: 30000,    // R$ 300,00
      assemblyCents: 0,        // Incluso
      installationCents: 0,    // Incluso
      additionalCostsCents: 0,
      payments: [
        { amountCents: 369000, monthIndex: 10, isPaid: false, description: 'Sinal (30%)', isDeposit: true },
        { amountCents: 430500, monthIndex: 20, isPaid: false, description: 'Intermediária (35%)', isDeposit: false },
        { amountCents: 430500, monthIndex: 35, isPaid: false, description: 'Entrega/Instalação (35%)', isDeposit: false }
      ],
      supplier: 'Marcenaria Silva & Ramos',
      quoteDate: '2025-01-15',
      confidenceLevel: 'high',
      deliveryMonthIndex: 35
    },
    {
      id: 'item_geladeira',
      roomId: 'room_cozinha',
      name: 'Geladeira Inverter Frost Free 450L',
      specification: 'Inox, 110V, Eficiência A+++',
      dimensions: '70cm x 185cm',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      strategy: STRATEGY_OPTIONS.READY_MADE,
      basePriceCents: 420000, // R$ 4.200,00
      shippingCents: 15000,   // R$ 150,00
      assemblyCents: 0,
      installationCents: 0,
      additionalCostsCents: 0,
      payments: [
        { amountCents: 435000, monthIndex: 32, isPaid: false, description: 'Compra à vista', isDeposit: false }
      ],
      supplier: 'Pesquisa Mercado',
      quoteDate: '2025-02-01',
      confidenceLevel: 'medium',
      deliveryMonthIndex: 33
    },
    {
      id: 'item_fogao_cooktop',
      roomId: 'room_cozinha',
      name: 'Cooktop 5 Bocas Indução + Forno de Embutir',
      specification: 'Vidro temperado 220V',
      dimensions: '75cm x 52cm',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      strategy: STRATEGY_OPTIONS.READY_MADE,
      basePriceCents: 350000, // R$ 3.500,00
      shippingCents: 10000,
      assemblyCents: 0,
      installationCents: 20000, // R$ 200,00 ponto elétrico
      additionalCostsCents: 0,
      payments: [
        { amountCents: 380000, monthIndex: 30, isPaid: false, description: 'Pagamento total', isDeposit: false }
      ],
      supplier: 'Pesquisa Mercado',
      quoteDate: '2025-02-01',
      confidenceLevel: 'medium',
      deliveryMonthIndex: 32
    },
    {
      id: 'item_colchao_baú',
      roomId: 'room_quarto_principal',
      name: 'Cama Baú Queen + Colchão Molas Ensacadas',
      specification: 'Pillow Top, espuma D33',
      dimensions: '158cm x 198cm',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      strategy: STRATEGY_OPTIONS.READY_MADE,
      basePriceCents: 380000, // R$ 3.800,00
      shippingCents: 20000,
      assemblyCents: 0,
      installationCents: 0,
      additionalCostsCents: 0,
      payments: [
        { amountCents: 400000, monthIndex: 34, isPaid: false, description: 'Compra à vista', isDeposit: false }
      ],
      supplier: 'Loja de Colchões',
      quoteDate: '2025-01-20',
      confidenceLevel: 'medium',
      deliveryMonthIndex: 35
    },
    {
      id: 'item_guarda_roupa',
      roomId: 'room_quarto_principal',
      name: 'Guarda-Roupa Casal Modulado',
      specification: 'MDF 15mm, 3 portas de correr, espelho central',
      dimensions: '2.40m largura',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.QUOTED,
      strategy: STRATEGY_OPTIONS.MODULAR,
      basePriceCents: 450000, // R$ 4.500,00
      shippingCents: 15000,
      assemblyCents: 35000,  // R$ 350,00 montagem
      installationCents: 0,
      additionalCostsCents: 0,
      payments: [
        { amountCents: 250000, monthIndex: 15, isPaid: false, description: 'Entrada', isDeposit: true },
        { amountCents: 250000, monthIndex: 18, isPaid: false, description: 'Quitação na entrega', isDeposit: false }
      ],
      supplier: 'Lojas de Móveis',
      quoteDate: '2025-01-10',
      confidenceLevel: 'high',
      deliveryMonthIndex: 35
    },
    {
      id: 'item_sofa',
      roomId: 'room_sala',
      name: 'Sofá Retrátil e Reclinável 3 Lugares',
      specification: 'Tecido linho cinza, mola ensacada',
      dimensions: '2.30m largura',
      priority: PRIORITY_OPTIONS.IMPORTANT,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      strategy: STRATEGY_OPTIONS.READY_MADE,
      basePriceCents: 320000, // R$ 3.200,00
      shippingCents: 18000,
      assemblyCents: 0,
      installationCents: 0,
      additionalCostsCents: 0,
      payments: [
        { amountCents: 338000, monthIndex: 35, isPaid: false, description: 'Compra à vista', isDeposit: false }
      ],
      supplier: 'Pesquisa Web',
      quoteDate: '2025-02-05',
      confidenceLevel: 'medium',
      deliveryMonthIndex: 36
    },
    {
      id: 'item_painel_tv',
      roomId: 'room_sala',
      name: 'Painel para TV até 65 polegadas',
      specification: 'MDF com fita LED embutida',
      dimensions: '1.80m x 1.40m',
      priority: PRIORITY_OPTIONS.OPTIONAL,
      scope: SCOPE_OPTIONS.POSTPONE, // Adiado para pós-mudança
      status: STATUS_OPTIONS.SEARCH,
      strategy: STRATEGY_OPTIONS.MODULAR,
      basePriceCents: 150000, // R$ 1.500,00
      shippingCents: 10000,
      assemblyCents: 15000,
      installationCents: 0,
      additionalCostsCents: 0,
      payments: [
        { amountCents: 175000, monthIndex: 39, isPaid: false, description: 'Compra pós-mudança', isDeposit: false }
      ],
      supplier: 'Loja Online',
      quoteDate: '2025-01-20',
      confidenceLevel: 'low',
      deliveryMonthIndex: 39
    }
  ];

  return markAsDemonstration(proj);
}

/**
 * 2. CENÁRIO INVIÁVEL
 * Apresenta déficit no mês 4 devido a um pagamento de sinal elevado antes de acumular caixa.
 */
export function getDemoInviableProject() {
  const proj = createDefaultProject();
  proj.name = 'Exemplo: Plano Inviável (Déficit no Mês 4)';

  proj.budgetProfile.mode = 'simplified';
  proj.budgetProfile.simplified.initialBalanceCents = 200000; // Apenas R$ 2.000,00 saldo inicial
  proj.budgetProfile.simplified.monthlyCapCents = 100000;      // R$ 1.000,00 por mês

  proj.items = [
    {
      id: 'item_cozinha_cara',
      roomId: 'room_cozinha',
      name: 'Marcenaria Completa da Cozinha',
      specification: 'Laca com vidro canelado',
      dimensions: '4.00m',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.CONTRACTED,
      strategy: STRATEGY_OPTIONS.CUSTOM_WOODWORK,
      basePriceCents: 2000000, // R$ 20.000,00
      shippingCents: 0,
      assemblyCents: 0,
      installationCents: 0,
      additionalCostsCents: 0,
      payments: [
        // No mês 4: Saldo acumulado será R$ 2.000 + 4*R$ 1.000 = R$ 6.000. Mas o sinal é R$ 8.000 -> Déficit de R$ 2.000!
        { amountCents: 800000, monthIndex: 4, isPaid: false, description: 'Sinal de Marcenaria (40%)', isDeposit: true },
        { amountCents: 1200000, monthIndex: 24, isPaid: false, description: 'Quitação', isDeposit: false }
      ],
      supplier: 'Studio Marcenaria Luxo',
      quoteDate: '2025-02-01',
      confidenceLevel: 'high',
      deliveryMonthIndex: 25
    }
  ];

  return markAsDemonstration(proj);
}

/**
 * 3. CENÁRIO INCOMPLETO
 * Projeto preliminar com perguntas sem resposta e campos pendentes.
 */
export function getDemoIncompleteProject() {
  const proj = createDefaultProject();
  proj.name = 'Exemplo: Planejamento Preliminar (Dados Faltantes)';

  proj.budgetProfile.mode = 'detailed';
  proj.budgetProfile.detailed.netMonthlyIncomeCents = null;
  proj.budgetProfile.detailed.fixedLivingExpensesCents = null;

  proj.items = [
    {
      id: 'item_incompleto_1',
      roomId: 'room_cozinha',
      name: 'Armário de Cozinha (Indefinido)',
      specification: 'Não especificado',
      dimensions: 'Não medido',
      priority: PRIORITY_OPTIONS.ESSENTIAL,
      scope: SCOPE_OPTIONS.INCLUDE,
      status: STATUS_OPTIONS.SEARCH,
      strategy: STRATEGY_OPTIONS.FACTORY_PLANNED,
      basePriceCents: null,
      shippingCents: 0,
      assemblyCents: 0,
      installationCents: 0,
      additionalCostsCents: 0,
      payments: [],
      supplier: '',
      quoteDate: '',
      confidenceLevel: 'preliminary',
      deliveryMonthIndex: 36
    }
  ];

  return markAsDemonstration(proj);
}

function markAsDemonstration(project) {
  const today = new Date();
  const baseDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  const keysDate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 36, 1));
  const moveDate = new Date(Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 37, 1));
  project.baseDate = baseDate.toISOString().slice(0, 10);
  project.apartment.keysDate = keysDate.toISOString().slice(0, 10);
  project.apartment.moveDate = moveDate.toISOString().slice(0, 10);
  project.isDemonstration = true;
  return project;
}
