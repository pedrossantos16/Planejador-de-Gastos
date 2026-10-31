import { STRATEGY_LABELS, PRIORITY_LABELS, SCOPE_LABELS, STATUS_LABELS } from '../models/types.js';

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

    let html = `
      <button class="room-tab ${this.activeRoomId === 'all' ? 'active' : ''}" data-room-id="all">
        🏠 Todos os Ambientes (${(this.project.items || []).length})
      </button>
    `;

    rooms.forEach(room => {
      const roomItems = (this.project.items || []).filter(i => i.roomId === room.id);
      const isActive = this.activeRoomId === room.id ? 'active' : '';
      html += `
        <button class="room-tab ${isActive}" data-room-id="${room.id}">
          ${room.name} (${roomItems.length})
        </button>
      `;
    });

    tabsBar.innerHTML = html;

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
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; color:#64748b; padding:24px;">
            Nenhum item cadastrado neste ambiente. Clique em <strong>+ Adicionar Item</strong> acima para incluir.
          </td>
        </tr>
      `;
      return;
    }

    // Verificar duplicidades de itens
    const duplicateWarnings = this.detectDuplicates(items);

    let html = '';
    items.forEach(item => {
      const roomName = this.getRoomName(item.roomId);
      const hasDupWarning = duplicateWarnings[item.id];
      const rawCost = (item.basePriceCents || 0) + (item.shippingCents || 0) + (item.assemblyCents || 0) + (item.installationCents || 0) + (item.additionalCostsCents || 0);
      const totalBrl = (rawCost / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

      html += `
        <tr>
          <td>
            <strong>${item.name}</strong> ${hasDupWarning ? '<span title="Possível duplicidade detectada com pacote completo" style="cursor:help;">⚠️</span>' : ''}
            <br><small style="color:#64748b;">${roomName} • ${item.specification || 'Sem especificação'}</small>
          </td>
          <td>${STRATEGY_LABELS[item.strategy] || item.strategy}</td>
          <td><span class="badge badge-${item.priority}">${PRIORITY_LABELS[item.priority] || item.priority}</span></td>
          <td>${SCOPE_LABELS[item.scope] || item.scope}</td>
          <td>${STATUS_LABELS[item.status] || item.status}</td>
          <td><strong>R$ ${totalBrl}</strong></td>
          <td>
            <button class="btn btn-sm btn-outline btn-edit-item" data-id="${item.id}">✏️ Editar</button>
            <button class="btn btn-sm btn-danger-outline btn-del-item" data-id="${item.id}">🗑️</button>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;

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
    selectRoom.innerHTML = rooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');

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
        document.getElementById('modalItemBasePrice').value = formatMoney(item.basePriceCents);
        document.getElementById('modalItemShipping').value = formatMoney(item.shippingCents);
        document.getElementById('modalItemInstallation').value = formatMoney((item.installationCents || 0) + (item.assemblyCents || 0));
        document.getElementById('modalItemDeliveryMonth').value = item.deliveryMonthIndex !== undefined ? item.deliveryMonthIndex : 35;
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
      document.getElementById('modalItemBasePrice').value = '0,00';
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

    const basePriceCents = parseMoney(document.getElementById('modalItemBasePrice').value);
    const shippingCents = parseMoney(document.getElementById('modalItemShipping').value);
    const installationCents = parseMoney(document.getElementById('modalItemInstallation').value);
    const deliveryMonthIndex = parseInt(document.getElementById('modalItemDeliveryMonth').value, 10) || 35;

    const itemData = {
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
      assemblyCents: 0,
      installationCents,
      additionalCostsCents: 0,
      deliveryMonthIndex,
      confidenceLevel: 'medium',
      payments: [{
        amountCents: basePriceCents + shippingCents + installationCents,
        monthIndex: deliveryMonthIndex,
        isPaid: false,
        description: 'Pagamento total',
        isDeposit: false
      }]
    };

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

function parseMoney(str) {
  if (!str) return 0;
  const cleanStr = String(str).replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
  const num = parseFloat(cleanStr);
  return isNaN(num) ? 0 : Math.round(num * 100);
}

function formatMoney(cents) {
  const val = (cents || 0) / 100;
  return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
