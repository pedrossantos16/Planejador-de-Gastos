import { STRATEGY_LABELS, PRIORITY_LABELS, SCOPE_LABELS, STATUS_LABELS } from '../models/types.js';
import { parseMoneyToCents, formatCentsToBrl } from '../models/money.js';
import { FinancialEngine } from '../engine/FinancialEngine.js';

export class ItemsUI {
  constructor(project, onItemsChangeCallback) {
    this.project = project;
    this.onItemsChange = onItemsChangeCallback;
    this.activeRoomId = 'all';
    this.initEvents();
  }

  setProject(project) {
    this.project = project;
    this.renderRoomTabs();
    this.renderItemsTable();
  }

  initEvents() {
    // Modal de Item
    const btnAddModal = document.getElementById('btnAddItemModal');
    if (btnAddModal) {
      btnAddModal.addEventListener('click', () => this.openItemModal());
    }

    const btnCloseModal = document.getElementById('btnCloseItemModal');
    const btnCancelModal = document.getElementById('btnCancelModal');
    if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeItemModal());
    if (btnCancelModal) btnCancelModal.addEventListener('click', () => this.closeItemModal());

    const itemForm = document.getElementById('itemForm');
    if (itemForm) {
      itemForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.saveModalItem();
      });
    }
  }

  /**
   * Renderiza as abas de ambientes
   */
  renderRoomTabs() {
    const tabsBar = document.getElementById('roomTabsBar');
    if (!tabsBar) return;

    const rooms = this.project.apartment.rooms || [];

    const fragment = document.createDocumentFragment();
    const allButton = document.createElement('button');
    allButton.type = 'button';
    allButton.className = `room-tab ${this.activeRoomId === 'all' ? 'active' : ''}`;
    allButton.dataset.roomId = 'all';
    allButton.textContent = `🏠 Todos os Ambientes (${(this.project.items || []).length})`;
    fragment.appendChild(allButton);

    rooms.forEach(room => {
      const roomItems = (this.project.items || []).filter(i => i.roomId === room.id);
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = `room-tab ${this.activeRoomId === room.id ? 'active' : ''}`;
      tab.dataset.roomId = room.id;
      tab.textContent = `${room.name} (${roomItems.length})`;
      fragment.appendChild(tab);
    });

    tabsBar.replaceChildren(fragment);

    // Registrar eventos das abas
    tabsBar.querySelectorAll('.room-tab').forEach(tab => {
      tab.addEventListener('click', (e) => {
        this.activeRoomId = e.currentTarget.getAttribute('data-room-id');
        this.renderRoomTabs();
        this.renderItemsTable();
      });
    });
  }

  /**
   * Renderiza a tabela de itens
   */
  renderItemsTable() {
    const tbody = document.getElementById('itemsTableBody');
    if (!tbody) return;

    let items = this.project.items || [];
    if (this.activeRoomId !== 'all') {
      items = items.filter(i => i.roomId === this.activeRoomId);
    }

    if (items.length === 0) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 7;
      cell.style.cssText = 'text-align:center; color:#64748b; padding:24px;';
      cell.textContent = 'Nenhum item cadastrado neste ambiente. Clique em + Adicionar Item acima para incluir.';
      row.appendChild(cell);
      tbody.replaceChildren(row);
      return;
    }

    // Verificar duplicidades de itens
    const duplicateWarnings = this.detectDuplicates(items);

    const fragment = document.createDocumentFragment();
    items.forEach(item => {
      const roomName = this.getRoomName(item.roomId);
      const hasDupWarning = duplicateWarnings[item.id];
      const rawCost = (item.basePriceCents || 0) + (item.shippingCents || 0) +
        (item.assemblyCents || 0) + (item.installationCents || 0) + (item.additionalCostsCents || 0);
      const row = document.createElement('tr');
      const itemCell = document.createElement('td');
      const name = document.createElement('strong');
      name.textContent = item.name;
      itemCell.appendChild(name);
      if (hasDupWarning) {
        const warning = document.createElement('span');
        warning.title = 'Possível duplicidade detectada com pacote completo';
        warning.textContent = ' ⚠️';
        itemCell.appendChild(warning);
      }
      const detail = document.createElement('small');
      detail.style.color = '#64748b';
      detail.textContent = `${roomName} • ${item.specification || 'Sem especificação'}`;
      itemCell.appendChild(document.createElement('br'));
      itemCell.appendChild(detail);
      row.appendChild(itemCell);
      row.appendChild(textCell(STRATEGY_LABELS[item.strategy] || item.strategy));
      const priorityCell = document.createElement('td');
      const priority = document.createElement('span');
      priority.className = `badge badge-${item.priority}`;
      priority.textContent = PRIORITY_LABELS[item.priority] || item.priority;
      priorityCell.appendChild(priority);
      row.appendChild(priorityCell);
      row.appendChild(textCell(SCOPE_LABELS[item.scope] || item.scope));
      row.appendChild(textCell(STATUS_LABELS[item.status] || item.status));
      const costCell = document.createElement('td');
      const cost = document.createElement('strong');
      cost.textContent = item.priceKnown === false ? 'Preço pendente' : `R$ ${formatCentsToBrl(rawCost)}`;
      costCell.appendChild(cost);
      row.appendChild(costCell);
      const actions = document.createElement('td');
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'btn btn-sm btn-outline btn-edit-item';
      edit.dataset.id = item.id;
      edit.textContent = '✏️ Editar';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'btn btn-sm btn-danger-outline btn-del-item';
      remove.dataset.id = item.id;
      remove.setAttribute('aria-label', `Remover ${item.name}`);
      remove.textContent = '🗑️';
      actions.append(edit, remove);
      row.appendChild(actions);
      fragment.appendChild(row);
    });

    tbody.replaceChildren(fragment);

    // Eventos de Editar e Deletar
    tbody.querySelectorAll('.btn-edit-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.currentTarget.getAttribute('data-id');
        this.openItemModal(itemId);
      });
    });

    tbody.querySelectorAll('.btn-del-item').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const itemId = e.currentTarget.getAttribute('data-id');
        this.deleteItem(itemId);
      });
    });
  }

  /**
   * Abre modal para Adicionar ou Editar Item
   */
  openItemModal(itemId = null) {
    const modal = document.getElementById('itemModal');
    const selectRoom = document.getElementById('modalItemRoom');
    if (!modal || !selectRoom) return;

    // População de salas no select
    const rooms = this.project.apartment.rooms || [];
    selectRoom.replaceChildren(...rooms.map(room => {
      const option = document.createElement('option');
      option.value = room.id;
      option.textContent = room.name;
      return option;
    }));

    if (itemId) {
      document.getElementById('itemModalTitle').innerText = 'Editar Item';
      const item = (this.project.items || []).find(i => i.id === itemId);
      if (item) {
        document.getElementById('modalItemId').value = item.id;
        selectRoom.value = item.roomId;
        document.getElementById('modalItemName').value = item.name;
        document.getElementById('modalItemSpec').value = item.specification || '';
        document.getElementById('modalItemPriority').value = item.priority;
        document.getElementById('modalItemScope').value = item.scope;
        document.getElementById('modalItemStrategy').value = item.strategy;
        document.getElementById('modalItemBasePrice').value = formatOptionalMoney(item.basePriceCents);
        document.getElementById('modalItemShipping').value = formatOptionalMoney(item.shippingCents);
        document.getElementById('modalItemInstallation').value = formatOptionalMoney((item.installationCents || 0) + (item.assemblyCents || 0));
        document.getElementById('modalItemDeliveryMonth').value = item.deliveryMonthIndex ?? 35;
        document.getElementById('modalItemStatus').value = item.status;
      }
    } else {
      document.getElementById('itemModalTitle').innerText = 'Cadastrar Novo Item';
      document.getElementById('modalItemId').value = '';
      if (this.activeRoomId !== 'all') selectRoom.value = this.activeRoomId;
      document.getElementById('modalItemName').value = '';
      document.getElementById('modalItemSpec').value = '';
      document.getElementById('modalItemPriority').value = 'essential';
      document.getElementById('modalItemScope').value = 'include';
      document.getElementById('modalItemStrategy').value = 'custom_woodwork';
      document.getElementById('modalItemBasePrice').value = '';
      document.getElementById('modalItemShipping').value = '0,00';
      document.getElementById('modalItemInstallation').value = '0,00';
      document.getElementById('modalItemDeliveryMonth').value = 35;
      document.getElementById('modalItemStatus').value = 'search';
    }

    modal.classList.remove('hidden');
  }

  closeItemModal() {
    const modal = document.getElementById('itemModal');
    if (modal) modal.classList.add('hidden');
  }

  /**
   * Salva o item editado ou novo
   */
  saveModalItem() {
    const itemId = document.getElementById('modalItemId').value;
    const roomId = document.getElementById('modalItemRoom').value;
    const name = document.getElementById('modalItemName').value.trim();

    if (!name) {
      alert('Por favor, informe o nome do item.');
      return;
    }

    const basePriceInput = document.getElementById('modalItemBasePrice').value;
    const basePriceCents = basePriceInput.trim() === '' ? null : parseMoneyToCents(basePriceInput);
    const shippingCents = parseMoneyToCents(document.getElementById('modalItemShipping').value);
    const installationTotalCents = parseMoneyToCents(document.getElementById('modalItemInstallation').value);
    const monthValue = document.getElementById('modalItemDeliveryMonth').value;
    const deliveryMonthIndex = monthValue === '' ? null : Number.parseInt(monthValue, 10);
    if ((basePriceInput.trim() !== '' && basePriceCents === null) ||
        shippingCents === null || installationTotalCents === null ||
        !Number.isInteger(deliveryMonthIndex) || deliveryMonthIndex < 0) {
      alert('Informe valores monetários não negativos e um mês de entrega válido.');
      return;
    }

    const existing = (this.project.items || []).find(item => item.id === itemId);
    if (existing && installationTotalCents < (existing.assemblyCents || 0)) {
      alert('O custo de instalação não pode ser menor que a montagem já registrada.');
      return;
    }
    const itemData = mergeItemEdit(existing, {
      id: itemId || ('item_' + Date.now()),
      roomId,
      name,
      specification: document.getElementById('modalItemSpec').value.trim(),
      priority: document.getElementById('modalItemPriority').value,
      scope: document.getElementById('modalItemScope').value,
      strategy: document.getElementById('modalItemStrategy').value,
      status: document.getElementById('modalItemStatus').value,
      basePriceCents,
      shippingCents,
      installationTotalCents,
      deliveryMonthIndex
    }, this.project.assumptions || {});

    if (itemId) {
      const idx = (this.project.items || []).findIndex(i => i.id === itemId);
      if (idx >= 0) this.project.items[idx] = itemData;
    } else {
      if (!this.project.items) this.project.items = [];
      this.project.items.push(itemData);
    }

    this.closeItemModal();
    this.renderRoomTabs();
    this.renderItemsTable();

    if (this.onItemsChange) this.onItemsChange();
  }

  deleteItem(itemId) {
    const item = (this.project.items || []).find(entry => entry.id === itemId);
    if (!item) return;
    if (['contracted', 'paid_partial', 'bought', 'delivered', 'installed'].includes(item.status)) {
      alert('Este item já tem pagamentos ou obrigações registrados e não pode ser apagado. Edite o escopo para deixá-lo fora das novas compras; os compromissos continuarão no plano.');
      return;
    }
    if (!confirm('Tem certeza que deseja remover este item?')) return;
    this.project.items = (this.project.items || []).filter(i => i.id !== itemId);
    this.renderRoomTabs();
    this.renderItemsTable();
    if (this.onItemsChange) this.onItemsChange();
  }

  detectDuplicates(items) {
    const warnings = {};
    items.forEach(item => {
      const lowerName = item.name.toLowerCase();
      if (lowerName.includes('completo') || lowerName.includes('conjunto') || lowerName.includes('pacote')) {
        items.forEach(other => {
          if (other.id !== item.id && other.roomId === item.roomId) {
            warnings[other.id] = true;
            warnings[item.id] = true;
          }
        });
      }
    });
    return warnings;
  }

  getRoomName(roomId) {
    const r = (this.project.apartment.rooms || []).find(room => room.id === roomId);
    return r ? r.name : 'Ambiente';
  }
}

function formatOptionalMoney(cents) {
  return cents === null || cents === undefined ? '' : formatCentsToBrl(cents);
}

function textCell(text) {
  const cell = document.createElement('td');
  cell.textContent = text ?? '';
  return cell;
}

export function mergeItemEdit(existing, updates, assumptions) {
  const assemblyCents = existing?.assemblyCents || 0;
  const previousInstallationTotal = assemblyCents + (existing?.installationCents || 0);
  const itemData = {
    ...(existing || {}),
    ...updates,
    assemblyCents,
    installationCents: updates.installationTotalCents - assemblyCents,
    additionalCostsCents: existing?.additionalCostsCents || 0,
    confidenceLevel: existing?.confidenceLevel ?? 'preliminary'
  };
  delete itemData.installationTotalCents;

  const costsChanged = !existing ||
    (existing.basePriceCents ?? null) !== updates.basePriceCents ||
    (existing.shippingCents ?? 0) !== updates.shippingCents ||
    previousInstallationTotal !== updates.installationTotalCents;
  if (costsChanged) {
    itemData.payments = FinancialEngine.processItemCost(itemData, assumptions).calculatedPayments;
  }
  return itemData;
}
