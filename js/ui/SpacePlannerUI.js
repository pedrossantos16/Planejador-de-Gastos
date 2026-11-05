import { NeedsEngine } from '../engine/NeedsEngine.js';
import { LayoutEngine } from '../engine/LayoutEngine.js';
import {
  GOAL_DEFINITIONS, GOAL_IMPORTANCE, STYLE_OPTIONS, RULE_BASIS
} from '../models/planningRules.js';

const WALLS = [
  ['north', 'Norte'], ['east', 'Leste'], ['south', 'Sul'], ['west', 'Oeste']
];

export class SpacePlannerUI {
  constructor(project, onDataChange, onAddToBudget) {
    this.project = project;
    this.onDataChange = onDataChange;
    this.onAddToBudget = onAddToBudget;
    this.activeRoomId = null;
    this.root = document.getElementById('residentialPlanner');
    this.initEvents();
  }

  initEvents() {
    if (!this.root) return;
    this.root.addEventListener('input', event => {
      if (!event.target.closest('.room-geometry-card') &&
          event.target.closest('#goalPriorityGrid, #stylePreferences, #purchasePreferences, #existingFurniture')) {
        this.saveAndRefresh();
      }
    });
    this.root.addEventListener('change', event => {
      const isTextEntry = event.target.matches('input[type="text"], textarea');
      if (event.target.id === 'styleReferenceFiles') {
        this.loadReferenceImages(event.target.files);
      } else if (!isTextEntry &&
          event.target.closest('#goalPriorityGrid, #stylePreferences, #purchasePreferences, #existingFurniture, .room-geometry-card')) {
        this.saveAndRefresh();
      } else if (event.target.id === 'layoutRoomSelect') {
        this.activeRoomId = event.target.value;
        this.renderLayout();
      }
    });

    this.root.addEventListener('click', event => {
      const target = event.target.closest('[data-planner-action]');
      if (!target) return;
      const { plannerAction, needId, roomId, obstacleIndex } = target.dataset;
      if (plannerAction === 'toggle-need') {
        const overrides = this.project.livingProfile.needOverrides;
        overrides[needId] = overrides[needId] === false;
        this.saveAndRefresh();
      } else if (plannerAction === 'add-to-budget') {
        const need = NeedsEngine.generateNeeds(this.project).find(item => item.id === needId);
        if (need && this.onAddToBudget) this.onAddToBudget(need);
      } else if (plannerAction === 'add-obstacle') {
        this.addObstacle(target.closest('.room-geometry-card'));
      } else if (plannerAction === 'remove-reference-image') {
        this.project.livingProfile.style.referenceImages.splice(Number(target.dataset.imageIndex), 1);
        this.onDataChange?.();
        this.renderReferencePreviews();
      } else if (plannerAction === 'remove-obstacle') {
        const room = this.project.apartment.rooms.find(entry => entry.id === roomId);
        if (room) {
          room.geometry.obstacles.splice(Number(obstacleIndex), 1);
          this.saveAndRefresh();
          this.renderObstacles();
        }
      }
    });
  }

  populate(project) {
    this.project = project;
    this.renderGoalControls();
    this.renderStyleControls();
    this.renderRoomGeometry();
    this.renderRoomSelect();
    this.renderPlan();
  }

  saveAndRefresh() {
    this.readForms(this.project);
    if (this.onDataChange) this.onDataChange();
    else this.renderPlan();
  }

  readForms(project) {
    if (!project || !this.root) return;
    const profile = project.livingProfile;
    GOAL_DEFINITIONS.forEach(goal => {
      const control = this.root.querySelector(`[data-goal-id="${goal.id}"]`);
      if (control) profile.goals[goal.id] = control.value;
    });

    profile.style.liked = [...this.root.querySelectorAll('[data-style-liked]:checked')]
      .map(input => input.value);
    profile.style.disliked = [...this.root.querySelectorAll('[data-style-disliked]:checked')]
      .map(input => input.value);
    for (const [field, id] of Object.entries({
      colors: 'styleColors',
      avoidColors: 'styleAvoidColors',
      woodTone: 'woodTone',
      density: 'styleDensity',
      furniturePresence: 'furniturePresence',
      lines: 'styleLines',
      uniformity: 'styleUniformity',
      references: 'styleReferences'
    })) {
      const input = this.root.querySelector(`#${id}`);
      if (input) profile.style[field] = input.value.trim();
    }

    for (const [field, id] of Object.entries({
      used: 'buyUsed',
      readyMade: 'buyReadyMade',
      modular: 'buyModular',
      planned: 'buyPlanned',
      durabilityOverPrice: 'buyDurability',
      objective: 'buyObjective'
    })) {
      const input = this.root.querySelector(`#${id}`);
      if (input) profile.purchasing[field] = input.value;
    }
    for (const [field, id] of Object.entries({
      preferredBrands: 'preferredBrands',
      rejectedBrands: 'rejectedBrands'
    })) {
      const input = this.root.querySelector(`#${id}`);
      if (input) profile.purchasing[field] = input.value.trim();
    }
    const existingFurniture = this.root.querySelector('#existingFurniture');
    if (existingFurniture) project.apartment.existingFurniture = existingFurniture.value.trim();

    this.root.querySelectorAll('.room-geometry-card').forEach(card => {
      const room = project.apartment.rooms.find(entry => entry.id === card.dataset.roomId);
      if (!room) return;
      const geometry = room.geometry;
      geometry.widthCm = numberOrNull(card.querySelector('[data-geometry="widthCm"]').value);
      geometry.lengthCm = numberOrNull(card.querySelector('[data-geometry="lengthCm"]').value);
      const hasDoor = card.querySelector('[data-geometry="doorEnabled"]').checked;
      geometry.door = hasDoor ? {
        wall: card.querySelector('[data-geometry="doorWall"]').value,
        offsetCm: numberOrNull(card.querySelector('[data-geometry="doorOffsetCm"]').value) ?? 0,
        widthCm: numberOrNull(card.querySelector('[data-geometry="doorWidthCm"]').value) ?? 80,
        swing: card.querySelector('[data-geometry="doorSwing"]').value
      } : null;
      const hasWindow = card.querySelector('[data-geometry="windowEnabled"]').checked;
      geometry.windows = hasWindow ? [{
        wall: card.querySelector('[data-geometry="windowWall"]').value,
        offsetCm: numberOrNull(card.querySelector('[data-geometry="windowOffsetCm"]').value) ?? 0,
        widthCm: numberOrNull(card.querySelector('[data-geometry="windowWidthCm"]').value) ?? 100
      }] : [];
    });
  }

  renderGoalControls() {
    const container = this.root?.querySelector('#goalPriorityGrid');
    if (!container) return;
    container.replaceChildren(...GOAL_DEFINITIONS.map(goal => {
      const label = document.createElement('label');
      label.className = 'goal-priority-card';
      const title = document.createElement('span');
      title.textContent = goal.label;
      const select = document.createElement('select');
      select.className = 'form-control';
      select.dataset.goalId = goal.id;
      Object.entries(GOAL_IMPORTANCE).forEach(([value, option]) => {
        const choice = document.createElement('option');
        choice.value = value;
        choice.textContent = option.label;
        select.appendChild(choice);
      });
      label.append(title, select);
      return label;
    }));
    GOAL_DEFINITIONS.forEach(goal => {
      const control = container.querySelector(`[data-goal-id="${goal.id}"]`);
      control.value = this.project.livingProfile.goals[goal.id] || 'medium';
    });
  }

  renderStyleControls() {
    const container = this.root?.querySelector('#stylePreferences');
    if (!container) return;
    const profile = this.project.livingProfile.style;
    for (const [field, id, dataAttribute] of [
      ['liked', 'likedStyleCards', 'data-style-liked'],
      ['disliked', 'dislikedStyleCards', 'data-style-disliked']
    ]) {
      const styleCards = container.querySelector(`#${id}`);
      if (!styleCards) continue;
      styleCards.replaceChildren(...STYLE_OPTIONS.map(style => {
        const label = document.createElement('label');
        label.className = 'style-choice-card';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.value = style;
        checkbox.setAttribute(dataAttribute, '');
        checkbox.checked = profile[field].includes(style);
        const sample = document.createElement('span');
        sample.className = `style-swatch style-${style.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
        sample.setAttribute('aria-hidden', 'true');
        const text = document.createElement('span');
        text.textContent = style;
        label.append(checkbox, sample, text);
        return label;
      }));
    }
    const values = {
      styleColors: profile.colors,
      styleAvoidColors: profile.avoidColors,
      woodTone: profile.woodTone,
      styleDensity: profile.density,
      furniturePresence: profile.furniturePresence,
      styleLines: profile.lines,
      styleUniformity: profile.uniformity,
      styleReferences: profile.references
    };
    Object.entries(values).forEach(([id, value]) => {
      const input = container.querySelector(`#${id}`);
      if (input) input.value = value;
    });
    this.renderReferencePreviews();

    const purchasing = this.project.livingProfile.purchasing;
    const purchaseValues = {
      buyUsed: purchasing.used,
      buyReadyMade: purchasing.readyMade,
      buyModular: purchasing.modular,
      buyPlanned: purchasing.planned,
      buyDurability: purchasing.durabilityOverPrice,
      buyObjective: purchasing.objective,
      preferredBrands: purchasing.preferredBrands,
      rejectedBrands: purchasing.rejectedBrands
    };
    Object.entries(purchaseValues).forEach(([id, value]) => {
      const input = this.root.querySelector(`#${id}`);
      if (input) input.value = value;
    });
  }

  renderRoomGeometry() {
    const container = this.root?.querySelector('#roomGeometryList');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    this.project.apartment.rooms.forEach(room => {
      const geometry = room.geometry || {};
      const card = document.createElement('article');
      card.className = 'room-geometry-card';
      card.dataset.roomId = room.id;
      card.innerHTML = `
        <h4>${escapeHtml(room.name)}</h4>
        <div class="form-row">
          ${numberField('Largura (cm)', 'widthCm', geometry.widthCm, 100, 3000)}
          ${numberField('Comprimento (cm)', 'lengthCm', geometry.lengthCm, 100, 3000)}
        </div>
        <details class="geometry-details">
          <summary>Portas, janelas e obstáculos</summary>
          <label class="inline-check"><input type="checkbox" data-geometry="doorEnabled" ${geometry.door ? 'checked' : ''}> Informar porta</label>
          ${openingFields('door', geometry.door, 'south', 80)}
          <label class="inline-check"><input type="checkbox" data-geometry="windowEnabled" ${geometry.windows?.length ? 'checked' : ''}> Informar uma janela</label>
          ${openingFields('window', geometry.windows?.[0], 'north', 100)}
          <div class="obstacle-list">${(geometry.obstacles || []).map((obstacle, index) => `
            <div class="obstacle-row">
              <span>${escapeHtml(obstacle.label)} (${obstacle.xCm}, ${obstacle.yCm}) · ${obstacle.widthCm} × ${obstacle.lengthCm} cm</span>
              <button type="button" class="btn btn-sm btn-danger-outline" data-planner-action="remove-obstacle" data-room-id="${escapeAttribute(room.id)}" data-obstacle-index="${index}">Remover</button>
            </div>`).join('')}
          </div>
          <div class="obstacle-entry">
            <input class="form-control" data-obstacle-field="label" aria-label="Nome do obstáculo" placeholder="Pilar, shaft ou elemento fixo">
            <input class="form-control" data-obstacle-field="xCm" aria-label="Posição X do obstáculo (cm)" type="number" min="0" placeholder="X cm">
            <input class="form-control" data-obstacle-field="yCm" aria-label="Posição Y do obstáculo (cm)" type="number" min="0" placeholder="Y cm">
            <input class="form-control" data-obstacle-field="widthCm" aria-label="Largura do obstáculo (cm)" type="number" min="1" placeholder="Largura">
            <input class="form-control" data-obstacle-field="lengthCm" aria-label="Comprimento do obstáculo (cm)" type="number" min="1" placeholder="Comprimento">
            <button type="button" class="btn btn-sm btn-outline" data-planner-action="add-obstacle">Adicionar obstáculo</button>
          </div>
        </details>`;
      fragment.appendChild(card);
    });
    container.replaceChildren(fragment);
    this.renderRoomGeometryValues();
    this.renderObstacles();
  }

  renderRoomGeometryValues() {
    this.project.apartment.rooms.forEach(room => {
      const card = this.root.querySelector(`.room-geometry-card[data-room-id="${cssEscape(room.id)}"]`);
      if (!card) return;
      const geometry = room.geometry || {};
      setValue(card, 'widthCm', geometry.widthCm);
      setValue(card, 'lengthCm', geometry.lengthCm);
      setCheck(card, 'doorEnabled', !!geometry.door);
      setValue(card, 'doorWall', geometry.door?.wall || 'south');
      setValue(card, 'doorOffsetCm', geometry.door?.offsetCm ?? 0);
      setValue(card, 'doorWidthCm', geometry.door?.widthCm ?? 80);
      setValue(card, 'doorSwing', geometry.door?.swing || 'inward');
      const window = geometry.windows?.[0];
      setCheck(card, 'windowEnabled', !!window);
      setValue(card, 'windowWall', window?.wall || 'north');
      setValue(card, 'windowOffsetCm', window?.offsetCm ?? 0);
      setValue(card, 'windowWidthCm', window?.widthCm ?? 100);
    });
  }

  renderObstacles() {
    this.project.apartment.rooms.forEach(room => {
      const card = this.root.querySelector(`.room-geometry-card[data-room-id="${cssEscape(room.id)}"]`);
      const list = card?.querySelector('.obstacle-list');
      if (!list) return;
      list.replaceChildren(...(room.geometry.obstacles || []).map((obstacle, index) => {
        const row = document.createElement('div');
        row.className = 'obstacle-row';
        const description = document.createElement('span');
        description.textContent = `${obstacle.label} (${obstacle.xCm}, ${obstacle.yCm}) · ${obstacle.widthCm} × ${obstacle.lengthCm} cm`;
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'btn btn-sm btn-danger-outline';
        remove.dataset.plannerAction = 'remove-obstacle';
        remove.dataset.roomId = room.id;
        remove.dataset.obstacleIndex = index;
        remove.textContent = 'Remover';
        row.append(description, remove);
        return row;
      }));
    });
  }

  renderReferencePreviews() {
    const container = this.root?.querySelector('#styleReferencePreviews');
    if (!container) return;
    container.replaceChildren(...(this.project.livingProfile.style.referenceImages || []).map((src, index) => {
      const card = document.createElement('div');
      card.className = 'reference-image-card';
      const image = document.createElement('img');
      image.alt = `Imagem de referência ${index + 1}`;
      image.src = src;
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-sm btn-danger-outline';
      remove.dataset.plannerAction = 'remove-reference-image';
      remove.dataset.imageIndex = index;
      remove.textContent = 'Remover';
      card.append(image, remove);
      return card;
    }));
    const status = this.root.querySelector('#referenceImageStatus');
    if (status) status.textContent = `${container.children.length}/3 imagens locais.`;
  }

  async loadReferenceImages(fileList) {
    const files = [...(fileList || [])];
    const status = this.root.querySelector('#referenceImageStatus');
    const input = this.root.querySelector('#styleReferenceFiles');
    try {
      const existing = this.project.livingProfile.style.referenceImages || [];
      if (existing.length + files.length > 3) {
        throw new Error('Você pode guardar até 3 imagens de referência.');
      }
      if (files.some(file => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) ||
          file.size > 400 * 1024)) {
        throw new Error('Use arquivos PNG, JPG ou WebP de até 400 KB cada.');
      }
      const images = await Promise.all(files.map(readImageFile));
      this.project.livingProfile.style.referenceImages = [...existing, ...images];
      this.onDataChange?.();
      this.renderReferencePreviews();
    } catch (error) {
      if (status) status.textContent = error.message;
      console.error('Não foi possível carregar as imagens de referência:', error);
    } finally {
      if (input) input.value = '';
    }
  }

  renderRoomSelect() {
    const select = this.root?.querySelector('#layoutRoomSelect');
    if (!select) return;
    const rooms = this.project.apartment.rooms;
    if (!rooms.some(room => room.id === this.activeRoomId)) this.activeRoomId = rooms[0]?.id || '';
    select.replaceChildren(...rooms.map(room => {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent = room.name;
      option.selected = room.id === this.activeRoomId;
      return option;
    }));
  }

  renderPlan() {
    if (!this.root) return;
    const needs = NeedsEngine.generateNeeds(this.project);
    const slots = LayoutEngine.buildFurnitureSlots(needs, this.project.apartment.rooms);
    const acceptedNeeds = needs.filter(need =>
      this.project.livingProfile.needOverrides[need.id] !== false);
    const acceptedSlots = slots.filter(slot =>
      this.project.livingProfile.needOverrides[slot.needId] !== false);
    const layouts = LayoutEngine.generateLayout(
      this.project.apartment.rooms, acceptedSlots
    );
    this.renderSuggestions(needs, slots);
    this.layouts = layouts;
    this.renderRoomSelect();
    this.renderLayout();
    const summary = this.root.querySelector('#suggestionSummary');
    if (summary) {
      summary.textContent = acceptedNeeds.length
        ? `${acceptedNeeds.length} necessidade(s) sugerida(s) a partir das suas prioridades. Nenhum produto ou preço foi presumido.`
        : 'Nenhuma necessidade ativa no momento. Ajuste as prioridades ou marque uma sugestão como necessária.';
    }
  }

  renderSuggestions(needs, slots) {
    const container = this.root.querySelector('#suggestedNeedsList');
    if (!container) return;
    if (!needs.length) {
      container.textContent = 'Preencha moradores, ambientes e prioridades para receber sugestões.';
      return;
    }
    const slotsByNeed = new Map(slots.map(slot => [slot.needId, slot]));
    const fragment = document.createDocumentFragment();
    needs.forEach(need => {
      const enabled = this.project.livingProfile.needOverrides[need.id] !== false;
      const existing = (this.project.items || []).some(item => item.needId === need.id);
      const slot = slotsByNeed.get(need.id);
      const room = this.project.apartment.rooms.find(entry => entry.id === need.roomId);
      const card = document.createElement('article');
      card.className = `suggested-need-card${enabled ? '' : ' is-disabled'}`;
      const title = document.createElement('h4');
      title.textContent = need.name;
      const details = document.createElement('p');
      const geometry = room?.geometry;
      const roomDimensions = Number.isFinite(geometry?.widthCm) && Number.isFinite(geometry?.lengthCm)
        ? `medidas do ambiente ${geometry.widthCm} × ${geometry.lengthCm} cm`
        : 'medidas do ambiente ainda não informadas';
      details.textContent = `${this.roomName(need.roomId)} · ${priorityLabel(need.priority)} · ${roomDimensions} · envelope heurístico ${slot.minWidthCm}–${slot.maxWidthCm} × ${slot.minDepthCm}–${slot.maxDepthCm} cm`;
      const reason = document.createElement('p');
      reason.className = 'help-text';
      reason.textContent = need.reason;
      const confidence = document.createElement('p');
      confidence.className = 'confidence-note';
      confidence.textContent = `Confiança baixa — ${RULE_BASIS}`;
      const actions = document.createElement('div');
      actions.className = 'suggestion-actions';
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'btn btn-sm btn-outline';
      toggle.dataset.plannerAction = 'toggle-need';
      toggle.dataset.needId = need.id;
      toggle.textContent = enabled ? 'Não preciso disso' : 'Incluir sugestão';
      actions.appendChild(toggle);
      if (enabled) {
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'btn btn-sm btn-primary';
        add.dataset.plannerAction = 'add-to-budget';
        add.dataset.needId = need.id;
        add.disabled = existing;
        add.textContent = existing ? 'Já está no orçamento' : 'Adicionar ao plano financeiro';
        actions.appendChild(add);
      }
      card.append(title, details, reason, confidence, actions);
      fragment.appendChild(card);
    });
    container.replaceChildren(fragment);
  }

  renderLayout() {
    const svg = this.root?.querySelector('#layoutSvg');
    const status = this.root?.querySelector('#layoutStatus');
    const layout = this.layouts?.find(entry => entry.roomId === this.activeRoomId);
    const room = this.project.apartment.rooms.find(entry => entry.id === this.activeRoomId);
    if (!svg || !status || !room) return;
    svg.replaceChildren();
    const width = room.geometry?.widthCm;
    const length = room.geometry?.lengthCm;
    if (!Number.isFinite(width) || !Number.isFinite(length) || width <= 0 || length <= 0) {
      svg.setAttribute('viewBox', '0 0 640 360');
      const text = svgElement('text', { x: 320, y: 180, 'text-anchor': 'middle', class: 'svg-empty' });
      text.textContent = 'Informe largura e comprimento do ambiente';
      svg.appendChild(text);
      status.textContent = 'Sem geometria suficiente para desenhar este ambiente.';
      return;
    }

    svg.setAttribute('viewBox', `-20 -20 ${width + 40} ${length + 40}`);
    svg.setAttribute('aria-label', `Planta esquemática de ${room.name}, em centímetros`);
    svg.appendChild(svgElement('rect', {
      x: 0, y: 0, width, height: length, class: 'svg-room'
    }));
    (room.geometry.obstacles || []).forEach(obstacle => {
      svg.appendChild(svgElement('rect', {
        x: obstacle.xCm, y: obstacle.yCm, width: obstacle.widthCm,
        height: obstacle.lengthCm, class: 'svg-obstacle'
      }));
      const text = svgElement('text', {
        x: obstacle.xCm + obstacle.widthCm / 2,
        y: obstacle.yCm + obstacle.lengthCm / 2,
        'text-anchor': 'middle', class: 'svg-label'
      });
      text.textContent = obstacle.label;
      svg.appendChild(text);
    });
    (room.geometry.windows || []).forEach(window => {
      const line = wallLine(window.wall, window.offsetCm, window.widthCm, width, length);
      svg.appendChild(svgElement('line', { ...line, class: 'svg-window' }));
    });
    if (room.geometry.door) {
      const door = room.geometry.door;
      const zone = doorZone(door, width, length);
      if (zone) svg.appendChild(svgElement('rect', {
        ...zone, class: 'svg-door-zone'
      }));
      const line = wallLine(door.wall, door.offsetCm, door.widthCm, width, length);
      svg.appendChild(svgElement('line', { ...line, class: 'svg-door' }));
    }
    (layout?.placements || []).forEach(placement => {
      svg.appendChild(svgElement('rect', {
        x: placement.x, y: placement.y, width: placement.width,
        height: placement.length, class: `svg-furniture priority-${placement.priority}`
      }));
      const text = svgElement('text', {
        x: placement.x + placement.width / 2,
        y: placement.y + placement.length / 2,
        'text-anchor': 'middle', class: 'svg-label'
      });
      text.textContent = shorten(placement.name, Math.max(8, placement.width / 8));
      svg.appendChild(text);
    });
    const unplaced = layout?.unplaced || [];
    status.textContent = [
      `${layout?.placements.length || 0} posição(ões) preliminar(es) no desenho.`,
      unplaced.length ? `${unplaced.length} envelope(s) não couberam ou precisam de revisão.` : '',
      ...(layout?.limitations || [])
    ].filter(Boolean).join(' ');
  }

  addObstacle(card) {
    if (!card) return;
    const room = this.project.apartment.rooms.find(entry => entry.id === card.dataset.roomId);
    if (!room) return;
    const read = field => card.querySelector(`[data-obstacle-field="${field}"]`);
    const obstacle = {
      label: read('label').value.trim() || 'Obstáculo',
      xCm: numberOrNull(read('xCm').value),
      yCm: numberOrNull(read('yCm').value),
      widthCm: numberOrNull(read('widthCm').value),
      lengthCm: numberOrNull(read('lengthCm').value)
    };
    const geometry = room.geometry;
    if ([obstacle.xCm, obstacle.yCm, obstacle.widthCm, obstacle.lengthCm].some(value => value === null) ||
        obstacle.widthCm <= 0 || obstacle.lengthCm <= 0 ||
        (geometry.widthCm && obstacle.xCm + obstacle.widthCm > geometry.widthCm) ||
        (geometry.lengthCm && obstacle.yCm + obstacle.lengthCm > geometry.lengthCm)) {
      const message = card.querySelector('.obstacle-validation');
      if (message) message.textContent = 'Informe posição e dimensões válidas dentro do ambiente.';
      else {
        const alert = document.createElement('p');
        alert.className = 'obstacle-validation';
        alert.setAttribute('role', 'alert');
        alert.textContent = 'Informe posição e dimensões válidas dentro do ambiente.';
        card.querySelector('.obstacle-entry').appendChild(alert);
      }
      return;
    }
    geometry.obstacles.push(obstacle);
    this.saveAndRefresh();
    this.renderObstacles();
  }

  roomName(roomId) {
    return this.project.apartment.rooms.find(room => room.id === roomId)?.name || 'Ambiente';
  }
}

function numberField(label, field, value, min, max) {
  return `<div class="form-group"><label>${label}<input class="form-control" data-geometry="${field}" type="number" min="${min}" max="${max}" step="1" value="${value ?? ''}" placeholder="Ex.: 320"></label></div>`;
}

function openingFields(prefix, opening, defaultWall, defaultWidth) {
  const wall = opening?.wall || defaultWall;
  const offset = opening?.offsetCm ?? 0;
  const width = opening?.widthCm ?? defaultWidth;
  return `<div class="opening-fields">
    <label>Parede <select class="form-control" data-geometry="${prefix}Wall">${wallOptions(wall)}</select></label>
    <label>Distância do canto (cm)<input class="form-control" data-geometry="${prefix}OffsetCm" type="number" min="0" value="${offset}"></label>
    <label>Largura (cm)<input class="form-control" data-geometry="${prefix}WidthCm" type="number" min="1" value="${width}"></label>
    ${prefix === 'door' ? `<label>Abertura <select class="form-control" data-geometry="doorSwing"><option value="inward" ${opening?.swing !== 'outward' && opening?.swing !== 'none' ? 'selected' : ''}>Para dentro</option><option value="outward" ${opening?.swing === 'outward' ? 'selected' : ''}>Para fora</option><option value="none" ${opening?.swing === 'none' ? 'selected' : ''}>Sem giro informado</option></select></label>` : ''}
  </div>`;
}

function wallOptions(selected) {
  return WALLS.map(([value, label]) =>
    `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function svgElement(name, attributes) {
  const element = document.createElementNS('http://www.w3.org/2000/svg', name);
  Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value));
  return element;
}

function wallLine(wall, offset, span, width, length) {
  if (wall === 'north') return { x1: offset, y1: 0, x2: offset + span, y2: 0 };
  if (wall === 'south') return { x1: offset, y1: length, x2: offset + span, y2: length };
  if (wall === 'west') return { x1: 0, y1: offset, x2: 0, y2: offset + span };
  return { x1: width, y1: offset, x2: width, y2: offset + span };
}

function doorZone(door, width, length) {
  if (door.swing === 'outward' || door.swing === 'none') return null;
  const depth = 80;
  if (door.wall === 'north') return { x: door.offsetCm, y: 0, width: door.widthCm, height: depth };
  if (door.wall === 'south') return { x: door.offsetCm, y: length - depth, width: door.widthCm, height: depth };
  if (door.wall === 'west') return { x: 0, y: door.offsetCm, width: depth, height: door.widthCm };
  if (door.wall === 'east') return { x: width - depth, y: door.offsetCm, width: depth, height: door.widthCm };
  return null;
}

function numberOrNull(value) {
  if (String(value).trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string' ||
          !/^data:image\/(?:png|jpeg|webp);base64,/.test(reader.result)) {
        reject(new Error(`O arquivo "${file.name}" não pôde ser convertido em imagem.`));
        return;
      }
      resolve(reader.result);
    };
    reader.onerror = () => reject(new Error(`Não foi possível ler o arquivo "${file.name}".`));
    reader.onabort = () => reject(new Error(`A leitura do arquivo "${file.name}" foi cancelada.`));
    reader.readAsDataURL(file);
  });
}

function setValue(card, field, value) {
  const input = card.querySelector(`[data-geometry="${field}"]`);
  if (input) input.value = value ?? '';
}

function setCheck(card, field, checked) {
  const input = card.querySelector(`[data-geometry="${field}"]`);
  if (input) input.checked = checked;
}

function priorityLabel(priority) {
  return ({ essential: 'Alta', important: 'Média', optional: 'Baixa' })[priority] || priority;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function escapeAttribute(value) {
  return escapeHtml(value);
}

function cssEscape(value) {
  return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
}

function shorten(value, limit) {
  const max = Math.max(5, Math.floor(limit));
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
