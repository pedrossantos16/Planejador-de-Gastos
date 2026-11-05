import { buildExistingAssetCandidates, NeedsEngine } from '../engine/NeedsEngine.js';
import { LayoutEngine } from '../engine/LayoutEngine.js';
import {
  ASSET_CATEGORIES, GOAL_DEFINITIONS, GOAL_IMPORTANCE, NEED_CRITICALITY,
  STYLE_OPTIONS, RULE_BASIS
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
      if (event.target.id === 'styleReferenceFiles') {
        this.loadReferenceImages(event.target.files);
      } else if (event.target.closest('#goalPriorityGrid, #stylePreferences, #purchasePreferences, #existingFurniture, .existing-assets-list, .suggested-needs-list, .room-geometry-card')) {
        this.saveAndRefresh();
      } else if (event.target.id === 'layoutRoomSelect') {
        this.activeRoomId = event.target.value;
        this.renderLayout();
      } else if (event.target.matches('[data-criticality-need]')) {
        this.saveAndRefresh();
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
        this.addFixedElement(target.closest('.room-geometry-card'));
      } else if (plannerAction === 'create-asset-candidates') {
        this.addExistingAssetCandidates();
      } else if (plannerAction === 'remove-existing-asset') {
        target.closest('.existing-asset-card')?.remove();
        this.saveAndRefresh();
        this.renderExistingAssets();
      } else if (plannerAction === 'add-door' || plannerAction === 'add-window') {
        this.addOpening(target.closest('.room-geometry-card'), plannerAction === 'add-door' ? 'doors' : 'windows');
      } else if (plannerAction === 'remove-opening') {
        this.removeGeometryEntry(roomId, target.dataset.openingType, target.closest('.geometry-entry-row'));
      } else if (plannerAction === 'add-fixed-element') {
        this.addFixedElement(target.closest('.room-geometry-card'));
      } else if (plannerAction === 'remove-fixed-element') {
        this.removeGeometryEntry(roomId, 'fixedElements', target.closest('.geometry-entry-row'));
      } else if (plannerAction === 'add-utility-point') {
        this.addUtilityPoint(target.closest('.room-geometry-card'));
      } else if (plannerAction === 'remove-utility-point') {
        this.removeGeometryEntry(roomId, 'utilityPoints', target.closest('.geometry-entry-row'));
      } else if (plannerAction === 'select-layout-alternative') {
        this.selectedAlternativeId = target.dataset.alternativeId;
        this.renderSelectedAlternative();
      } else if (plannerAction === 'remove-obstacle') {
        const room = this.project.apartment.rooms.find(entry => entry.id === roomId);
        if (room) {
          room.geometry.obstacles.splice(Number(obstacleIndex), 1);
          this.saveAndRefresh();
          this.renderObstacles();
        }
      } else if (plannerAction === 'remove-reference-image') {
        this.project.livingProfile.style.referenceImages.splice(Number(target.dataset.imageIndex), 1);
        this.onDataChange?.();
        this.renderReferencePreviews();
      }
    });
  }

  populate(project) {
    this.project = project;
    this.renderGoalControls();
    this.renderStyleControls();
    this.renderRoomGeometry();
    this.renderExistingAssets();
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
    project.apartment.existingAssets = [...this.root.querySelectorAll('.existing-asset-card')].map(card => ({
      id: card.dataset.assetId,
      name: card.querySelector('[data-asset-field="name"]').value.trim(),
      category: card.querySelector('[data-asset-field="category"]').value,
      roomId: card.querySelector('[data-asset-field="roomId"]').value || null,
      widthCm: numberOrNull(card.querySelector('[data-asset-field="widthCm"]').value),
      depthCm: numberOrNull(card.querySelector('[data-asset-field="depthCm"]').value),
      heightCm: numberOrNull(card.querySelector('[data-asset-field="heightCm"]').value),
      dimensionsKnown: card.querySelector('[data-asset-field="dimensionsKnown"]').checked,
      mustReuse: card.querySelector('[data-asset-field="mustReuse"]').checked,
      confirmed: card.querySelector('[data-asset-field="confirmed"]').checked,
      notes: card.querySelector('[data-asset-field="notes"]').value.trim()
    }));
    this.root.querySelectorAll('[data-criticality-need]').forEach(control => {
      project.livingProfile.needCriticalityOverrides[control.dataset.criticalityNeed] = control.value;
    });

    this.root.querySelectorAll('.room-geometry-card').forEach(card => {
      const room = project.apartment.rooms.find(entry => entry.id === card.dataset.roomId);
      if (!room) return;
      const geometry = room.geometry;
      geometry.widthCm = numberOrNull(card.querySelector('[data-geometry="widthCm"]').value);
      geometry.lengthCm = numberOrNull(card.querySelector('[data-geometry="lengthCm"]').value);
      geometry.doors = [...card.querySelectorAll('[data-opening-kind="doors"]')].map(row => ({
        wall: row.querySelector('[data-opening-field="wall"]').value,
        offsetCm: numberOrNull(row.querySelector('[data-opening-field="offsetCm"]').value) ?? 0,
        widthCm: numberOrNull(row.querySelector('[data-opening-field="widthCm"]').value) ?? 80,
        swing: row.querySelector('[data-opening-field="swing"]').value
      }));
      geometry.door = geometry.doors[0] || null;
      geometry.windows = [...card.querySelectorAll('[data-opening-kind="windows"]')].map(row => ({
        wall: row.querySelector('[data-opening-field="wall"]').value,
        offsetCm: numberOrNull(row.querySelector('[data-opening-field="offsetCm"]').value) ?? 0,
        widthCm: numberOrNull(row.querySelector('[data-opening-field="widthCm"]').value) ?? 100,
        sillHeightCm: numberOrNull(row.querySelector('[data-opening-field="sillHeightCm"]').value),
        maxAllowedFurnitureHeightCm: numberOrNull(row.querySelector('[data-opening-field="maxHeightCm"]').value),
        requiresAccess: row.querySelector('[data-opening-field="requiresAccess"]').checked
      }));
      geometry.fixedElements = [...card.querySelectorAll('[data-fixed-element]')].map(row => ({
        type: row.querySelector('[data-fixed-field="type"]').value,
        label: row.querySelector('[data-fixed-field="label"]').value.trim(),
        xCm: numberOrNull(row.querySelector('[data-fixed-field="xCm"]').value),
        yCm: numberOrNull(row.querySelector('[data-fixed-field="yCm"]').value),
        widthCm: numberOrNull(row.querySelector('[data-fixed-field="widthCm"]').value),
        lengthCm: numberOrNull(row.querySelector('[data-fixed-field="lengthCm"]').value),
        heightCm: numberOrNull(row.querySelector('[data-fixed-field="heightCm"]').value),
        blocksPlacement: row.querySelector('[data-fixed-field="blocksPlacement"]').checked
      }));
      geometry.utilityPoints = [...card.querySelectorAll('[data-utility-point]')].map(row => ({
        type: row.querySelector('[data-utility-field="type"]').value,
        label: row.querySelector('[data-utility-field="label"]').value.trim(),
        xCm: numberOrNull(row.querySelector('[data-utility-field="xCm"]').value),
        yCm: numberOrNull(row.querySelector('[data-utility-field="yCm"]').value)
      }));
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
          <summary>Portas, janelas, elementos fixos e pontos técnicos</summary>
          <h5>Portas</h5><div class="door-list"></div>
          <button type="button" class="btn btn-sm btn-outline" data-planner-action="add-door">Adicionar porta</button>
          <h5>Janelas</h5><div class="window-list"></div>
          <button type="button" class="btn btn-sm btn-outline" data-planner-action="add-window">Adicionar janela</button>
          <h5>Elementos fixos e zonas</h5><div class="fixed-element-list"></div>
          <div class="obstacle-entry">
            <input class="form-control" data-fixed-field="label" aria-label="Nome do elemento fixo" placeholder="Bancada, pilar, shaft, equipamento">
            <select class="form-control" data-fixed-field="type">${fixedElementOptions()}</select>
            <input class="form-control" data-fixed-field="xCm" aria-label="Posição X (cm)" type="number" min="0" placeholder="X cm">
            <input class="form-control" data-fixed-field="yCm" aria-label="Posição Y (cm)" type="number" min="0" placeholder="Y cm">
            <input class="form-control" data-fixed-field="widthCm" aria-label="Largura (cm)" type="number" min="1" placeholder="Largura">
            <input class="form-control" data-fixed-field="lengthCm" aria-label="Profundidade (cm)" type="number" min="1" placeholder="Profundidade">
            <input class="form-control" data-fixed-field="heightCm" aria-label="Altura (cm)" type="number" min="1" placeholder="Altura">
            <label class="inline-check"><input type="checkbox" data-fixed-field="blocksPlacement" checked> Bloqueia o piso</label>
            <button type="button" class="btn btn-sm btn-outline" data-planner-action="add-fixed-element">Adicionar elemento</button>
          </div>
          <h5>Pontos hidráulicos, elétricos e gás</h5><div class="utility-point-list"></div>
          <div class="obstacle-entry">
            <input class="form-control" data-utility-field="label" aria-label="Nome do ponto técnico" placeholder="Descrição opcional">
            <select class="form-control" data-utility-field="type">${utilityPointOptions()}</select>
            <input class="form-control" data-utility-field="xCm" aria-label="Posição X do ponto (cm)" type="number" min="0" placeholder="X cm">
            <input class="form-control" data-utility-field="yCm" aria-label="Posição Y do ponto (cm)" type="number" min="0" placeholder="Y cm">
            <button type="button" class="btn btn-sm btn-outline" data-planner-action="add-utility-point">Adicionar ponto</button>
          </div>
        </details>`;
      fragment.appendChild(card);
    });
    container.replaceChildren(fragment);
    this.renderRoomGeometryValues();
  }

  renderRoomGeometryValues() {
    this.project.apartment.rooms.forEach(room => {
      const card = this.root.querySelector(`.room-geometry-card[data-room-id="${cssEscape(room.id)}"]`);
      if (!card) return;
      const geometry = room.geometry || {};
      setValue(card, 'widthCm', geometry.widthCm);
      setValue(card, 'lengthCm', geometry.lengthCm);
      card.querySelector('.door-list').replaceChildren(...(geometry.doors?.length
        ? geometry.doors : geometry.door ? [geometry.door] : []).map((door, index) =>
        openingRow(door, 'doors', index, room.id)));
      card.querySelector('.window-list').replaceChildren(...(geometry.windows || []).map((window, index) =>
        openingRow(window, 'windows', index, room.id)));
      card.querySelector('.fixed-element-list').replaceChildren(...(geometry.fixedElements || []).map((element, index) =>
        fixedElementRow(element, index, room.id)));
      card.querySelector('.utility-point-list').replaceChildren(...(geometry.utilityPoints || []).map((point, index) =>
        utilityPointRow(point, index, room.id)));
    });
  }

  renderObstacles() {
    this.project.apartment.rooms.forEach(room => {
      const card = this.root.querySelector(`.room-geometry-card[data-room-id="${cssEscape(room.id)}"]`);
      const list = card?.querySelector('.fixed-element-list');
      if (!list) return;
      list.replaceChildren(...(room.geometry.fixedElements || []).map((element, index) =>
        fixedElementRow(element, index, room.id)));
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
    const slots = LayoutEngine.buildFurnitureSlots(
      needs, this.project.apartment.rooms, this.project.apartment.existingAssets
    );
    const acceptedNeeds = needs.filter(need =>
      this.project.livingProfile.needOverrides[need.id] !== false);
    const acceptedSlots = slots.filter(slot =>
      this.project.livingProfile.needOverrides[slot.needId] !== false);
    this.alternatives = LayoutEngine.generateAlternatives(
      this.project.apartment.rooms, acceptedSlots, this.project.livingProfile.goals
    );
    if (!this.alternatives.some(alternative => alternative.id === this.selectedAlternativeId)) {
      this.selectedAlternativeId = this.alternatives[0]?.id || null;
    }
    this.renderSuggestions(needs, slots);
    this.renderRoomSelect();
    this.renderSelectedAlternative();
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
    const activeLayouts = this.alternatives?.find(alternative =>
      alternative.id === this.selectedAlternativeId)?.layouts || [];
    needs.forEach(need => {
      const enabled = this.project.livingProfile.needOverrides[need.id] !== false;
      const existing = (this.project.items || []).some(item => item.needId === need.id);
      const slot = slotsByNeed.get(need.id);
      const placement = activeLayouts.flatMap(layout => layout.placements)
        .find(item => item.needId === need.id);
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
      const layoutEnvelope = placement?.layoutEnvelope
        ? ` · envelope deste layout ${placement.layoutEnvelope.minWidthCm}–${placement.layoutEnvelope.maxWidthCm} × ${placement.layoutEnvelope.minDepthCm}–${placement.layoutEnvelope.maxDepthCm} cm`
        : '';
      details.textContent = `${this.roomName(need.roomId)} · Importância informada: ${GOAL_IMPORTANCE[need.goalImportance]?.label || 'Não se aplica'} · ${roomDimensions} · envelope típico da categoria ${slot.minWidthCm}–${slot.maxWidthCm} × ${slot.minDepthCm}–${slot.maxDepthCm} cm${layoutEnvelope}`;
      const reason = document.createElement('p');
      reason.className = 'help-text';
      reason.textContent = need.reason;
      const confidence = document.createElement('p');
      confidence.className = 'confidence-note';
      confidence.textContent = `Confiança baixa — ${RULE_BASIS}`;
      const actions = document.createElement('div');
      actions.className = 'suggestion-actions';
      const criticalityLabel = document.createElement('label');
      criticalityLabel.className = 'criticality-review';
      criticalityLabel.textContent = 'Criticidade para a mudança (revise): ';
      const criticality = document.createElement('select');
      criticality.className = 'form-control';
      criticality.dataset.criticalityNeed = need.id;
      Object.entries(NEED_CRITICALITY).forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        criticality.appendChild(option);
      });
      criticality.value = need.needCriticality;
      criticalityLabel.appendChild(criticality);
      actions.appendChild(criticalityLabel);
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
    (room.geometry.fixedElements?.length ? room.geometry.fixedElements : room.geometry.obstacles || []).forEach(obstacle => {
      svg.appendChild(svgElement('rect', {
        x: obstacle.xCm, y: obstacle.yCm, width: obstacle.widthCm,
        height: obstacle.lengthCm, class: obstacle.type === 'circulation' ? 'svg-circulation' : 'svg-obstacle'
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
    (room.geometry.utilityPoints || []).forEach(point => {
      svg.appendChild(svgElement('circle', {
        cx: point.xCm, cy: point.yCm, r: 6, class: 'svg-utility-point'
      }));
      const text = svgElement('text', {
        x: point.xCm + 8, y: point.yCm - 8, class: 'svg-label'
      });
      text.textContent = shorten(point.label || point.type, 18);
      svg.appendChild(text);
    });
    const doors = room.geometry.doors?.length ? room.geometry.doors :
      room.geometry.door ? [room.geometry.door] : [];
    doors.forEach(door => {
      const zone = doorZone(door, width, length);
      if (zone) svg.appendChild(svgElement('rect', {
        ...zone, class: 'svg-door-zone'
      }));
      const line = wallLine(door.wall, door.offsetCm, door.widthCm, width, length);
      svg.appendChild(svgElement('line', { ...line, class: 'svg-door' }));
    });
    (layout?.placements || []).forEach(placement => {
      (placement.useZones || []).forEach(zone => {
        svg.appendChild(svgElement('rect', {
          x: zone.x, y: zone.y, width: zone.width, height: zone.length,
          class: 'svg-use-zone'
        }));
      });
      (placement.desiredUseZones || []).forEach(zone => {
        svg.appendChild(svgElement('rect', {
          x: zone.x, y: zone.y, width: zone.width, height: zone.length,
          class: 'svg-desired-use-zone'
        }));
      });
      svg.appendChild(svgElement('rect', {
        x: placement.x, y: placement.y, width: placement.width,
        height: placement.length,
        class: `svg-furniture priority-${placement.priority}${placement.isExistingAsset ? ' svg-existing-asset' : ''}`
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
      layout?.valid ? 'Sem conflitos detectados pelas regras heurísticas.' : 'Layout incompleto ou com conflito funcional; não trate como validado.',
      ...(layout?.limitations || [])
    ].filter(Boolean).join(' ');
  }

  renderSelectedAlternative() {
    const selected = this.alternatives?.find(alternative => alternative.id === this.selectedAlternativeId);
    this.layouts = selected?.layouts || [];
    const container = this.root?.querySelector('#layoutAlternatives');
    if (container) {
      container.replaceChildren(...(this.alternatives || []).map(alternative => {
        const card = document.createElement('article');
        card.className = `layout-alternative-card${alternative.id === this.selectedAlternativeId ? ' is-selected' : ''}`;
        const title = document.createElement('h4');
        title.textContent = alternative.label;
        const tradeoff = document.createElement('p');
        tradeoff.textContent = alternative.tradeoff;
        const result = document.createElement('p');
        result.textContent = alternative.unplacedCount
          ? `${alternative.unplacedCount} item(ns) sem encaixe preliminar.`
          : 'Todos os itens considerados tiveram encaixe preliminar.';
        const select = document.createElement('button');
        select.type = 'button';
        select.className = 'btn btn-sm btn-outline';
        select.dataset.plannerAction = 'select-layout-alternative';
        select.dataset.alternativeId = alternative.id;
        select.textContent = alternative.id === this.selectedAlternativeId ? 'Alternativa selecionada' : 'Ver alternativa';
        card.append(title, tradeoff, result, select);
        return card;
      }));
    }
    this.renderLayout();
  }

  renderExistingAssets() {
    const container = this.root?.querySelector('#existingAssetsList');
    if (!container) return;
    const rooms = this.project.apartment.rooms;
    const assets = this.project.apartment.existingAssets || [];
    container.replaceChildren(...assets.map((asset, index) => {
      const card = document.createElement('article');
      card.className = 'existing-asset-card';
      card.dataset.assetId = asset.id;
      const heading = document.createElement('h4');
      heading.textContent = asset.name;
      const name = document.createElement('input');
      name.className = 'form-control';
      name.dataset.assetField = 'name';
      name.value = asset.name;
      name.setAttribute('aria-label', 'Nome do móvel existente');
      const category = document.createElement('select');
      category.className = 'form-control';
      category.dataset.assetField = 'category';
      Object.entries(ASSET_CATEGORIES).forEach(([value, label]) => {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = label;
        category.appendChild(option);
      });
      category.value = asset.category;
      const room = document.createElement('select');
      room.className = 'form-control';
      room.dataset.assetField = 'roomId';
      const anyRoom = document.createElement('option');
      anyRoom.value = '';
      anyRoom.textContent = 'Ambiente não definido';
      room.append(anyRoom, ...rooms.map(entry => {
        const option = document.createElement('option');
        option.value = entry.id;
        option.textContent = entry.name;
        return option;
      }));
      room.value = asset.roomId || '';
      const dimensions = document.createElement('div');
      dimensions.className = 'asset-dimensions';
      for (const [field, label] of [['widthCm', 'Largura'], ['depthCm', 'Profundidade'], ['heightCm', 'Altura']]) {
        const input = document.createElement('input');
        input.className = 'form-control';
        input.type = 'number';
        input.min = '1';
        input.max = '3000';
        input.placeholder = `${label} cm`;
        input.setAttribute('aria-label', `${label} do móvel (cm)`);
        input.dataset.assetField = field;
        input.value = asset[field] ?? '';
        dimensions.appendChild(input);
      }
      const checks = document.createElement('div');
      checks.className = 'asset-checks';
      for (const [field, label] of [
        ['confirmed', 'Confirmo que este móvel existe'],
        ['mustReuse', 'Quero reaproveitar este móvel'],
        ['dimensionsKnown', 'Conheço as medidas']
      ]) {
        const wrapper = document.createElement('label');
        wrapper.className = 'inline-check';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.dataset.assetField = field;
        input.checked = asset[field] === true;
        wrapper.append(input, document.createTextNode(label));
        checks.appendChild(wrapper);
      }
      const notes = document.createElement('textarea');
      notes.className = 'form-control';
      notes.rows = 2;
      notes.placeholder = 'Observações (opcional)';
      notes.dataset.assetField = 'notes';
      notes.value = asset.notes || '';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-sm btn-danger-outline';
      remove.dataset.plannerAction = 'remove-existing-asset';
      remove.dataset.assetIndex = index;
      remove.textContent = 'Remover candidato';
      const confirmation = document.createElement('p');
      confirmation.className = 'help-text';
      confirmation.textContent = asset.confirmed && asset.mustReuse && !asset.dimensionsKnown
        ? 'Confirmado para reaproveitamento. A necessidade compatível será suprimida, mas o móvel não será posicionado até as medidas serem informadas.'
        : asset.confirmed
        ? asset.mustReuse ? 'Confirmado e marcado para reaproveitamento.' : 'Confirmado; não suprime sugestões.'
        : 'Candidato pendente: não suprime nenhuma necessidade até ser confirmado.';
      card.append(heading, name, category, room, dimensions, checks, notes, confirmation, remove);
      return card;
    }));
    const status = this.root.querySelector('#existingAssetStatus');
    if (status) status.textContent = assets.length
      ? `${assets.filter(asset => asset.confirmed).length}/${assets.length} candidato(s) confirmado(s).`
      : 'Nenhum móvel estruturado para confirmação.';
  }

  addExistingAssetCandidates() {
    this.readForms(this.project);
    const text = this.project.apartment.existingFurniture;
    const entryCount = String(text || '').split(/[,;\n]+/).filter(entry => entry.trim()).length;
    const candidates = buildExistingAssetCandidates(text);
    const knownNames = new Set((this.project.apartment.existingAssets || [])
      .map(asset => asset.name.trim().toLowerCase()));
    const added = candidates.filter(asset => !knownNames.has(asset.name.trim().toLowerCase()));
    this.project.apartment.existingAssets.push(...added);
    const status = this.root.querySelector('#existingAssetStatus');
    if (status) status.textContent = added.length
      ? `${added.length} candidato(s) criado(s); ${entryCount - candidates.length} trecho(s) não reconhecido(s) foram ignorado(s). Confirme categoria e reaproveitamento; pendentes não suprimem necessidades.`
      : candidates.length
        ? `${candidates.length} candidato(s) reconhecido(s) já estão na lista; ${entryCount - candidates.length} trecho(s) não reconhecido(s) foram ignorado(s).`
        : `${entryCount} trecho(s) não geraram candidato específico. Ajuste o texto ou cadastre uma categoria reconhecida.`;
    this.renderExistingAssets();
    this.onDataChange?.();
  }

  addOpening(card, kind) {
    if (!card) return;
    const room = this.project.apartment.rooms.find(entry => entry.id === card.dataset.roomId);
    if (!room) return;
    this.readForms(this.project);
    room.geometry[kind].push(kind === 'doors'
      ? { wall: 'south', offsetCm: 0, widthCm: 80, swing: 'inward' }
      : { wall: 'north', offsetCm: 0, widthCm: 100, sillHeightCm: null, requiresAccess: false });
    room.geometry.door = room.geometry.doors[0] || null;
    this.renderRoomGeometryValues();
    if (this.onDataChange) this.onDataChange();
    else this.renderPlan();
  }

  addFixedElement(card) {
    if (!card) return;
    const room = this.project.apartment.rooms.find(entry => entry.id === card.dataset.roomId);
    if (!room) return;
    this.readForms(this.project);
    const read = field => card.querySelector(`[data-fixed-field="${field}"]`);
    const element = {
      label: read('label').value.trim() || 'Elemento fixo',
      type: read('type').value,
      xCm: numberOrNull(read('xCm').value),
      yCm: numberOrNull(read('yCm').value),
      widthCm: numberOrNull(read('widthCm').value),
      lengthCm: numberOrNull(read('lengthCm').value),
      heightCm: numberOrNull(read('heightCm').value),
      blocksPlacement: read('blocksPlacement').checked
    };
    if ([element.xCm, element.yCm, element.widthCm, element.lengthCm].some(value => value === null) ||
        element.widthCm <= 0 || element.lengthCm <= 0 ||
        (room.geometry.widthCm && element.xCm + element.widthCm > room.geometry.widthCm) ||
        (room.geometry.lengthCm && element.yCm + element.lengthCm > room.geometry.lengthCm)) {
      this.showGeometryError(card, 'Informe posição e dimensões válidas dentro do ambiente.');
      return;
    }
    room.geometry.fixedElements.push(element);
    ['label', 'xCm', 'yCm', 'widthCm', 'lengthCm', 'heightCm'].forEach(field => { read(field).value = ''; });
    this.renderRoomGeometryValues();
    if (this.onDataChange) this.onDataChange();
    else this.renderPlan();
  }

  addUtilityPoint(card) {
    if (!card) return;
    const room = this.project.apartment.rooms.find(entry => entry.id === card.dataset.roomId);
    if (!room) return;
    this.readForms(this.project);
    const read = field => card.querySelector(`[data-utility-field="${field}"]`);
    const point = {
      label: read('label').value.trim(),
      type: read('type').value,
      xCm: numberOrNull(read('xCm').value),
      yCm: numberOrNull(read('yCm').value)
    };
    if (point.xCm === null || point.yCm === null ||
        (room.geometry.widthCm && point.xCm > room.geometry.widthCm) ||
        (room.geometry.lengthCm && point.yCm > room.geometry.lengthCm)) {
      this.showGeometryError(card, 'Informe a posição do ponto dentro do ambiente.');
      return;
    }
    room.geometry.utilityPoints.push(point);
    ['label', 'xCm', 'yCm'].forEach(field => { read(field).value = ''; });
    this.renderRoomGeometryValues();
    if (this.onDataChange) this.onDataChange();
    else this.renderPlan();
  }

  removeGeometryEntry(roomId, collection, row) {
    row?.remove();
    this.readForms(this.project);
    const room = this.project.apartment.rooms.find(entry => entry.id === roomId);
    if (!room || !Array.isArray(room.geometry[collection])) return;
    if (collection === 'doors') room.geometry.door = room.geometry.doors[0] || null;
    this.saveAndRefresh();
    this.renderRoomGeometryValues();
  }

  showGeometryError(card, message) {
    let alert = card.querySelector('.obstacle-validation');
    if (!alert) {
      alert = document.createElement('p');
      alert.className = 'obstacle-validation';
      alert.setAttribute('role', 'alert');
      card.querySelector('.geometry-details').appendChild(alert);
    }
    alert.textContent = message;
  }

  roomName(roomId) {
    return this.project.apartment.rooms.find(room => room.id === roomId)?.name || 'Ambiente';
  }
}

function numberField(label, field, value, min, max) {
  return `<div class="form-group"><label>${label}<input class="form-control" data-geometry="${field}" type="number" min="${min}" max="${max}" step="1" value="${value ?? ''}" placeholder="Ex.: 320"></label></div>`;
}

function openingRow(opening, kind, index, roomId) {
  const door = kind === 'doors';
  const row = document.createElement('div');
  row.className = 'geometry-entry-row';
  row.dataset.openingKind = kind;
  row.innerHTML = `
    <label>Parede<select class="form-control" data-opening-field="wall">${wallOptions(opening.wall || (door ? 'south' : 'north'))}</select></label>
    <label>Distância do canto (cm)<input class="form-control" data-opening-field="offsetCm" type="number" min="0" value="${opening.offsetCm ?? 0}"></label>
    <label>Largura (cm)<input class="form-control" data-opening-field="widthCm" type="number" min="1" value="${opening.widthCm ?? (door ? 80 : 100)}"></label>
    ${door
      ? `<label>Abertura<select class="form-control" data-opening-field="swing">
          <option value="inward" ${opening.swing !== 'outward' && opening.swing !== 'none' ? 'selected' : ''}>Para dentro</option>
          <option value="outward" ${opening.swing === 'outward' ? 'selected' : ''}>Para fora</option>
          <option value="none" ${opening.swing === 'none' ? 'selected' : ''}>Sem giro informado</option>
        </select></label>`
      : `<label>Altura do peitoril (cm)<input class="form-control" data-opening-field="sillHeightCm" type="number" min="0" value="${opening.sillHeightCm ?? ''}"></label>
         <label>Altura máxima sob a janela (cm)<input class="form-control" data-opening-field="maxHeightCm" type="number" min="0" value="${opening.maxAllowedFurnitureHeightCm ?? ''}"></label>
         <label class="inline-check"><input type="checkbox" data-opening-field="requiresAccess" ${opening.requiresAccess ? 'checked' : ''}> Preservar acesso</label>`
    }
    <button type="button" class="btn btn-sm btn-danger-outline" data-planner-action="remove-opening"
      data-opening-type="${kind}" data-entry-index="${index}" data-room-id="${escapeAttribute(roomId)}">Remover</button>`;
  return row;
}

function fixedElementRow(element, index, roomId) {
  const row = document.createElement('div');
  row.className = 'geometry-entry-row';
  row.dataset.fixedElement = '';
  row.innerHTML = `
    <input class="form-control" data-fixed-field="label" aria-label="Nome do elemento" value="${escapeAttribute(element.label || '')}">
    <select class="form-control" data-fixed-field="type">${fixedElementOptions(element.type)}</select>
    ${[['xCm', 'X'], ['yCm', 'Y'], ['widthCm', 'Largura'], ['lengthCm', 'Profundidade'], ['heightCm', 'Altura']].map(([field, label]) =>
      `<input class="form-control" data-fixed-field="${field}" type="number" min="${field === 'widthCm' || field === 'lengthCm' ? 1 : 0}" aria-label="${label} (cm)" placeholder="${label} cm" value="${element[field] ?? ''}">`
    ).join('')}
    <label class="inline-check"><input type="checkbox" data-fixed-field="blocksPlacement" ${element.blocksPlacement !== false ? 'checked' : ''}> Bloqueia o piso</label>
    <button type="button" class="btn btn-sm btn-danger-outline" data-planner-action="remove-fixed-element"
      data-entry-index="${index}" data-room-id="${escapeAttribute(roomId)}">Remover</button>`;
  return row;
}

function utilityPointRow(point, index, roomId) {
  const row = document.createElement('div');
  row.className = 'geometry-entry-row';
  row.dataset.utilityPoint = '';
  row.innerHTML = `
    <input class="form-control" data-utility-field="label" aria-label="Descrição do ponto" value="${escapeAttribute(point.label || '')}">
    <select class="form-control" data-utility-field="type">${utilityPointOptions(point.type)}</select>
    <input class="form-control" data-utility-field="xCm" type="number" min="0" aria-label="X do ponto (cm)" value="${point.xCm ?? ''}">
    <input class="form-control" data-utility-field="yCm" type="number" min="0" aria-label="Y do ponto (cm)" value="${point.yCm ?? ''}">
    <button type="button" class="btn btn-sm btn-danger-outline" data-planner-action="remove-utility-point"
      data-entry-index="${index}" data-room-id="${escapeAttribute(roomId)}">Remover</button>`;
  return row;
}

function fixedElementOptions(selected = 'other') {
  const options = [
    ['counter', 'Bancada'], ['pillar', 'Pilar'], ['shaft', 'Shaft'],
    ['fixed_appliance', 'Equipamento fixo'], ['fixed_cabinet', 'Armário fixo'],
    ['circulation', 'Corredor / circulação'], ['other', 'Outro']
  ];
  return options.map(([value, label]) =>
    `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function utilityPointOptions(selected = 'water') {
  const options = [
    ['water', 'Água'], ['drain', 'Esgoto / ralo'], ['electrical', 'Tomada / elétrica'],
    ['gas', 'Gás'], ['other', 'Outro ponto']
  ];
  return options.map(([value, label]) =>
    `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
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
