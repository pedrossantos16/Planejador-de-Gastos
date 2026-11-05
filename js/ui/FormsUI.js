import { parseMoneyToCents, formatCentsToBrl } from '../models/money.js';

export class FormsUI {
  constructor(onDataChangeCallback) {
    this.onDataChange = onDataChangeCallback;
    this.isPopulating = false;
    this.initMoneyMasks();
    this.initBudgetModeToggle();
    this.initFormChangeListeners();
  }

  /**
   * Máscara e formatação de valores monetários em tempo de digitação
   */
  initMoneyMasks() {
    document.querySelectorAll('.money-input').forEach(input => {
      input.addEventListener('blur', (e) => {
        const valCents = parseMoneyToCents(e.target.value);
        if (valCents !== null) {
          e.target.value = formatCentsToBrl(valCents);
        }
      });
    });
  }

  initFormChangeListeners() {
    ['formStep1', 'step4'].forEach(id => {
      const form = document.getElementById(id);
      if (!form) return;
      ['input', 'change'].forEach(eventName => {
        form.addEventListener(eventName, () => {
          if (!this.isPopulating && this.onDataChange) this.onDataChange();
        });
      });
    });
  }

  /**
   * Alternador de Modo de Orçamento (Simplificado vs Detalhado)
   */
  initBudgetModeToggle() {
    document.querySelectorAll('input[name="budgetMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        this.setBudgetModeUI(e.target.value);
        if (!this.isPopulating && this.onDataChange) this.onDataChange();
      });
    });
  }

  setBudgetModeUI(mode) {
    const simpForm = document.getElementById('simplifiedBudgetForm');
    const detForm = document.getElementById('detailedBudgetForm');
    document.querySelectorAll('.mode-option').forEach(opt => opt.classList.remove('active'));
    const selected = document.querySelector(`input[name="budgetMode"][value="${mode}"]`);
    if (selected) selected.closest('.mode-option')?.classList.add('active');
    if (simpForm) simpForm.classList.toggle('hidden', mode !== 'simplified');
    if (detForm) detForm.classList.toggle('hidden', mode !== 'detailed');
  }

  /**
   * Popula todos os campos de formulário com dados do objeto `project`
   */
  populateForms(project) {
    if (!project) return;
    this.isPopulating = true;

    // Nome do projeto
    const titleEl = document.getElementById('appTitleText');
    if (titleEl) titleEl.innerText = project.name || 'Meu Apê Planejado';

    // Etapa 1: Apartamento e Datas
    const apt = project.apartment || {};
    this.setVal('cityState', apt.cityState || '');
    this.setVal('approxAreaM2', apt.approxAreaM2 ?? '');
    this.setVal('canStoreEarlyPurchases', apt.canStoreEarlyPurchases || 'unknown');
    this.setVal('memorialNotes', apt.memorialNotes || '');
    this.setVal('residentsCount', apt.residentsCount ?? '');
    this.setCheck('isHomeOffice', !!apt.isHomeOffice);
    this.setCheck('hasChildren', !!apt.hasChildren);
    this.setCheck('hasPets', !!apt.hasPets);
    this.setCheck('accessibilityNeeds', !!apt.accessibilityNeeds);
    this.setVal('keysDate', apt.keysDate || '');
    this.setVal('moveDate', apt.moveDate || '');

    const del = apt.deliveredItems || {};
    this.setCheck('delFlooring', !!del.flooring);
    this.setCheck('delWallTiles', !!del.wallTiles);
    this.setCheck('delCountertops', !!del.countertops);
    this.setCheck('delLighting', !!del.lighting);
    this.setCheck('delSanitary', !!del.sanitary);

    // Etapa 2: Orçamento
    const profile = project.budgetProfile || {};
    const mode = profile.mode || 'simplified';

    const radioMode = document.querySelector(`input[name="budgetMode"][value="${mode}"]`);
    if (radioMode) {
      radioMode.checked = true;
    }
    this.setBudgetModeUI(mode);

    const simp = profile.simplified || {};
    this.setVal('simpInitialBalance', this.formatOptionalMoney(simp.initialBalanceCents));
    this.setVal('simpMonthlyCap', this.formatOptionalMoney(simp.monthlyCapCents));

    const det = profile.detailed || {};
    this.setVal('detInitialBalance', this.formatOptionalMoney(det.initialBalanceCents));
    this.setVal('detMonthlyCap', this.formatOptionalMoney(det.monthlyCapCents));
    this.setVal('detNetIncome', this.formatOptionalMoney(det.netMonthlyIncomeCents));
    this.setVal('detFixedExp', this.formatOptionalMoney(det.fixedLivingExpensesCents));
    this.setVal('detVarExp', this.formatOptionalMoney(det.variableLivingExpensesCents));
    this.setVal('detPropInst', this.formatOptionalMoney(det.propertyInstallmentCents));
    this.setVal('detOtherDebts', this.formatOptionalMoney(det.otherDebtsCents));
    this.setVal('detEmergRes', this.formatOptionalMoney(det.emergencyReserveCents));
    this.setVal('detSafetyMarg', this.formatOptionalMoney(det.safetyMarginCents));
    this.setVal('detPostMoveExpenses', this.formatOptionalMoney(det.postMoveExpensesCents));

    // Etapa 4: Premissas
    const assumptions = project.assumptions || {};
    this.setVal('annualInflation', (assumptions.annualInflationRate ?? 0) * 100);
    this.setCheck('applyInflationUncontracted', !!assumptions.applyInflationToUncontracted);
    this.setVal('contingencyPercent', (assumptions.contingencyPercent ?? 0) * 100);
    this.setVal('contingencyTargetDate', assumptions.contingencyTargetDate || '');
    this.isPopulating = false;
  }

  /**
   * Extrai dados dos formulários e atualiza o objeto `project`
   */
  readForms(project) {
    if (!project) return project;

    const titleEl = document.getElementById('appTitleText');
    if (titleEl) project.name = titleEl.innerText.trim() || 'Meu Apê Planejado';

    // Etapa 1
    project.apartment.cityState = this.getVal('cityState');
    project.apartment.approxAreaM2 = this.getVal('approxAreaM2') === '' ? null : Number(this.getVal('approxAreaM2'));
    project.apartment.canStoreEarlyPurchases = this.getVal('canStoreEarlyPurchases') || 'unknown';
    project.apartment.memorialNotes = this.getVal('memorialNotes');
    project.apartment.residentsCount = this.getVal('residentsCount') === '' ? null : Number.parseInt(this.getVal('residentsCount'), 10);
    project.apartment.isHomeOffice = this.getCheck('isHomeOffice');
    project.apartment.hasChildren = this.getCheck('hasChildren');
    project.apartment.hasPets = this.getCheck('hasPets');
    project.apartment.accessibilityNeeds = this.getCheck('accessibilityNeeds');
    project.apartment.keysDate = this.getVal('keysDate');
    project.apartment.moveDate = this.getVal('moveDate');

    project.apartment.deliveredItems = {
      flooring: this.getCheck('delFlooring'),
      wallTiles: this.getCheck('delWallTiles'),
      countertops: this.getCheck('delCountertops'),
      lighting: this.getCheck('delLighting'),
      sanitary: this.getCheck('delSanitary')
    };

    // Etapa 2
    const selectedMode = document.querySelector('input[name="budgetMode"]:checked');
    project.budgetProfile.mode = selectedMode ? selectedMode.value : 'simplified';

    project.budgetProfile.simplified.initialBalanceCents = parseMoneyToCents(this.getVal('simpInitialBalance'));
    project.budgetProfile.simplified.monthlyCapCents = parseMoneyToCents(this.getVal('simpMonthlyCap'));

    project.budgetProfile.detailed.initialBalanceCents = parseMoneyToCents(this.getVal('detInitialBalance'));
    project.budgetProfile.detailed.monthlyCapCents = parseMoneyToCents(this.getVal('detMonthlyCap'));
    project.budgetProfile.detailed.netMonthlyIncomeCents = parseMoneyToCents(this.getVal('detNetIncome'));
    project.budgetProfile.detailed.fixedLivingExpensesCents = parseMoneyToCents(this.getVal('detFixedExp'));
    project.budgetProfile.detailed.variableLivingExpensesCents = parseMoneyToCents(this.getVal('detVarExp'));
    project.budgetProfile.detailed.propertyInstallmentCents = parseMoneyToCents(this.getVal('detPropInst'));
    project.budgetProfile.detailed.otherDebtsCents = parseMoneyToCents(this.getVal('detOtherDebts'));
    project.budgetProfile.detailed.emergencyReserveCents = parseMoneyToCents(this.getVal('detEmergRes'));
    project.budgetProfile.detailed.safetyMarginCents = parseMoneyToCents(this.getVal('detSafetyMarg'));
    project.budgetProfile.detailed.postMoveExpensesCents = parseMoneyToCents(this.getVal('detPostMoveExpenses'));

    // Etapa 4
    const annualInf = Number(this.getVal('annualInflation')) || 0;
    project.assumptions.annualInflationRate = annualInf / 100;
    project.assumptions.applyInflationToUncontracted = this.getCheck('applyInflationUncontracted');

    const contPct = Number(this.getVal('contingencyPercent')) || 0;
    project.assumptions.contingencyPercent = contPct / 100;
    project.assumptions.contingencyTargetDate = this.getVal('contingencyTargetDate') || '';

    return project;
  }

  // Utilitários de DOM
  getVal(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  }

  setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
  }

  getCheck(id) {
    const el = document.getElementById(id);
    return el ? el.checked : false;
  }

  setCheck(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = checked;
  }

  formatOptionalMoney(cents) {
    return cents === null || cents === undefined ? '' : formatCentsToBrl(cents);
  }
}
