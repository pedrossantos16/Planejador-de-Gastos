import { DIMENSION_RULES, GOAL_IMPORTANCE, RULE_BASIS } from '../models/planningRules.js';

const OWNERSHIP_TERMS = {
  singleBed: ['cama', 'colchao'],
  doubleBed: ['cama', 'colchao'],
  wardrobe: ['guarda roupa', 'armario', 'closet'],
  sofa: ['sofa', 'poltrona'],
  diningTable: ['mesa de jantar', 'mesa de refeicao', 'mesa para refeicao'],
  desk: ['mesa de trabalho', 'escrivaninha', 'mesa de escritorio'],
  chair: ['cadeira'],
  refrigerator: ['geladeira', 'refrigerador'],
  cooktop: ['fogao', 'cooktop'],
  kitchenStorage: ['armario', 'gabinete', 'despensa'],
  kitchenCounter: ['bancada', 'bancada de cozinha'],
  washer: ['maquina de lavar', 'lavadora'],
  mediaConsole: ['rack', 'painel', 'suporte de tv'],
  television: ['televisao', 'tv'],
  guestBed: ['cama', 'sofa cama', 'colchao']
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

function goalPriority(profile, goalId, fallback = 'optional') {
  const value = profile?.goals?.[goalId];
  return GOAL_IMPORTANCE[value]?.itemPriority || fallback;
}

function alreadyOwns(category, text) {
  const haystack = normalize(text);
  return (OWNERSHIP_TERMS[category] || []).some(term => haystack.includes(normalize(term)));
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
    const ownedText = [
      apartment.existingFurniture,
      ...(project.items || [])
        .filter(item => item.scope === 'already_owned' || item.status === 'installed' || item.status === 'delivered')
        .map(item => item.name)
    ].join(' ');

    const add = ({ id, name, category, room, goalId, priority, reason, quantity = 1 }) => {
      if (!room || alreadyOwns(category, ownedText)) return;
      const dimensionRule = DIMENSION_RULES[category];
      needs.push({
        id,
        name,
        category,
        roomId: room.id,
        quantity,
        priority: priority || goalPriority(profile, goalId),
        goalId,
        reason,
        dimensionRuleId: category,
        dimensionRule,
        styleProfile: profile.style || {},
        confidence: 'low',
        confidenceReason: RULE_BASIS
      });
    };

    if (primaryBedroom) {
      add({
        id: 'sleeping-bed',
        name: residents > 1 ? 'Cama para o quarto principal' : 'Cama para o quarto principal',
        category: residents > 1 ? 'doubleBed' : 'singleBed',
        room: primaryBedroom,
        priority: 'essential',
        reason: 'Item básico para dormir; confirme o número de pessoas e o tamanho disponível.'
      });
      if (goalScore(profile, 'storage') > 0) {
        add({
          id: 'bedroom-wardrobe',
          name: 'Armazenamento de roupas do quarto',
          category: 'wardrobe',
          room: primaryBedroom,
          goalId: 'storage',
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
          reason: 'Prevê uma superfície de refeições; quantidade de assentos pode ser ajustada.'
        });
        add({
          id: 'living-dining-seats',
          name: `Assentos para refeições (${residents})`,
          category: 'chair',
          room: livingRoom,
          goalId: 'dining',
          quantity: residents,
          reason: `Sugestão de ${residents} assento(s), ajustável conforme o espaço e o uso da mesa.`
        });
      }
      if (goalScore(profile, 'tvComfort') > 0) {
        add({
          id: 'living-television',
          name: 'Televisão (opcional)',
          category: 'television',
          room: livingRoom,
          goalId: 'tvComfort',
          priority: 'optional',
          reason: 'Envelope ilustrativo de tela; pode ser fixada na parede e não pressupõe modelo.'
        });
        add({
          id: 'living-media-console',
          name: 'Apoio para TV (opcional)',
          category: 'mediaConsole',
          room: livingRoom,
          goalId: 'tvComfort',
          priority: 'optional',
          reason: 'Apoio opcional; a TV também pode ser instalada na parede.'
        });
      }
    }

    const secondaryBedroom = bedroomRooms.find(room => room.id !== primaryBedroom?.id) || null;
    const officeScore = Math.max(
      goalScore(profile, 'homeOffice'),
      apartment.isHomeOffice ? 2 : 0
    );
    const guestScore = goalScore(profile, 'guestRoom');
    if (secondaryBedroom && officeScore > 0) {
      add({
        id: 'office-desk',
        name: 'Mesa de trabalho',
        category: 'desk',
        room: secondaryBedroom,
        goalId: 'homeOffice',
        reason: 'O segundo quarto foi priorizado como espaço de trabalho conforme suas prioridades.'
      });
      add({
        id: 'office-chair',
        name: 'Cadeira de trabalho',
        category: 'chair',
        room: secondaryBedroom,
        goalId: 'homeOffice',
        reason: 'Assento para o espaço de trabalho; confirme ergonomia e medidas antes da compra.'
      });
    }
    if (secondaryBedroom && guestScore > 0 && guestScore > officeScore) {
      add({
        id: 'guest-bed',
        name: 'Cama ou sofá-cama para hóspedes',
        category: 'guestBed',
        room: secondaryBedroom,
        goalId: 'guestRoom',
        reason: 'O quarto foi priorizado para hóspedes porque essa função recebeu maior importância.'
      });
    }

    if (kitchen && goalScore(profile, 'cooking') > 0) {
      add({
        id: 'kitchen-refrigerator',
        name: 'Geladeira',
        category: 'refrigerator',
        room: kitchen,
        goalId: 'cooking',
        priority: 'essential',
        reason: 'Equipamento associado ao uso diário da cozinha; verifique pontos e folgas do fabricante.'
      });
      add({
        id: 'kitchen-cooktop',
        name: 'Fogão ou cooktop',
        category: 'cooktop',
        room: kitchen,
        goalId: 'cooking',
        priority: 'essential',
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
        priority: 'important',
        reason: 'Sugestão para a área de serviço; confira pontos hidráulicos e elétricos.'
      });
    }

    return needs;
  }
}
