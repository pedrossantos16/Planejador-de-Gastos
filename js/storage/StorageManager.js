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
import { ASSET_CATEGORIES, NEED_CRITICALITY } from '../models/planningRules.js';

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
        existingFurniture: project.apartment.existingFurniture || '',
        existingAssets: Array.isArray(project.apartment.existingAssets)
          ? project.apartment.existingAssets
          : [],
        rooms: Array.isArray(project.apartment.rooms)
          ? project.apartment.rooms.map(room => {
            const defaultRoom = defaultProject.apartment.rooms.find(entry => entry.id === room?.id) || {};
            const oldGeometry = room?.geometry || {};
            const doors = Array.isArray(oldGeometry.doors) && oldGeometry.doors.length
              ? oldGeometry.doors
              : oldGeometry.door ? [oldGeometry.door] : [];
            const obstacles = Array.isArray(oldGeometry.obstacles) ? oldGeometry.obstacles : [];
            return {
              ...defaultRoom,
              ...room,
              geometry: {
                widthCm: null,
                lengthCm: null,
                door: null,
                doors: [],
                windows: [],
                obstacles: [],
                fixedElements: [],
                utilityPoints: [],
                ...(defaultRoom.geometry || {}),
                ...oldGeometry,
                doors,
                door: oldGeometry.door || doors[0] || null,
                obstacles,
                fixedElements: Array.isArray(oldGeometry.fixedElements)
                  ? oldGeometry.fixedElements
                  : obstacles.map(obstacle => ({ ...obstacle, type: 'obstacle', blocksPlacement: true })),
                windows: Array.isArray(oldGeometry.windows) ? oldGeometry.windows : [],
                utilityPoints: Array.isArray(oldGeometry.utilityPoints) ? oldGeometry.utilityPoints : []
              }
            };
          })
          : project.apartment.rooms ?? defaultProject.apartment.rooms,
        deliveredItems: {
          ...defaultProject.apartment.deliveredItems,
          ...(project.apartment.deliveredItems || {})
        }
      },
      livingProfile: {
        ...defaultProject.livingProfile,
        ...(project.livingProfile || {}),
        goals: {
          ...defaultProject.livingProfile.goals,
          ...(project.livingProfile?.goals || {})
        },
        style: {
          ...defaultProject.livingProfile.style,
          ...(project.livingProfile?.style || {})
        },
        purchasing: {
          ...defaultProject.livingProfile.purchasing,
          ...(project.livingProfile?.purchasing || {})
        },
        needOverrides: {
          ...defaultProject.livingProfile.needOverrides,
          ...(project.livingProfile?.needOverrides || {})
        },
        needCriticalityOverrides: {
          ...defaultProject.livingProfile.needCriticalityOverrides,
          ...(project.livingProfile?.needCriticalityOverrides || {})
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
      validateRoomGeometry(room);
    }
    if (typeof project.apartment.existingFurniture !== 'string' ||
        project.apartment.existingFurniture.length > 2000) {
      throw new Error('A lista de móveis existentes deve conter até 2.000 caracteres.');
    }
    if (!Array.isArray(project.apartment.existingAssets) ||
        project.apartment.existingAssets.length > 100) {
      throw new Error('Os móveis existentes confirmados devem estar em uma lista válida.');
    }
    const assetIds = new Set();
    for (const asset of project.apartment.existingAssets) {
      if (!asset || typeof asset.id !== 'string' || asset.id.length > 100 ||
          assetIds.has(asset.id) || !Object.prototype.hasOwnProperty.call(ASSET_CATEGORIES, asset.category) ||
          typeof asset.name !== 'string' || asset.name.length > 100 ||
          typeof asset.dimensionsKnown !== 'boolean' || typeof asset.mustReuse !== 'boolean' ||
          typeof asset.confirmed !== 'boolean' ||
          (asset.notes !== undefined && (typeof asset.notes !== 'string' || asset.notes.length > 500)) ||
          ['widthCm', 'depthCm', 'heightCm'].some(field => asset[field] !== null &&
            asset[field] !== undefined &&
            (!Number.isFinite(asset[field]) || asset[field] <= 0 || asset[field] > 3000)) ||
          (asset.dimensionsKnown && (!Number.isFinite(asset.widthCm) ||
            !Number.isFinite(asset.depthCm)))) {
        throw new Error('Um móvel existente possui identificação, categoria ou medidas inválidas.');
      }
      if (asset.roomId && !project.apartment.rooms.some(room => room.id === asset.roomId)) {
        throw new Error(`O ambiente do móvel existente "${asset.name}" não existe no projeto.`);
      }
      assetIds.add(asset.id);
    }
    if (!['unknown', 'yes', 'no'].includes(project.apartment.canStoreEarlyPurchases) ||
        typeof project.apartment.memorialNotes !== 'string' ||
        project.apartment.memorialNotes.length > 5000) {
      throw new Error('A informação de armazenamento ou memorial descritivo é inválida.');
    }

    validateLivingProfile(project.livingProfile);

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
      if (item.strategyStatus && !['pending_research', 'researched', 'selected'].includes(item.strategyStatus)) {
        throw new Error(`Situação da estratégia inválida no item "${item.name}".`);
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

function validateLivingProfile(profile) {
  if (!profile || !profile.goals || !profile.style || !profile.purchasing) {
    throw new Error('O perfil residencial está incompleto.');
  }
  const allowedImportance = new Set(['high', 'medium', 'low', 'not_needed']);
  for (const [goal, value] of Object.entries(profile.goals)) {
    if (typeof value !== 'string' || !allowedImportance.has(value)) {
      throw new Error(`Importância inválida para o objetivo "${goal}".`);
    }
  }
  for (const field of ['liked', 'disliked']) {
    if (!Array.isArray(profile.style[field]) || profile.style[field].length > 20 ||
        profile.style[field].some(value => typeof value !== 'string' || value.length > 100)) {
      throw new Error(`Preferências de estilo inválidas: ${field}.`);
    }
  }
  for (const field of ['colors', 'avoidColors', 'references']) {
    if (typeof profile.style[field] !== 'string' || profile.style[field].length > 1000) {
      throw new Error(`Preferência estética inválida: ${field}.`);
    }
  }
  const styleChoices = {
    woodTone: ['no_preference', 'light', 'medium', 'dark'],
    density: ['clean', 'balanced', 'filled'],
    furniturePresence: ['no_preference', 'discreet', 'statement'],
    lines: ['no_preference', 'straight', 'curved', 'mixed'],
    uniformity: ['low', 'medium', 'high']
  };
  for (const [field, values] of Object.entries(styleChoices)) {
    if (!values.includes(profile.style[field])) {
      throw new Error(`Preferência estética inválida: ${field}.`);
    }
  }
  if (!Array.isArray(profile.style.referenceImages) || profile.style.referenceImages.length > 3 ||
      profile.style.referenceImages.some(image => typeof image !== 'string' ||
        image.length > 550000 || !/^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(image)) ||
      profile.style.referenceImages.reduce((total, image) => total + image.length, 0) > 1650000) {
    throw new Error('As imagens de referência devem ser PNG, JPG ou WebP, até 400 KB cada e 3 arquivos.');
  }
  for (const field of ['preferredBrands', 'rejectedBrands']) {
    if (typeof profile.purchasing[field] !== 'string' || profile.purchasing[field].length > 1000) {
      throw new Error(`Preferência de compra inválida: ${field}.`);
    }
  }
  const choiceFields = ['used', 'readyMade', 'modular', 'planned', 'durabilityOverPrice'];
  if (choiceFields.some(field => !['yes', 'no', 'no_preference'].includes(profile.purchasing[field])) ||
      !['price', 'value', 'durability'].includes(profile.purchasing.objective)) {
    throw new Error('Uma preferência de compra possui um valor inválido.');
  }
  if (!profile.needOverrides || typeof profile.needOverrides !== 'object' ||
      Array.isArray(profile.needOverrides) ||
      Object.values(profile.needOverrides).some(value => typeof value !== 'boolean')) {
    throw new Error('As decisões sobre necessidades sugeridas são inválidas.');
  }
  if (!profile.needCriticalityOverrides ||
      typeof profile.needCriticalityOverrides !== 'object' ||
      Array.isArray(profile.needCriticalityOverrides) ||
      Object.values(profile.needCriticalityOverrides).some(value =>
        !Object.prototype.hasOwnProperty.call(NEED_CRITICALITY, value))) {
    throw new Error('As revisões de criticidade das necessidades são inválidas.');
  }
}

function validateRoomGeometry(room) {
  const geometry = room.geometry;
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) {
    throw new Error(`A geometria do ambiente "${room.name}" é inválida.`);
  }
  for (const [field, value] of [['largura', geometry.widthCm], ['comprimento', geometry.lengthCm]]) {
    if (value !== null && value !== undefined &&
        (!Number.isFinite(value) || value < 100 || value > 3000)) {
      throw new Error(`${field} do ambiente "${room.name}" deve estar entre 100 e 3.000 cm.`);
    }
  }
  const width = geometry.widthCm;
  const length = geometry.lengthCm;
  if (geometry.door) validateOpening(geometry.door, width, length, room.name);
  if (!Array.isArray(geometry.doors) || geometry.doors.length > 50) {
    throw new Error(`As portas do ambiente "${room.name}" devem estar em uma lista válida.`);
  }
  geometry.doors.forEach(door => validateOpening(door, width, length, room.name));
  if (!Array.isArray(geometry.windows) || geometry.windows.length > 50) {
    throw new Error(`As janelas do ambiente "${room.name}" devem estar em uma lista válida.`);
  }
  geometry.windows.forEach(window => validateOpening(window, width, length, room.name));
  if (!Array.isArray(geometry.fixedElements) || geometry.fixedElements.length > 100) {
    throw new Error(`Os elementos fixos do ambiente "${room.name}" devem estar em uma lista válida.`);
  }
  geometry.fixedElements.forEach(element => {
    validateRoomRectangle(element, width, length, room.name, 'elemento fixo');
    if (typeof element.label !== 'string' || element.label.length > 100 ||
        !['counter', 'pillar', 'shaft', 'fixed_appliance', 'fixed_cabinet',
          'circulation', 'other', 'obstacle'].includes(element.type) ||
        (element.heightCm !== undefined && element.heightCm !== null &&
          (!Number.isFinite(element.heightCm) || element.heightCm <= 0 || element.heightCm > 3000)) ||
        (element.blocksPlacement !== undefined && typeof element.blocksPlacement !== 'boolean')) {
      throw new Error(`Um elemento fixo do ambiente "${room.name}" possui dados inválidos.`);
    }
  });
  if (!Array.isArray(geometry.utilityPoints) || geometry.utilityPoints.length > 100) {
    throw new Error(`Os pontos técnicos do ambiente "${room.name}" devem estar em uma lista válida.`);
  }
  geometry.utilityPoints.forEach(point => {
    if (!point || !['water', 'drain', 'electrical', 'gas', 'other'].includes(point.type) ||
        !Number.isFinite(point.xCm) || !Number.isFinite(point.yCm) ||
        point.xCm < 0 || point.yCm < 0 ||
        (width && point.xCm > width) || (length && point.yCm > length) ||
        (point.label !== undefined && (typeof point.label !== 'string' || point.label.length > 100))) {
      throw new Error(`Um ponto técnico do ambiente "${room.name}" possui posição inválida.`);
    }
  });
  if (!Array.isArray(geometry.obstacles) || geometry.obstacles.length > 100) {
    throw new Error(`Os obstáculos do ambiente "${room.name}" devem estar em uma lista válida.`);
  }
  geometry.obstacles.forEach(obstacle => {
    if (!obstacle || typeof obstacle !== 'object') {
      throw new Error(`Um obstáculo do ambiente "${room.name}" é inválido.`);
    }
    validateRoomRectangle(obstacle, width, length, room.name, 'obstáculo');
    if (typeof obstacle.label !== 'string' || obstacle.label.length > 100) {
      throw new Error(`O nome de um obstáculo do ambiente "${room.name}" é inválido.`);
    }
  });
}

function validateRoomRectangle(rectangle, width, length, roomName, label) {
  const values = [rectangle?.xCm, rectangle?.yCm, rectangle?.widthCm, rectangle?.lengthCm];
  if (values.some(value => !Number.isFinite(value) || value < 0) ||
      rectangle.widthCm === 0 || rectangle.lengthCm === 0 ||
      (width && rectangle.xCm + rectangle.widthCm > width) ||
      (length && rectangle.yCm + rectangle.lengthCm > length)) {
    throw new Error(`Um ${label} do ambiente "${roomName}" possui posição ou tamanho inválido.`);
  }
}

function validateOpening(opening, width, length, roomName) {
  if (!opening || typeof opening !== 'object' || Array.isArray(opening)) {
    throw new Error(`Uma abertura do ambiente "${roomName}" é inválida.`);
  }
  const walls = ['north', 'east', 'south', 'west'];
  const sideLength = ['north', 'south'].includes(opening.wall) ? width : length;
  if (!walls.includes(opening.wall) || !Number.isFinite(opening.offsetCm) ||
      !Number.isFinite(opening.widthCm) || opening.offsetCm < 0 || opening.widthCm <= 0 ||
      (sideLength && opening.offsetCm + opening.widthCm > sideLength) ||
      (opening.swing !== undefined && !['inward', 'outward', 'none'].includes(opening.swing)) ||
      ['sillHeightCm', 'maxAllowedFurnitureHeightCm'].some(field =>
        opening[field] !== undefined && opening[field] !== null &&
        (!Number.isFinite(opening[field]) || opening[field] < 0 || opening[field] > 3000)) ||
      (opening.requiresAccess !== undefined && typeof opening.requiresAccess !== 'boolean')) {
    throw new Error(`Uma abertura do ambiente "${roomName}" possui posição ou largura inválida.`);
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
