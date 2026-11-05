import {
  ASSET_CATEGORIES, DIMENSION_RULES, GOAL_IMPORTANCE,
  NEED_CRITICALITY_RULES, RULE_BASIS, SPATIAL_RELATIONS
} from '../models/planningRules.js';

const CRITICALITY_TO_PRIORITY = {
  required_for_move: 'essential',
  important_after_move: 'important',
  deferrable: 'optional'
};

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function roomOfType(rooms, type, predicate = () => true) {
  return rooms.find(room => room.type === type && predicate(room)) || null;
}

function goalScore(profile, goalId) {
  const value = profile?.goals?.[goalId] || 'not_needed';
  return GOAL_IMPORTANCE[value]?.score || 0;
}

function assetCoversNeed(asset, need) {
  return asset.confirmed === true && asset.mustReuse === true &&
    asset.category === need.assetCategory &&
    (!asset.roomId || asset.roomId === need.roomId);
}

function categoryFromText(text) {
  const value = normalize(text);
  if (/\barmario(?: de| do| da)? banheiro\b|\bgabinete(?: de| do| da)? banheiro\b/.test(value)) return 'bathroomCabinet';
  if (/\barmario(?: de| do| da)? cozinha\b|\bgabinete(?: de| do| da)? cozinha\b/.test(value)) return 'kitchenStorage';
  if (/\bguarda[\s-]?roupa\b|\bcloset\b/.test(value)) return 'wardrobe';
  if (/\bsofa[\s-]?cama\b|\bcama de hospedes\b/.test(value)) return 'guestBed';
  if (/\bmesa de jantar\b|\bmesa de refeicao\b|\bmesa para refeicao\b/.test(value)) return 'diningTable';
  if (/\bmesa de trabalho\b|\bescrivaninha\b|\bmesa de escritorio\b/.test(value)) return 'desk';
  if (/\bmaquina de lavar\b|\blavadora\b/.test(value)) return 'washer';
  if (/\bgeladeira\b|\brefrigerador\b/.test(value)) return 'refrigerator';
  if (/\bfogao\b|\bcooktop\b/.test(value)) return 'cooktop';
  if (/\bcama\b|\bcolchao\b/.test(value)) return 'bed';
  if (/\bsofa\b|\bpoltrona\b/.test(value)) return 'sofa';
  if (/\bcadeira\b/.test(value)) return 'chair';
  if (/\bbancada\b/.test(value)) return 'kitchenCounter';
  if (/\brack\b|\bpainel de tv\b|\bsuporte de tv\b/.test(value)) return 'mediaConsole';
  if (/\btelevisao\b|\btv\b/.test(value)) return 'television';
  return null;
}

export function buildExistingAssetCandidates(text) {
  return String(text || '').split(/[,;\n]+/).map(entry => entry.trim())
    .filter(Boolean)
    .flatMap((name, index) => {
      const category = categoryFromText(name);
      if (!category || !ASSET_CATEGORIES[category]) return [];
      const id = globalThis.crypto?.randomUUID
        ? `asset-${globalThis.crypto.randomUUID()}`
        : `asset-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;
      return [{
        id,
        category,
        name: name.slice(0, 100),
        roomId: null,
        widthCm: null,
        depthCm: null,
        heightCm: null,
        dimensionsKnown: false,
        mustReuse: false,
        confirmed: false,
        notes: ''
      }];
    });
}

export class NeedsEngine {
  static generateNeeds(project) {
    const apartment = project.apartment || {};
    const rooms = apartment.rooms || [];
    const profile = project.livingProfile || {};
    const bedroomRooms = rooms.filter(room => room.type === 'bedroom');
    const primaryBedroom = roomOfType(rooms, 'bedroom', room =>
      /principal|casal|suite/i.test(room.name)) || bedroomRooms[0] || null;
    const livingRoom = roomOfType(rooms, 'living');
    const kitchen = roomOfType(rooms, 'kitchen');
    const laundry = rooms.find(room => /lavanderia|servico|varanda/i.test(room.name)) ||
      roomOfType(rooms, 'balcony');
    const needs = [];
    const residents = Math.max(1, Number(apartment.residentsCount) || 1);
    const assets = apartment.existingAssets || [];

    const add = ({
      id, name, category, assetCategory = category, room, goalId,
      reason, quantity = 1, groupId = null, spatialRole = null, spatialRelation = null
    }) => {
      if (!room) return;
      const need = {
        id,
        name,
        category,
        assetCategory,
        roomId: room.id,
        quantity,
        goalId,
        goalImportance: goalId ? profile.goals?.[goalId] || 'not_needed' : 'not_needed',
        needCriticality: profile.needCriticalityOverrides?.[id] ||
          NEED_CRITICALITY_RULES[category] || 'deferrable',
        groupId,
        furnitureGroup: groupId ? {
          id: groupId,
          relation: SPATIAL_RELATIONS[groupId].relation
        } : null,
        spatialRole,
        spatialRelation,
        reason,
        dimensionRuleId: category,
        dimensionRule: DIMENSION_RULES[category],
        styleProfile: profile.style || {},
        confidence: 'low',
        confidenceReason: RULE_BASIS
      };
      need.priority = CRITICALITY_TO_PRIORITY[need.needCriticality];
      const alreadyMappedOwnedItem = (project.items || []).some(item =>
        item.needId === need.id && (item.scope === 'already_owned' ||
          item.status === 'installed' || item.status === 'delivered'));
      if (!alreadyMappedOwnedItem && !assets.some(asset => assetCoversNeed(asset, need))) {
        needs.push(need);
      }
    };

    if (primaryBedroom) {
      const bedCategory = residents > 1 ? 'doubleBed' : 'singleBed';
      add({
        id: 'sleeping-bed',
        name: 'Cama para o quarto principal',
        category: bedCategory,
        assetCategory: 'bed',
        room: primaryBedroom,
        groupId: 'BedroomGroup',
        spatialRole: 'bed',
        reason: 'Item básico para dormir; confirme o número de pessoas e o tamanho disponível.'
      });
      if (goalScore(profile, 'storage') > 0) {
        add({
          id: 'bedroom-wardrobe',
          name: 'Armazenamento de roupas do quarto',
          category: 'wardrobe',
          room: primaryBedroom,
          goalId: 'storage',
          groupId: 'BedroomGroup',
          spatialRole: 'wardrobe',
          spatialRelation: { type: 'near', targetNeedId: 'sleeping-bed' },
          reason: 'Sugestão ligada à importância de armazenamento que você informou.'
        });
      }
    }

    if (livingRoom) {
      if (goalScore(profile, 'tvComfort') > 0 || goalScore(profile, 'hosting') > 0) {
        add({
          id: 'living-sofa',
          name: 'Assento principal da sala',
          category: 'sofa',
          room: livingRoom,
          goalId: goalScore(profile, 'tvComfort') >= goalScore(profile, 'hosting') ? 'tvComfort' : 'hosting',
          groupId: goalScore(profile, 'tvComfort') > 0 ? 'TVGroup' : null,
          spatialRole: 'sofa',
          spatialRelation: goalScore(profile, 'tvComfort') > 0
            ? { type: 'faces', targetNeedId: 'living-television' }
            : null,
          reason: 'Dimensionado como envelope de sofá compacto; a escolha do modelo fica para depois.'
        });
      }
      if (goalScore(profile, 'dining') > 0) {
        add({
          id: 'living-dining-table',
          name: 'Mesa para refeições',
          category: 'diningTable',
          room: livingRoom,
          goalId: 'dining',
          groupId: 'DiningGroup',
          spatialRole: 'table',
          reason: 'Prevê uma superfície de refeições; quantidade de assentos pode ser ajustada.'
        });
        add({
          id: 'living-dining-seats',
          name: `Assentos para refeições (${residents})`,
          category: 'chair',
          assetCategory: 'chair',
          room: livingRoom,
          goalId: 'dining',
          quantity: residents,
          groupId: 'DiningGroup',
          spatialRole: 'dining-seat',
          spatialRelation: { type: 'around', targetNeedId: 'living-dining-table' },
          reason: `Sugestão de ${residents} assento(s) posicionados como grupo junto à mesa.`
        });
      }
      if (goalScore(profile, 'tvComfort') > 0) {
        add({
          id: 'living-television',
          name: 'Televisão (opcional)',
          category: 'television',
          room: livingRoom,
          goalId: 'tvComfort',
          groupId: 'TVGroup',
          spatialRole: 'television',
          spatialRelation: { type: 'viewed_from', targetNeedId: 'living-sofa' },
          reason: 'Envelope ilustrativo de tela; pode ser fixada na parede e não pressupõe modelo.'
        });
        add({
          id: 'living-media-console',
          name: 'Apoio para TV (opcional)',
          category: 'mediaConsole',
          room: livingRoom,
          goalId: 'tvComfort',
          groupId: 'TVGroup',
          spatialRole: 'media-console',
          spatialRelation: { type: 'supports', targetNeedId: 'living-television' },
          reason: 'Apoio opcional; a TV também pode ser instalada na parede.'
        });
      }
    }

    const secondaryBedroom = bedroomRooms.find(room => room.id !== primaryBedroom?.id) || null;
    const officeScore = Math.max(goalScore(profile, 'homeOffice'), apartment.isHomeOffice ? 2 : 0);
    const guestScore = goalScore(profile, 'guestRoom');
    if (secondaryBedroom && officeScore > 0) {
      add({
        id: 'office-desk',
        name: 'Mesa de trabalho',
        category: 'desk',
        room: secondaryBedroom,
        goalId: 'homeOffice',
        groupId: 'WorkGroup',
        spatialRole: 'desk',
        reason: 'Sugestão de espaço de trabalho; sua importância não determina a prioridade financeira.'
      });
      add({
        id: 'office-chair',
        name: 'Cadeira de trabalho',
        category: 'chair',
        assetCategory: 'chair',
        room: secondaryBedroom,
        goalId: 'homeOffice',
        groupId: 'WorkGroup',
        spatialRole: 'work-seat',
        spatialRelation: { type: 'faces', targetNeedId: 'office-desk' },
        reason: 'Assento vinculado à mesa de trabalho; confirme ergonomia e medidas antes da compra.'
      });
    }
    if (secondaryBedroom && guestScore > 0) {
      add({
        id: 'guest-bed',
        name: 'Cama ou sofá-cama para hóspedes',
        category: 'guestBed',
        room: secondaryBedroom,
        goalId: 'guestRoom',
        groupId: 'BedroomGroup',
        spatialRole: 'guest-bed',
        reason: 'Sugestão para acomodar hóspedes; compare com o uso de escritório antes de decidir.'
      });
    }

    if (kitchen && goalScore(profile, 'cooking') > 0) {
      add({
        id: 'kitchen-refrigerator',
        name: 'Geladeira',
        category: 'refrigerator',
        room: kitchen,
        goalId: 'cooking',
        reason: 'Equipamento associado ao uso diário da cozinha; verifique pontos e folgas do fabricante.'
      });
      add({
        id: 'kitchen-cooktop',
        name: 'Fogão ou cooktop',
        category: 'cooktop',
        room: kitchen,
        goalId: 'cooking',
        reason: 'Equipamento para preparo de refeições; confirme instalações compatíveis.'
      });
      if (!apartment.deliveredItems?.countertops) {
        add({
          id: 'kitchen-worktop',
          name: 'Bancada de preparo',
          category: 'kitchenCounter',
          room: kitchen,
          goalId: 'cooking',
          reason: 'Necessidade funcional sugerida quando a bancada não foi marcada como entregue.'
        });
      }
      if (goalScore(profile, 'storage') > 0) {
        add({
          id: 'kitchen-storage',
          name: 'Armazenamento de cozinha',
          category: 'kitchenStorage',
          room: kitchen,
          goalId: 'storage',
          reason: 'Armário sugerido para guardar utensílios e mantimentos.'
        });
      }
    }

    if (laundry && goalScore(profile, 'laundry') > 0) {
      add({
        id: 'laundry-washer',
        name: 'Máquina de lavar',
        category: 'washer',
        room: laundry,
        goalId: 'laundry',
        reason: 'Sugestão para a área de serviço; confira pontos hidráulicos e elétricos.'
      });
    }

    return needs;
  }
}
