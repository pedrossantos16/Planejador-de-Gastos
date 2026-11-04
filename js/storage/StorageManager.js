import {
  createDefaultProject,
  SCOPE_OPTIONS,
  PRIORITY_OPTIONS,
  STATUS_OPTIONS,
  STRATEGY_OPTIONS
} from '../models/types.js';
import {
  CONTINGENCY_RULE, RULE_SCHEMA_VERSION, resolveContingencyRule
} from '../models/contingencyRules.js';

const STORAGE_KEY = 'meu_ape_planejado_project';
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const MONEY_FIELDS = [
  'initialBalanceCents', 'monthlyCapCents', 'netMonthlyIncomeCents',
  'fixedLivingExpensesCents', 'variableLivingExpensesCents',
  'propertyInstallmentCents', 'otherDebtsCents', 'emergencyReserveCents',
  'safetyMarginCents', 'postMoveExpensesCents'
];

export class StorageManager {
  static storage = null;
  static lastError = null;

  static setStorage(storage) {
    this.storage = storage;
  }

  static getStorage() {
    return this.storage || globalThis.localStorage;
  }

  static saveProject(project) {
    try {
      const storage = this.getStorage();
      if (!storage) throw new Error('Armazenamento local indisponível neste navegador.');
      const validated = this.migrateAndValidateSchema(project);
      validated.updatedAt = new Date().toISOString();
      storage.setItem(STORAGE_KEY, JSON.stringify(validated));
      this.lastError = null;
      return { success: true };
    } catch (error) {
      this.lastError = error;
      console.error('Erro ao salvar projeto localmente:', error);
      return { success: false, error: error.message };
    }
  }

  static loadProject() {
    const storage = this.getStorage();
    if (!storage) throw new Error('Armazenamento local indisponível neste navegador.');
    const data = storage.getItem(STORAGE_KEY);
    if (data === null) return createDefaultProject();
    try {
      const parsed = JSON.parse(data);
      return this.migrateAndValidateSchema(parsed);
    } catch (error) {
      this.lastError = error;
      throw new Error(`O planejamento salvo não pôde ser carregado. O original foi preservado. ${error.message}`);
    }
  }

  static clearProject() {
    try {
      const storage = this.getStorage();
      if (!storage) throw new Error('Armazenamento local indisponível neste navegador.');
      storage.removeItem(STORAGE_KEY);
      this.lastError = null;
      return { success: true };
    } catch (error) {
      this.lastError = error;
      console.error('Erro ao limpar projeto localmente:', error);
      return { success: false, error: error.message };
    }
  }

  static exportToJson(project) {
    const exportData = {
      meta: {
        appName: 'Meu Apê Planejado',
        exportDate: new Date().toISOString(),
        version: '1.0'
      },
      project
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Meu_Ape_Planejado_${sanitizeFileName(project.name)}_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  static exportRawBackup() {
    const raw = this.getStorage()?.getItem(STORAGE_KEY);
    if (raw === null || raw === undefined) throw new Error('Não há cópia salva para exportar.');
    const blob = new Blob([raw], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Meu_Ape_Planejado_recuperacao_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  static importFromJsonText(jsonText) {
    try {
      if (typeof jsonText !== 'string' || new Blob([jsonText]).size > MAX_IMPORT_BYTES) {
        throw new Error('O arquivo excede o limite de 5 MB ou não é texto válido.');
      }
      const parsed = JSON.parse(jsonText);
      const projectData = parsed?.project || parsed;
      return { success: true, project: this.migrateAndValidateSchema(projectData) };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  static migrateAndValidateSchema(project) {
    if (!project || typeof project !== 'object' || Array.isArray(project)) {
      throw new Error('O conteúdo não é um projeto JSON válido.');
    }
    if (project.schemaVersion && project.schemaVersion !== '1.0') {
      throw new Error(`Versão de projeto não suportada: ${project.schemaVersion}.`);
    }
    if (!project.apartment || typeof project.apartment !== 'object' ||
        !project.budgetProfile || typeof project.budgetProfile !== 'object') {
      throw new Error('Faltam dados obrigatórios do apartamento ou orçamento.');
    }
    if (project.items !== undefined && !Array.isArray(project.items)) {
      throw new Error('A lista de itens tem formato inválido.');
    }
    if (project.paidHistory !== undefined && !Array.isArray(project.paidHistory)) {
      throw new Error('O histórico de pagamentos tem formato inválido.');
    }

    const defaultProject = createDefaultProject();
    const migrated = {
      ...defaultProject,
      ...project,
      baseDate: project.baseDate || project.createdAt?.slice(0, 10) || defaultProject.baseDate,
      apartment: {
        ...defaultProject.apartment,
        ...project.apartment,
        deliveredItems: {
          ...defaultProject.apartment.deliveredItems,
          ...(project.apartment.deliveredItems || {})
        }
      },
      budgetProfile: {
        ...defaultProject.budgetProfile,
        ...project.budgetProfile,
        simplified: {
          ...defaultProject.budgetProfile.simplified,
          ...(project.budgetProfile.simplified || {})
        },
        detailed: {
          ...defaultProject.budgetProfile.detailed,
          ...(project.budgetProfile.detailed || {})
        }
      },
      assumptions: migrateAssumptions(defaultProject.assumptions, project.assumptions),
      items: project.items || [],
      paidHistory: project.paidHistory || []
    };
    this.validateProject(migrated);
    return migrated;
  }

  static validateProject(project) {
    if (!Array.isArray(project.apartment.rooms) || !Array.isArray(project.items)) {
      throw new Error('Ambientes e itens devem ser listas.');
    }
    if (project.apartment.rooms.length > 100 || project.items.length > 1000) {
      throw new Error('O projeto excede o limite de ambientes ou itens permitido.');
    }
    for (const dateField of ['baseDate', 'keysDate', 'moveDate']) {
      const value = dateField === 'baseDate' ? project.baseDate : project.apartment[dateField];
      if (value && !isValidDate(value)) throw new Error(`Data inválida em ${dateField}.`);
    }
    for (const profile of [project.budgetProfile.simplified, project.budgetProfile.detailed]) {
      for (const field of MONEY_FIELDS) {
        const value = profile[field];
        if (value !== null && value !== undefined &&
            (!Number.isSafeInteger(value) || value < 0)) {
          throw new Error(`Valor monetário inválido em ${field}; use centavos inteiros não negativos.`);
        }
        if (!Array.isArray(profile.extraIncomes || [])) {
          throw new Error('Entradas extras devem estar em uma lista.');
        }
        for (const income of profile.extraIncomes || []) {
          if (!income || !Number.isSafeInteger(income.amountCents) || income.amountCents < 0 ||
              !Number.isInteger(income.monthIndex) || income.monthIndex < 0 ||
              income.monthIndex > 1200) {
            throw new Error('Uma entrada extra possui valor ou vencimento inválido.');
          }
        }
        const atypicalMonths = profile.atypicalMonths || {};
        if (!atypicalMonths || typeof atypicalMonths !== 'object' || Array.isArray(atypicalMonths)) {
          throw new Error('Aportes mensais específicos possuem formato inválido.');
        }
        Object.entries(atypicalMonths).forEach(([month, value]) => {
          if (!/^\d+$/.test(month) || Number(month) === 0 || Number(month) > 1200 ||
              !Number.isSafeInteger(value) || value < 0) {
            throw new Error(`Aporte mensal inválido no mês ${month}.`);
          }
        });
      }
    }
    const roomIds = new Set();
    for (const room of project.apartment.rooms) {
      if (!room || typeof room.id !== 'string' || typeof room.name !== 'string' ||
          room.id.length > 100 || room.name.length > 200 || roomIds.has(room.id)) {
        throw new Error('Um ambiente possui dados inválidos ou ID duplicado.');
      }
      roomIds.add(room.id);
    }

    const itemIds = new Set();
    for (const item of project.items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' ||
          typeof item.name !== 'string' || item.id.length > 100 || item.name.length > 500 ||
          !Array.isArray(item.payments || []) || item.payments.length > 1000 ||
          itemIds.has(item.id)) {
        throw new Error('Um item possui formato inválido.');
      }
      itemIds.add(item.id);
      if (item.roomId && !roomIds.has(item.roomId)) {
        throw new Error(`O ambiente do item "${item.name}" não existe no projeto.`);
      }
      if (item.scope && !Object.values(SCOPE_OPTIONS).includes(item.scope)) {
        throw new Error(`Escopo inválido no item "${item.name}".`);
      }
      if (item.priority && !Object.values(PRIORITY_OPTIONS).includes(item.priority)) {
        throw new Error(`Prioridade inválida no item "${item.name}".`);
      }
      if (item.status && !Object.values(STATUS_OPTIONS).includes(item.status)) {
        throw new Error(`Situação inválida no item "${item.name}".`);
      }
      if (item.strategy && !Object.values(STRATEGY_OPTIONS).includes(item.strategy)) {
        throw new Error(`Estratégia inválida no item "${item.name}".`);
      }
      for (const field of [
        'basePriceCents', 'shippingCents', 'assemblyCents',
        'installationCents', 'additionalCostsCents'
      ]) {
        const value = item[field];
        if (value !== null && value !== undefined &&
            (!Number.isSafeInteger(value) || value < 0)) {
          throw new Error(`Valor monetário inválido em ${field} no item "${item.name}".`);
        }
      }
      if (item.deliveryMonthIndex !== null && item.deliveryMonthIndex !== undefined &&
          (!Number.isInteger(item.deliveryMonthIndex) || item.deliveryMonthIndex < 0 || item.deliveryMonthIndex > 1200)) {
        throw new Error(`Mês de entrega inválido no item "${item.name}".`);
      }
      for (const payment of item.payments || []) {
        if (!Number.isSafeInteger(payment.amountCents) || payment.amountCents < 0 ||
            !Number.isInteger(payment.monthIndex) || payment.monthIndex < 0 || payment.monthIndex > 1200) {
          throw new Error(`Pagamento inválido no item "${item.name}".`);
        }
        if (typeof payment.isPaid !== 'boolean') {
          throw new Error(`Status do pagamento inválido no item "${item.name}".`);
        }
      }
    }
    if (!['simplified', 'detailed'].includes(project.budgetProfile.mode)) {
      throw new Error('Modo de orçamento inválido.');
    }
    for (const [field, value] of Object.entries(project.assumptions)) {
      if (['annualInflationRate', 'yieldRateAnnual', 'contingencyPercent'].includes(field) &&
          (!Number.isFinite(value) || value < 0 || value > 5)) {
        throw new Error(`Premissa inválida: ${field}.`);
      }
    }
  }
}

function migrateAssumptions(defaults, raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { contingencyMode: _legacyMode, ...rest } = source;
  const rule = resolveContingencyRule(source);
  const explicit = Object.values(CONTINGENCY_RULE).includes(source.contingencyRule);
  return {
    ...defaults,
    ...rest,
    ruleSchemaVersion: RULE_SCHEMA_VERSION,
    contingencyRule: rule,
    // Sem versão explícita a origem é ambígua: a regra anterior é mantida, mas exige revisão.
    contingencyRuleConfirmed: rule === CONTINGENCY_RULE.TARGET ||
      (explicit && source.contingencyRuleConfirmed !== false),
    contingencyTargetDate: typeof source.contingencyTargetDate === 'string' ? source.contingencyTargetDate : ''
  };
}

function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function sanitizeFileName(name) {
  return (name || 'projeto').replace(/[^a-zA-Z0-9_-]/g, '_');
}
