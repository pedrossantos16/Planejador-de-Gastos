import { CLEARANCE_RULES, RULE_BASIS } from '../models/planningRules.js';

const PRIORITY_ORDER = { essential: 0, important: 1, optional: 2 };
const GROUPS_PLACED_TOGETHER = ['DiningGroup', 'WorkGroup'];

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
  const options = [];
  for (let width = slot.idealWidthCm; width >= slot.minWidthCm; width -= 5) {
    for (let depth = slot.idealDepthCm; depth >= slot.minDepthCm; depth -= 5) {
      options.push({ width, length: depth, rotated: false });
      options.push({ width: depth, length: width, rotated: true });
    }
  }
  return options
    .filter(option => option.width <= room.widthCm && option.length <= room.lengthCm)
    .sort((a, b) => b.width * b.length - a.width * a.length ||
      Number(a.rotated) - Number(b.rotated));
}

function openingList(geometry) {
  return geometry.doors?.length ? geometry.doors : geometry.door ? [geometry.door] : [];
}

function doorClearance(door, room) {
  if (door.swing === 'outward' || door.swing === 'none' ||
      !Number.isFinite(door.widthCm) || !Number.isFinite(door.offsetCm)) return null;
  const depth = CLEARANCE_RULES.doorSwingDepthCm;
  const width = Math.min(door.widthCm, room.widthCm);
  const length = Math.min(door.widthCm, room.lengthCm);
  if (door.wall === 'north') return { x: door.offsetCm, y: 0, width, length: depth };
  if (door.wall === 'south') return { x: door.offsetCm, y: room.lengthCm - depth, width, length: depth };
  if (door.wall === 'west') return { x: 0, y: door.offsetCm, width: depth, length };
  if (door.wall === 'east') return { x: room.widthCm - depth, y: door.offsetCm, width: depth, length };
  return null;
}

function fixedRectangles(geometry) {
  const fixed = [...(geometry.fixedElements || []), ...(geometry.obstacles || [])];
  return fixed.filter(element => element.blocksPlacement !== false)
    .filter(element => [element.xCm, element.yCm, element.widthCm, element.lengthCm]
      .every(Number.isFinite))
    .map(element => ({
      x: element.xCm,
      y: element.yCm,
      width: element.widthCm,
      length: element.lengthCm,
      type: element.type || 'obstacle',
      label: element.label || 'Elemento fixo'
    }));
}

function windowRestrictions(slot, geometry) {
  return (geometry.windows || []).flatMap(window => {
    if (![window.offsetCm, window.widthCm].every(Number.isFinite)) return [];
    const depth = CLEARANCE_RULES.windowAccessDepthCm;
    const rect = window.wall === 'north'
      ? { x: window.offsetCm, y: 0, width: window.widthCm, length: depth }
      : window.wall === 'south'
        ? { x: window.offsetCm, y: geometry.lengthCm - depth, width: window.widthCm, length: depth }
        : window.wall === 'west'
          ? { x: 0, y: window.offsetCm, width: depth, length: window.widthCm }
          : { x: geometry.widthCm - depth, y: window.offsetCm, width: depth, length: window.widthCm };
    const maxHeight = Number.isFinite(window.sillHeightCm)
      ? window.sillHeightCm
      : Number.isFinite(window.maxAllowedFurnitureHeightCm)
        ? window.maxAllowedFurnitureHeightCm
        : CLEARANCE_RULES.windowLowFurnitureMaxHeightCm;
    const height = slot.preferredHeightCm;
    return height !== null && height !== undefined && height <= maxHeight &&
      window.requiresAccess !== true ? [] : [rect];
  });
}

function positionCandidates(room, item, includeInterior = false) {
  const maxX = room.widthCm - item.width;
  const maxY = room.lengthCm - item.length;
  const xs = includeInterior
    ? [...new Set([0, Math.round(maxX / 2), maxX])]
    : expand(0, maxX, CLEARANCE_RULES.placementStepCm);
  const ys = includeInterior
    ? [...new Set([0, Math.round(maxY / 2), maxY])]
    : expand(0, maxY, CLEARANCE_RULES.placementStepCm);
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

function frontUseZone(candidate, depth) {
  if (!depth) return null;
  if (candidate.y === 0) {
    return { x: candidate.x, y: candidate.y + candidate.length, width: candidate.width, length: depth };
  }
  if (candidate.y + candidate.length >= candidate.roomLength) {
    return { x: candidate.x, y: candidate.y - depth, width: candidate.width, length: depth };
  }
  if (candidate.x === 0) {
    return { x: candidate.x + candidate.width, y: candidate.y, width: depth, length: candidate.length };
  }
  return { x: candidate.x - depth, y: candidate.y, width: depth, length: candidate.length };
}

function sideUseZone(candidate, depth, side) {
  if (!depth) return null;
  if (side === 'south') return {
    x: candidate.x, y: candidate.y + candidate.length, width: candidate.width, length: depth
  };
  if (side === 'north') return {
    x: candidate.x, y: candidate.y - depth, width: candidate.width, length: depth
  };
  if (side === 'east') return {
    x: candidate.x + candidate.width, y: candidate.y, width: depth, length: candidate.length
  };
  return {
    x: candidate.x - depth, y: candidate.y, width: depth, length: candidate.length
  };
}

function bedSideZones(candidate, geometry) {
  const zones = [
    { x: candidate.x - CLEARANCE_RULES.bedSideAccessCm, y: candidate.y,
      width: CLEARANCE_RULES.bedSideAccessCm, length: candidate.length },
    { x: candidate.x + candidate.width, y: candidate.y,
      width: CLEARANCE_RULES.bedSideAccessCm, length: candidate.length }
  ];
  return zones.filter(zone => inside(zone, geometry)).map(zone => ({
    ...zone,
    type: 'desired_access',
    source: 'heuristic',
    confidence: 'low',
    basis: RULE_BASIS
  }));
}

function useZoneDepth(slot) {
  if (slot.category === 'singleBed' || slot.category === 'doubleBed' || slot.category === 'guestBed') {
    return CLEARANCE_RULES.bedFootAccessCm;
  }
  if (slot.category === 'wardrobe' && slot.openingMode === 'sliding') return 0;
  if (slot.category === 'wardrobe' || slot.category === 'refrigerator') {
    return slot.category === 'refrigerator'
      ? CLEARANCE_RULES.frontAccessCm
      : CLEARANCE_RULES.hingedOpeningCm;
  }
  if (slot.category === 'washer') return CLEARANCE_RULES.frontAccessCm;
  if (slot.category === 'sofa') return CLEARANCE_RULES.frontAccessCm;
  if (slot.category === 'desk' || slot.category === 'diningTable') {
    return CLEARANCE_RULES.chairPullbackCm;
  }
  if (slot.category === 'guestSofaBed') return 110;
  return 0;
}

function inside(candidate, geometry) {
  return candidate.x >= 0 && candidate.y >= 0 &&
    candidate.x + candidate.width <= geometry.widthCm &&
    candidate.y + candidate.length <= geometry.lengthCm;
}

function collidesWithPlaced(candidate, placed, groupCandidates = []) {
  const ownZones = candidate.useZones || [];
  const otherZones = placed.flatMap(item => item.useZones || []);
  const placedRectangles = [...placed, ...groupCandidates];
  if (placedRectangles.some(item => rectanglesOverlap(
    candidate, item, CLEARANCE_RULES.furnitureGapCm
  ))) return true;
  if (otherZones.some(zone => rectanglesOverlap(candidate, zone))) return true;
  if (ownZones.some(zone => placedRectangles.some(item => rectanglesOverlap(zone, item)))) return true;
  return ownZones.some(zone => otherZones.some(other => rectanglesOverlap(zone, other)));
}

function canPlace(candidate, geometry, placed, blocked, groupCandidates = []) {
  if (!inside(candidate, geometry) ||
      candidate.useZones?.some(zone => !inside(zone, geometry))) return false;
  if (blocked.some(rectangle => rectanglesOverlap(candidate, rectangle) ||
      candidate.useZones?.some(zone => rectanglesOverlap(zone, rectangle)))) return false;
  const accessible = (zone, occupant = null) =>
    !blocked.some(rectangle => rectanglesOverlap(zone, rectangle)) &&
    !placed.some(item => item !== occupant && (rectanglesOverlap(zone, item) ||
      (item.useZones || []).some(itemZone => rectanglesOverlap(zone, itemZone)))) &&
    !rectanglesOverlap(zone, candidate) &&
    !(candidate.useZones || []).some(useZone => rectanglesOverlap(zone, useZone));
  if (candidate.desiredUseZones?.length &&
      !candidate.desiredUseZones.some(zone => accessible(zone))) return false;
  if (placed.some(item => item.desiredUseZones?.length &&
      !item.desiredUseZones.some(zone => accessible(zone, item)))) return false;
  return !collidesWithPlaced(candidate, placed, groupCandidates);
}

function makePlacement(slot, candidate, geometry) {
  const remainingWidth = candidate.rotated
    ? geometry.lengthCm - candidate.y
    : geometry.widthCm - candidate.x;
  const remainingDepth = candidate.rotated
    ? geometry.widthCm - candidate.x
    : geometry.lengthCm - candidate.y;
  const layoutEnvelope = {
    minWidthCm: slot.minWidthCm,
    maxWidthCm: Math.max(slot.minWidthCm, candidate.width, Math.min(slot.maxWidthCm, remainingWidth)),
    minDepthCm: slot.minDepthCm,
    maxDepthCm: Math.max(slot.minDepthCm, candidate.length, Math.min(slot.maxDepthCm, remainingDepth))
  };
  return {
    ...candidate,
    slotId: slot.id,
    needId: slot.needId,
    name: slot.name,
    category: slot.category,
    groupId: slot.groupId || null,
    isExistingAsset: slot.isExistingAsset === true,
    spatialRole: slot.spatialRole || null,
    priority: slot.priority,
    rotated: !!candidate.rotated,
    catalogEnvelope: { ...slot.catalogEnvelope },
    layoutEnvelope,
    confidence: 'low'
  };
}

function groupCandidate(slot, x, y, width, length, geometry, accessDepth = 0, side = null) {
  const candidate = { x, y, width, length, roomLength: geometry.lengthCm, rotated: false };
  const zone = side ? sideUseZone(candidate, accessDepth, side) : frontUseZone(candidate, accessDepth);
  candidate.useZones = zone ? [zone] : [];
  return { ...candidate, slotId: slot.id, needId: slot.needId };
}

function placeGroupedSlots(groupId, slots, geometry, blocked, placed) {
  const members = slots.filter(slot => slot.groupId === groupId);
  const main = members.find(slot =>
    groupId === 'DiningGroup' ? slot.spatialRole === 'table' : slot.spatialRole === 'desk');
  const dependents = members.filter(slot => slot !== main);
  if (!main) return { placed: [], failed: [] };

  for (const size of sizeOptions(main, geometry)) {
    for (const anchor of positionCandidates(geometry, size, groupId === 'DiningGroup')) {
      const sides = groupId === 'WorkGroup'
        ? ['south', 'north']
        : ['south', 'north', 'east', 'west'];
      for (const side of sides) {
        const group = [groupCandidate(main, anchor.x, anchor.y, size.width, size.length, geometry)];
        let valid = true;
        if (groupId === 'WorkGroup') {
          const seat = dependents.find(item => item.spatialRole === 'work-seat');
          if (seat) {
            const options = sizeOptions(seat, geometry);
            const chair = options[0];
            const x = anchor.x + (size.width - chair.width) / 2;
            const y = side === 'south'
              ? anchor.y + size.length + CLEARANCE_RULES.furnitureGapCm
              : anchor.y - chair.length - CLEARANCE_RULES.furnitureGapCm;
            const candidate = groupCandidate(seat, x, y, chair.width, chair.length, geometry,
              CLEARANCE_RULES.chairPullbackCm, side);
            if (!inside(candidate, geometry)) valid = false;
            else group.push(candidate);
          }
        } else {
          const seats = dependents.flatMap(slot => Array.from(
            { length: Math.max(1, Number(slot.quantity) || 1) },
            (_, index) => ({ slot, index })
          ));
          const horizontal = side === 'north' || side === 'south';
          const span = horizontal ? size.width : size.length;
          const chairSlot = seats[0]?.slot;
          const chairSize = chairSlot && {
            width: chairSlot.idealWidthCm,
            length: chairSlot.idealDepthCm
          };
          if (seats.length && !chairSize) valid = false;
          seats.forEach(({ slot }, index) => {
            if (!valid) return;
            const seatSide = index % 2 === 0 ? side : ({
              north: 'south', south: 'north', east: 'west', west: 'east'
            })[side];
            const seatHorizontal = seatSide === 'north' || seatSide === 'south';
            const sideIndex = Math.floor(index / 2);
            const seatsPerSide = Math.ceil(seats.length / 2);
            const coordinate = span * (sideIndex + 1) / (seatsPerSide + 1);
            const x = seatHorizontal
              ? anchor.x + coordinate - chairSize.width / 2
              : seatSide === 'east'
                ? anchor.x + size.width + CLEARANCE_RULES.furnitureGapCm
                : anchor.x - chairSize.width - CLEARANCE_RULES.furnitureGapCm;
            const y = seatHorizontal
              ? seatSide === 'south'
                ? anchor.y + size.length + CLEARANCE_RULES.furnitureGapCm
                : anchor.y - chairSize.length - CLEARANCE_RULES.furnitureGapCm
              : anchor.y + coordinate - chairSize.length / 2;
            const candidate = groupCandidate(slot, x, y, chairSize.width, chairSize.length,
              geometry, CLEARANCE_RULES.chairPullbackCm, seatSide);
            if (!inside(candidate, geometry) || group.some(item =>
              rectanglesOverlap(candidate, item, 0))) valid = false;
            else group.push(candidate);
          });
        }
        if (!valid || group.some(candidate =>
          !canPlace(candidate, geometry, placed, blocked))) continue;
        const placements = group.map(candidate => {
          const slot = members.find(item => item.id === candidate.slotId);
          return makePlacement(slot, candidate, geometry);
        });
        return { placed: placements, failed: [] };
      }
    }
  }
  return { placed: [], failed: members };
}

function placeSingleSlot(slot, geometry, blocked, placed) {
  const sizes = sizeOptions(slot, geometry);
  const windows = windowRestrictions(slot, geometry);
  const relatedPlacements = slot.groupId
    ? placed.filter(item => item.groupId === slot.groupId)
    : [];
  const distanceToGroup = candidate => relatedPlacements.length
    ? Math.min(...relatedPlacements.map(item =>
      Math.abs(candidate.x - item.x) + Math.abs(candidate.y - item.y)))
    : 0;
  for (const size of sizes) {
    const candidates = positionCandidates(geometry, size)
      .sort((a, b) => distanceToGroup(a) - distanceToGroup(b));
    for (const position of candidates) {
      const candidate = {
        ...position,
        roomLength: geometry.lengthCm,
        rotated: size.rotated,
        useZones: []
      };
      if (['singleBed', 'doubleBed', 'guestBed'].includes(slot.category)) {
        candidate.desiredUseZones = bedSideZones(candidate, geometry);
      }
      const depth = useZoneDepth(slot);
      const zone = frontUseZone(candidate, depth);
      if (zone) candidate.useZones.push(zone);
      if (!canPlace(candidate, geometry, placed, [...blocked, ...windows])) continue;
      return makePlacement(slot, candidate, geometry);
    }
  }
  return null;
}

function missingReason(slot, geometry, blocked) {
  const sizes = sizeOptions(slot, geometry);
  if (!sizes.length) return 'O envelope mínimo não cabe nas dimensões informadas para este ambiente.';
  if (blocked.some(element => element.type === 'circulation')) {
    return 'O corredor de circulação informado não pode ser bloqueado; revise o traçado ou o mobiliário.';
  }
  return 'Não foi encontrado posicionamento com as zonas de uso e circulação livres; revise medidas e prioridades.';
}

function layoutOneRoom(room, slots) {
  const roomSlots = slots.filter(slot => slot.roomId === room.id);
  if (!isValidRoom(room)) {
    return {
      roomId: room.id, widthCm: null, lengthCm: null, placements: [],
      unplaced: roomSlots.map(slot => ({
        slotId: slot.id,
        reason: 'Informe largura e comprimento do ambiente para avaliar o encaixe.'
      })),
      furnitureSlots: roomSlots.map(slot => ({ ...slot, layoutEnvelope: null })),
      valid: false, circulationConflicts: [], confidence: 'low', limitations: [RULE_BASIS]
    };
  }

  const geometry = room.geometry;
  const fixed = fixedRectangles(geometry);
  const blocked = [
    ...fixed,
    ...openingList(geometry).map(door => doorClearance(door, geometry)).filter(Boolean)
  ];
  const placements = [];
  const unplaced = [];
  const processed = new Set();
  const orderedSlots = [...roomSlots].sort((a, b) =>
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    (b.idealWidthCm * b.idealDepthCm) - (a.idealWidthCm * a.idealDepthCm)
  );

  for (const groupId of GROUPS_PLACED_TOGETHER) {
    const result = placeGroupedSlots(groupId, roomSlots, geometry, blocked, placements);
    result.placed.forEach(item => {
      placements.push(item);
      processed.add(item.slotId);
    });
    if (result.failed.length) {
      const reason = missingReason(result.failed[0], geometry, blocked);
      result.failed.forEach(slot => {
        processed.add(slot.id);
        unplaced.push({ slotId: slot.id, reason });
      });
    }
  }

  const television = orderedSlots.find(slot => slot.spatialRole === 'television');
  const sofa = orderedSlots.find(slot => slot.spatialRole === 'sofa');
  orderedSlots.forEach(slot => {
    if (processed.has(slot.id)) return;
    let placement = null;
    if (slot === television && sofa) {
      const sofaPlacement = placements.find(item => item.spatialRole === 'sofa');
      if (sofaPlacement) {
        const opposite = {
          x: sofaPlacement.x,
          y: sofaPlacement.y === 0 ? geometry.lengthCm - slot.idealDepthCm :
            sofaPlacement.y + sofaPlacement.length >= geometry.lengthCm ? 0 : null,
          width: Math.min(slot.idealWidthCm, geometry.widthCm),
          length: slot.idealDepthCm,
          roomLength: geometry.lengthCm,
          useZones: []
        };
        if (opposite.y !== null && canPlace(opposite, geometry, placements, [
          ...blocked, ...windowRestrictions(slot, geometry)
        ])) {
          placement = makePlacement(slot, opposite, geometry);
          placement.viewingRelation = { targetSlotId: sofaPlacement.slotId, confidence: 'low' };
        }
      }
    }
    placement ||= placeSingleSlot(slot, geometry, [
      ...blocked, ...windowRestrictions(slot, geometry)
    ], placements);
    if (placement) {
      placements.push(placement);
      processed.add(slot.id);
    } else {
      unplaced.push({ slotId: slot.id, reason: missingReason(slot, geometry, blocked) });
      processed.add(slot.id);
    }
  });

  const circulationConflicts = placements.filter(placement =>
    fixed.some(element => element.type === 'circulation' &&
      rectanglesOverlap(placement, element))
  ).map(placement => placement.slotId);
  return {
    roomId: room.id,
    widthCm: geometry.widthCm,
    lengthCm: geometry.lengthCm,
    placements,
    unplaced,
    furnitureSlots: roomSlots.map(slot => {
      const placement = placements.find(item => item.slotId === slot.id);
      return { ...slot, layoutEnvelope: placement?.layoutEnvelope || null };
    }),
    circulationConflicts,
    valid: unplaced.length === 0 && circulationConflicts.length === 0,
    constraintMetadata: (geometry.windows || []).map(window => ({
      type: 'window-height-and-access',
      source: Number.isFinite(window.sillHeightCm) ||
        Number.isFinite(window.maxAllowedFurnitureHeightCm) || window.requiresAccess !== undefined
        ? 'user-configured'
        : 'heuristic',
      confidence: 'low',
      basis: RULE_BASIS
    })),
    confidence: 'low',
    limitations: [
      'Acessos, aberturas e zonas de uso são heurísticos e não substituem conferência presencial.',
      RULE_BASIS
    ]
  };
}

export class LayoutEngine {
  static buildFurnitureSlots(needs, rooms = [], existingAssets = []) {
    const suggestedSlots = needs.flatMap(need => {
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
        catalogEnvelope: {
          minWidthCm: dimensions.minWidthCm,
          maxWidthCm: dimensions.maxWidthCm,
          minDepthCm: dimensions.minDepthCm,
          maxDepthCm: dimensions.maxDepthCm
        },
        layoutEnvelope: null,
        availableWidthCm: hasRoomDimensions ? Math.max(roomGeometry.widthCm, roomGeometry.lengthCm) : null,
        availableDepthCm: hasRoomDimensions ? Math.min(roomGeometry.widthCm, roomGeometry.lengthCm) : null,
        preferredHeightCm: dimensions.preferredHeightCm ?? null,
        heightClass: dimensions.heightClass || 'unknown',
        openingMode: dimensions.openingMode || 'unknown',
        orientation: 'wall-aligned',
        requiredClearances: {
          type: 'opening-and-use-clearance',
          doorSwingDepthCm: CLEARANCE_RULES.doorSwingDepthCm,
          furnitureGapCm: CLEARANCE_RULES.furnitureGapCm,
          source: 'heuristic',
          confidence: 'low',
          basis: RULE_BASIS
        },
        usageRules: {
          frontAccessCm: useZoneDepth({ category: need.category, openingMode: dimensions.openingMode }),
          bedSideAccessCm: ['singleBed', 'doubleBed', 'guestBed'].includes(need.category)
            ? CLEARANCE_RULES.bedSideAccessCm
            : null,
          bedSideAccessDesirable: ['singleBed', 'doubleBed', 'guestBed'].includes(need.category),
          bedSideAccessRequired: false,
          source: 'heuristic',
          confidence: 'low',
          basis: RULE_BASIS
        },
        priority: need.priority,
        goalImportance: need.goalImportance,
        needCriticality: need.needCriticality,
        groupId: need.groupId,
        furnitureGroup: need.furnitureGroup,
        spatialRole: need.spatialRole,
        spatialRelation: need.spatialRelation || null,
        styleProfile: need.styleProfile,
        budgetWeight: need.priority === 'essential' ? 3 : need.priority === 'important' ? 2 : 1,
        confidence: need.confidence,
        confidenceReason: RULE_BASIS
      }));
    });
    const existingSlots = existingAssets.filter(asset =>
      asset.confirmed === true && asset.mustReuse === true &&
      asset.dimensionsKnown === true && asset.roomId &&
      Number.isFinite(asset.widthCm) && Number.isFinite(asset.depthCm)
    ).map(asset => ({
      id: `slot-existing-${asset.id}`,
      needId: `existing-${asset.id}`,
      roomId: asset.roomId,
      category: asset.category === 'bed' ? 'doubleBed' : asset.category,
      name: asset.name,
      minWidthCm: asset.widthCm,
      idealWidthCm: asset.widthCm,
      maxWidthCm: asset.widthCm,
      minDepthCm: asset.depthCm,
      idealDepthCm: asset.depthCm,
      maxDepthCm: asset.depthCm,
      catalogEnvelope: {
        minWidthCm: asset.widthCm,
        maxWidthCm: asset.widthCm,
        minDepthCm: asset.depthCm,
        maxDepthCm: asset.depthCm
      },
      layoutEnvelope: null,
      preferredHeightCm: asset.heightCm ?? null,
      openingMode: 'unknown',
      priority: 'optional',
      confidence: 'low',
      confidenceReason: RULE_BASIS,
      isExistingAsset: true
    }));
    return [...suggestedSlots, ...existingSlots];
  }

  static generateLayout(rooms, slots) {
    return rooms.map(room => layoutOneRoom(room, slots));
  }

  static generateAlternatives(rooms, slots, goals = {}) {
    const hasConflictingGoals = goals.homeOffice === 'high' && goals.guestRoom === 'high';
    const secondaryRoom = rooms.find(room => room.type === 'bedroom' &&
      slots.some(slot => slot.roomId === room.id && ['office-desk', 'guest-bed'].includes(slot.needId)));
    if (!hasConflictingGoals || !secondaryRoom) {
      const layouts = this.generateLayout(rooms, slots);
      return [{
        id: 'balanced',
        label: 'Proposta equilibrada',
        tradeoff: 'Sugestões mantidas conforme as prioridades informadas.',
        layouts,
        unplacedCount: layouts.reduce((total, layout) => total + layout.unplaced.length, 0)
      }];
    }

    const officeSlots = slots.filter(slot => slot.needId !== 'guest-bed');
    const hybridSlots = slots.map(slot => slot.needId === 'guest-bed'
      ? {
        ...slot,
        category: 'guestSofaBed',
        minWidthCm: 120, idealWidthCm: 140, maxWidthCm: 180,
        minDepthCm: 75, idealDepthCm: 85, maxDepthCm: 100,
        catalogEnvelope: { minWidthCm: 120, maxWidthCm: 180, minDepthCm: 75, maxDepthCm: 100 },
        preferredHeightCm: 85
      }
      : slot);
    const guestSlots = slots.filter(slot =>
      slot.needId !== 'office-desk' && slot.needId !== 'office-chair');
    return [
      {
        id: 'office-focus',
        label: 'Layout A — foco home office',
        tradeoff: 'Mantém mesa e cadeira de trabalho; remove a cama de hóspedes do segundo quarto.',
        layouts: this.generateLayout(rooms, officeSlots)
      },
      {
        id: 'hybrid-office-guests',
        label: 'Layout B — escritório + hóspedes',
        tradeoff: 'Mantém o posto de trabalho e prevê sofá-cama compacto; exige abrir e liberar a área para dormir.',
        layouts: this.generateLayout(rooms, hybridSlots)
      },
      {
        id: 'guest-focus',
        label: 'Layout C — foco hóspedes',
        tradeoff: 'Mantém a cama de hóspedes; remove a mesa e a cadeira de trabalho do segundo quarto.',
        layouts: this.generateLayout(rooms, guestSlots)
      }
    ].map(alternative => ({
      ...alternative,
      unplacedCount: alternative.layouts.reduce((total, layout) => total + layout.unplaced.length, 0)
    }));
  }
}
