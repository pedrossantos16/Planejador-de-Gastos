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

export const STRATEGY_OPTIONS = {
  FACTORY_PLANNED: 'factory_planned', // Planejados de fábrica / loja
  CUSTOM_WOODWORK: 'custom_woodwork', // Marcenaria sob medida
  MODULAR: 'modular',                 // Móveis modulados
  READY_MADE: 'ready_made',           // Móveis prontos (loja)
  HYBRID: 'hybrid',                   // Solução híbrida
  REUSED: 'reused'                    // Reaproveitamento / Usados
};

export const STRATEGY_LABELS = {
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
  return {
    id: 'proj_' + Date.now(),
    name: 'Meu Apê Planejado',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    schemaVersion: '1.0',

    // Configurações do Apartamento e Prazos
    apartment: {
      cityState: '',
      zipCode: '',
      approxAreaM2: 55,
      rooms: [
        { id: 'room_cozinha', name: 'Cozinha & Área de Serviço', type: 'kitchen' },
        { id: 'room_sala', name: 'Sala de Estar / Jantar', type: 'living' },
        { id: 'room_quarto_principal', name: 'Quarto Casal / Principal', type: 'bedroom' },
        { id: 'room_quarto_2', name: 'Quarto 2 / Home Office', type: 'bedroom' },
        { id: 'room_banheiro', name: 'Banheiro Social', type: 'bathroom' },
        { id: 'room_varanda', name: 'Varanda / Sacada', type: 'balcony' }
      ],
      residentsCount: 2,
      isHomeOffice: true,
      hasChildren: false,
      hasPets: false,
      accessibilityNeeds: false,
      keysDate: getDefaultKeysDate(),   // Ex: 36 meses no futuro
      moveDate: getDefaultMoveDate(),   // Ex: 37 meses no futuro
      deliveredItems: {
        flooring: false,
        wallTiles: true,
        countertops: true,
        lighting: false,
        sanitary: true
      },
      restrictions: '',
      notes: ''
    },

    // Orçamento Financeiro
    budgetProfile: {
      mode: 'simplified', // 'simplified' | 'detailed'

      // Modo Simplificado
      simplified: {
        initialBalanceCents: 1000000, // R$ 10.000,00 por padrão em centavos
        monthlyCapCents: 150000,      // R$ 1.500,00 por mês
        extraIncomes: [],             // [{ id, name, amountCents, monthIndex }]
        atypicalMonths: {}           // { [monthIndex]: amountCents }
      },

      // Modo Detalhado
      detailed: {
        netMonthlyIncomeCents: 800000,       // R$ 8.000,00
        fixedLivingExpensesCents: 300000,   // R$ 3.000,00
        variableLivingExpensesCents: 100000,// R$ 1.000,00
        propertyInstallmentCents: 150000,   // R$ 1.500,00 (parcela apê)
        otherDebtsCents: 0,
        emergencyReserveCents: 1000000,     // R$ 10.000,00 (Protegida)
        safetyMarginCents: 50000,           // R$ 500,00
        monthlyCapCents: 200000,            // R$ 2.000,00 teto autorizado
        extraIncomes: [],
        atypicalMonths: {},
        postMoveExpensesCents: 80000        // Condomínio, IPTU após as chaves
      }
    },

    // Premissas e Hipóteses
    assumptions: {
      annualInflationRate: 0.0,       // 0% por padrão, configurável (ex: 0.06 = 6% a.a.)
      applyInflationToUncontracted: true,
      yieldRateAnnual: 0.0,           // Rendimentos do fundo (padrão 0%)
      contingencyPercent: 0.05        // 5% de reserva para imprevistos
    },

    // Lista de Itens por Ambiente
    items: [],

    // Histórico de Compras/Pagamentos Efetivados
    paidHistory: []
  };
}

/**
 * Data padrão de entrega das chaves (36 meses a partir de hoje)
 */
function getDefaultKeysDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 36);
  return d.toISOString().split('T')[0];
}

/**
 * Data padrão de mudança (37 meses a partir de hoje)
 */
function getDefaultMoveDate() {
  const d = new Date();
  d.setMonth(d.getMonth() + 37);
  return d.toISOString().split('T')[0];
}
