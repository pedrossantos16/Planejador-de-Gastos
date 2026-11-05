import { CLEARANCE_RULES, RULE_BASIS } from '../models/planningRules.js';

const PRIORITY_ORDER = { essential: 0, important: 1, optional: 2 };

function isValidRoom(room) {
  const geometry = room.geometry || {};
  return Number.isFinite(geometry.widthCm) && geometry.widthCm > 0 &&
    Number.isFinite(geometry.lengthCm) && geometry.lengthCm > 0;
}

function rectanglesOverlap(a, b, gap = 0) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x &&
    a.y < b.y + b.length + gap && a.y + a.length + gap > b.y;
}

function expand(min, max, step) {
  const result = [];
  for (let value = min; value <= max; value += step) result.push(value);
  if (result[result.length - 1] !== max) result.push(max);
  return result;
}

function sizeOptions(slot, room) {
  const widthStep = 5;
  const depthStep = 5;
  const options = [];
  for (let width = slot.idealWidthCm; width >= slot.minWidthCm; width -= widthStep) {
    for (let depth = slot.idealDepthCm; depth >= slot.minDepthCm; depth -= depthStep) {
      options.push({ width, length: depth, rotated: false });
      options.push({ width: depth, length: width, rotated: true });
    }
  }
  return options
    .filter(option => option.width <= room.widthCm && option.length <= room.lengthCm)
    .sort((a, b) => {
      const aArea = a.width * a.length;
      const bArea = b.width * b.length;
      return bArea - aArea || Number(a.rotated) - Number(b.rotated);
    });
}

function doorClearance(room) {
  const door = room.geometry?.door;
  if (!door || door.swing === 'outward' || door.swing === 'none' ||
      !Number.isFinite(door.widthCm) || !Number.isFinite(door.offsetCm)) return null;
  const depth = CLEARANCE_RULES.doorSwingDepthCm;
  const width = Math.min(door.widthCm, room.geometry.widthCm);
  const length = Math.min(door.widthCm, room.geometry.lengthCm);
  if (door.wall === 'north') return { x: door.offsetCm, y: 0, width, length: depth };
  if (door.wall === 'south') return { x: door.offsetCm, y: room.geometry.lengthCm - depth, width, length: depth };
  if (door.wall === 'west') return { x: 0, y: door.offsetCm, width: depth, length };
  if (door.wall === 'east') return { x: room.geometry.widthCm - depth, y: door.offsetCm, width: depth, length };
  return null;
}

function positionCandidates(room, item) {
  const step = CLEARANCE_RULES.placementStepCm;
  const maxX = room.widthCm - item.width;
  const maxY = room.lengthCm - item.length;
  const xs = expand(0, maxX, step);
  const ys = expand(0, maxY, step);
  const candidates = [];
  for (const y of ys) {
    for (const x of xs) {
      if (x === 0 || y === 0 || x === maxX || y === maxY) {
        candidates.push({ x, y, width: item.width, length: item.length });
      }
    }
  }
  return candidates;
}

function canPlace(candidate, geometry, placed, blocked) {
  if (candidate.x < 0 || candidate.y < 0 ||
      candidate.x + candidate.width > geometry.widthCm ||
      candidate.y + candidate.length > geometry.lengthCm) return false;
  if (blocked.some(rectangle => rectanglesOverlap(candidate, rectangle))) return false;
  return !placed.some(item => rectanglesOverlap(
    candidate, item, CLEARANCE_RULES.furnitureGapCm
  ));
}

export class LayoutEngine {
  static buildFurnitureSlots(needs, rooms = []) {
    return needs.flatMap(need => {
      const dimensions = need.dimensionRule;
      const roomGeometry = rooms.find(room => room.id === need.roomId)?.geometry || {};
      const hasRoomDimensions = Number.isFinite(roomGeometry.widthCm) &&
        Number.isFinite(roomGeometry.lengthCm);
      const quantity = Math.min(10, Math.max(1, Number(need.quantity) || 1));
      return Array.from({ length: quantity }, (_, index) => ({
        id: `slot-${need.id}${quantity > 1 ? `-${index + 1}` : ''}`,
        needId: need.id,
        roomId: need.roomId,
        category: need.category,
        name: quantity > 1 ? `${need.name} ${index + 1}` : need.name,
        quantity: 1,
        minWidthCm: dimensions.minWidthCm,
        idealWidthCm: dimensions.idealWidthCm,
        maxWidthCm: dimensions.maxWidthCm,
        minDepthCm: dimensions.minDepthCm,
        idealDepthCm: dimensions.idealDepthCm,
        maxDepthCm: dimensions.maxDepthCm,
        availableWidthCm: hasRoomDimensions
          ? Math.max(roomGeometry.widthCm, roomGeometry.lengthCm)
          : null,
        availableDepthCm: hasRoomDimensions
          ? Math.min(roomGeometry.widthCm, roomGeometry.lengthCm)
          : null,
        preferredHeightCm: dimensions.preferredHeightCm ?? null,
        orientation: 'wall-aligned',
        requiredClearances: {
          doorSwingDepthCm: CLEARANCE_RULES.doorSwingDepthCm,
          furnitureGapCm: CLEARANCE_RULES.furnitureGapCm
        },
        priority: need.priority,
        styleProfile: need.styleProfile,
        budgetWeight: need.priority === 'essential' ? 3 : need.priority === 'important' ? 2 : 1,
        confidence: need.confidence,
        confidenceReason: RULE_BASIS
      }));
    });
  }

  static generateLayout(rooms, slots) {
    return rooms.map(room => {
      const roomSlots = slots.filter(slot => slot.roomId === room.id);
      if (!isValidRoom(room)) {
        return {
          roomId: room.id,
          widthCm: null,
          lengthCm: null,
          placements: [],
          unplaced: roomSlots.map(slot => ({
            slotId: slot.id,
            reason: 'Informe largura e comprimento do ambiente para avaliar o encaixe.'
          })),
          confidence: 'low',
          limitations: [RULE_BASIS]
        };
      }

      const geometry = room.geometry;
      const obstacles = (geometry.obstacles || []).map(obstacle => ({
        x: obstacle.xCm,
        y: obstacle.yCm,
        width: obstacle.widthCm,
        length: obstacle.lengthCm
      }));
      const blocked = [...obstacles, doorClearance(room)].filter(Boolean);
      const placements = [];
      const unplaced = [];
      const orderedSlots = [...roomSlots].sort((a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
        (b.idealWidthCm * b.idealDepthCm) - (a.idealWidthCm * a.idealDepthCm)
      );

      orderedSlots.forEach(slot => {
        let placedItem = null;
        const sizes = sizeOptions(slot, geometry);
        for (const size of sizes) {
          const candidates = positionCandidates(geometry, size);
          const position = candidates.find(candidate =>
            canPlace(candidate, geometry, placements, blocked));
          if (position) {
            placedItem = {
              ...position,
              slotId: slot.id,
              needId: slot.needId,
              name: slot.name,
              category: slot.category,
              priority: slot.priority,
              rotated: size.rotated,
              confidence: 'low'
            };
            break;
          }
        }
        if (placedItem) placements.push(placedItem);
        else unplaced.push({
          slotId: slot.id,
          reason: sizes.length
            ? 'Não foi encontrado um posicionamento preliminar sem colisão; revise medidas e prioridades.'
            : 'O envelope mínimo não cabe nas dimensões informadas para este ambiente.'
        });
      });

      return {
        roomId: room.id,
        widthCm: geometry.widthCm,
        lengthCm: geometry.lengthCm,
        placements,
        unplaced,
        confidence: 'low',
        limitations: [
          'Esquema 2D preliminar; não confirma a rota completa de circulação nem a abertura real de portas e equipamentos.',
          RULE_BASIS
        ]
      };
    });
  }
}
