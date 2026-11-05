/**
 * Tipos de Dados e Modelos para a Aplicação "Meu Apê Planejado"
 * Todos os valores monetários são armazenados estritamente em CENTAVOS (inteiros)
 * para evitar problemas de ponto flutuante.
 */

export const SCOPE_OPTIONS = {
  INCLUDE: 'include',          // Incluir agora no plano
  POSTPONE: 'postpone',        // Adiar para após a mudança
  EXCLUDE: 'exclude',          // Excluir totalmente do escopo
  NOT_APPLICABLE: 'not_applicable', // Não se aplica ao imóvel
  ALREADY_OWNED: 'already_owned'   // Já possuo / Reaproveitado
};

export const PRIORITY_OPTIONS = {
  ESSENTIAL: 'essential', // Essencial para mudar (mínimo habitável)
  IMPORTANT: 'important', // Importante para o dia a dia
  OPTIONAL: 'optional'    // Opcional / Desejável no futuro
};

export const STATUS_OPTIONS = {
  SEARCH: 'search',              // Em pesquisa
  QUOTED: 'quoted',              // Orçamento recebido
  CONTRACTED: 'contracted',      // Contratado (com compromisso financeiro)
  PAID_PARTIAL: 'paid_partial',  // Pago parcialmente
  BOUGHT: 'bought',              // Totalmente pago
  DELIVERED: 'delivered',        // Entregue no apê
  INSTALLED: 'installed'         // Instalado e pronto para uso
};

// Itens com preço fechado: não sofrem reajuste e suas parcelas pendentes são compromissos.
export const FIRM_STATUSES = ['contracted', 'paid_partial', 'bought', 'delivered', 'installed'];
// Itens cuja compra principal já foi quitada.
export const SETTLED_STATUSES = ['bought', 'delivered', 'installed'];

export const STRATEGY_OPTIONS = {
  AUTO: 'auto',
  FACTORY_PLANNED: 'factory_planned', // Planejados de fábrica / loja
  CUSTOM_WOODWORK: 'custom_woodwork', // Marcenaria sob medida
  MODULAR: 'modular',                 // Móveis modulados
  READY_MADE: 'ready_made',           // Móveis prontos (loja)
  HYBRID: 'hybrid',                   // Solução híbrida
  REUSED: 'reused'                    // Reaproveitamento / Usados
};

export const STRATEGY_LABELS = {
  auto: 'A definir após comparar alternativas',
  factory_planned: 'Planejados de fábrica',
  custom_woodwork: 'Marcenaria sob medida',
  modular: 'Móveis modulados',
  ready_made: 'Móveis prontos',
  hybrid: 'Solução híbrida',
  reused: 'Reaproveitamento / Usados'
};

export const PRIORITY_LABELS = {
  essential: 'Essencial para mudar',
  important: 'Importante',
  optional: 'Opcional'
};

export const SCOPE_LABELS = {
  include: 'Incluir no plano',
  postpone: 'Adiar pós-mudança',
  exclude: 'Excluir do escopo',
  not_applicable: 'Não se aplica',
  already_owned: 'Já possuo'
};

export const STATUS_LABELS = {
  search: 'Pesquisando',
  quoted: 'Orçado',
  contracted: 'Contratado',
  paid_partial: 'Pago parcialmente',
  bought: 'Comprado',
  delivered: 'Entregue',
  installed: 'Instalado'
};

/**
 * Cria um objeto de Projeto padrão
 */
export function createDefaultProject() {
  const baseDate = new Date().toISOString().slice(0, 10);
  return {
    id: 'proj_' + Date.now(),
    name: 'Meu Apê Planejado',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: '1.0',
    baseDate,

    // Configurações do Apartamento e Prazos
    apartment: {
      cityState: '',
      zipCode: '',
      approxAreaM2: null,
      canStoreEarlyPurchases: 'unknown',
      memorialNotes: '',
      rooms: [
        { id: 'room_cozinha', name: 'Cozinha & Área de Serviço', type: 'kitchen', geometry: createEmptyRoomGeometry() },
        { id: 'room_sala', name: 'Sala de Estar / Jantar', type: 'living', geometry: createEmptyRoomGeometry() },
        { id: 'room_quarto_principal', name: 'Quarto Casal / Principal', type: 'bedroom', geometry: createEmptyRoomGeometry() },
        { id: 'room_quarto_2', name: 'Quarto 2 / Home Office', type: 'bedroom', geometry: createEmptyRoomGeometry() },
        { id: 'room_banheiro', name: 'Banheiro Social', type: 'bathroom', geometry: createEmptyRoomGeometry() },
        { id: 'room_varanda', name: 'Varanda / Sacada', type: 'balcony', geometry: createEmptyRoomGeometry() }
      ],
      existingFurniture: '',
      existingAssets: [],
      residentsCount: null,
      isHomeOffice: false,
      hasChildren: false,
      hasPets: false,
      accessibilityNeeds: false,
      keysDate: '',
      moveDate: '',
      deliveredItems: {
        flooring: false,
        wallTiles: false,
        countertops: false,
        lighting: false,
        sanitary: false
      },
      restrictions: '',
      notes: ''
    },

    livingProfile: {
      goals: {
        storage: 'medium',
        tvComfort: 'medium',
        dining: 'medium',
        hosting: 'medium',
        homeOffice: 'not_needed',
        guestRoom: 'low',
        cooking: 'medium',
        laundry: 'medium',
        openCirculation: 'high',
        decoration: 'low',
        easyCleaning: 'medium',
        durability: 'medium',
        flexibility: 'medium'
      },
      style: {
        liked: [],
        disliked: [],
        colors: '',
        avoidColors: '',
        woodTone: 'no_preference',
        density: 'balanced',
        furniturePresence: 'no_preference',
        lines: 'no_preference',
        uniformity: 'medium',
        references: '',
        referenceImages: []
      },
      purchasing: {
        used: 'no_preference',
        readyMade: 'no_preference',
        modular: 'no_preference',
        planned: 'no_preference',
        durabilityOverPrice: 'no_preference',
        objective: 'value',
        preferredBrands: '',
        rejectedBrands: ''
      },
      needOverrides: {},
      needCriticalityOverrides: {}
    },

    // Orçamento Financeiro
    budgetProfile: {
      mode: 'simplified', // 'simplified' | 'detailed'

      // Modo Simplificado
      simplified: {
        initialBalanceCents: null,
        monthlyCapCents: null,
        extraIncomes: [],             // [{ id, name, amountCents, monthIndex }]
        atypicalMonths: {}           // { [monthIndex]: amountCents }
      },

      // Modo Detalhado
      detailed: {
        initialBalanceCents: null,
        netMonthlyIncomeCents: null,
        fixedLivingExpensesCents: null,
        variableLivingExpensesCents: null,
        propertyInstallmentCents: null,
        otherDebtsCents: null,
        emergencyReserveCents: null,
        safetyMarginCents: null,
        monthlyCapCents: null,
        extraIncomes: [],
        atypicalMonths: {},
        postMoveExpensesCents: null
      }
    },

    // Premissas e Hipóteses
    assumptions: {
      annualInflationRate: 0.0,       // 0% por padrão, configurável (ex: 0.06 = 6% a.a.)
      applyInflationToUncontracted: true,
      yieldRateAnnual: 0.0,           // Rendimentos do fundo (padrão 0%)
      contingencyPercent: 0,
      ruleSchemaVersion: 2,
      contingencyRule: 'target',      // month_zero | first_disbursement | target (ver contingencyRules.js)
      contingencyRuleConfirmed: true,
      contingencyTargetDate: ''
    },

    // Lista de Itens por Ambiente
    items: [],

    // Histórico de Compras/Pagamentos Efetivados
    paidHistory: []
  };
}

function createEmptyRoomGeometry() {
  return {
    widthCm: null,
    lengthCm: null,
    door: null,
    doors: [],
    windows: [],
    obstacles: [],
    fixedElements: [],
    utilityPoints: []
  };
}
