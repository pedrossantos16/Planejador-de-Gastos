export class FormsUI {
  constructor(onDataChangeCallback) {
    this.onDataChange = onDataChangeCallback;
    this.initMoneyMasks();
    this.initBudgetModeToggle();
  }

  /**
   * Máscara e formatação de valores monetários em tempo de digitação
   */
  initMoneyMasks() {
    document.querySelectorAll('.money-input').forEach(input => {
      input.addEventListener('blur', (e) => {
        const valCents = this.parseMoneyToCents(e.target.value);
        if (valCents > 0 || e.target.value !== '') {
          e.target.value = this.formatCentsToBrl(valCents);
        }
      });
    });
  }

  /**
   * Alternador de Modo de Orçamento (Simplificado vs Detalhado)
   */
  initBudgetModeToggle() {
    document.querySelectorAll('input[name="budgetMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => {
        const mode = e.target.value;
        const simpForm = document.getElementById('simplifiedBudgetForm');
        const detForm = document.getElementById('detailedBudgetForm');

        document.querySelectorAll('.mode-option').forEach(opt => opt.classList.remove('active'));
        e.target.closest('.mode-option').classList.add('active');

        if (mode === 'simplified') {
          simpForm.classList.remove('hidden');
          detForm.classList.add('hidden');
        } else {
          simpForm.classList.add('hidden');
          detForm.classList.remove('hidden');
        }

        if (this.onDataChange) this.onDataChange();
      });
    });
  }

  /**
   * Popula todos os campos de formulário com dados do objeto `project`
   */
  populateForms(project) {
    if (!project) return;

    // Nome do projeto
    const titleEl = document.getElementById('appTitleText');
    if (titleEl) titleEl.innerText = project.name || 'Meu Apê Planejado';

    // Etapa 1: Apartamento e Datas
    const apt = project.apartment || {};
    this.setVal('cityState', apt.cityState || '');
    this.setVal('approxAreaM2', apt.approxAreaM2 || 55);
    this.setVal('residentsCount', apt.residentsCount || 2);
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
      radioMode.dispatchEvent(new Event('change'));
    }

    const simp = profile.simplified || {};
    this.setVal('simpInitialBalance', this.formatCentsToBrl(simp.initialBalanceCents || 0));
    this.setVal('simpMonthlyCap', this.formatCentsToBrl(simp.monthlyCapCents || 0));

    const det = profile.detailed || {};
    this.setVal('detNetIncome', this.formatCentsToBrl(det.netMonthlyIncomeCents || 0));
    this.setVal('detFixedExp', this.formatCentsToBrl(det.fixedLivingExpensesCents || 0));
    this.setVal('detVarExp', this.formatCentsToBrl(det.variableLivingExpensesCents || 0));
    this.setVal('detPropInst', this.formatCentsToBrl(det.propertyInstallmentCents || 0));
    this.setVal('detOtherDebts', this.formatCentsToBrl(det.otherDebtsCents || 0));
    this.setVal('detEmergRes', this.formatCentsToBrl(det.emergencyReserveCents || 0));
    this.setVal('detSafetyMarg', this.formatCentsToBrl(det.safetyMarginCents || 0));

    // Etapa 4: Premissas
    const assumptions = project.assumptions || {};
    this.setVal('annualInflation', (assumptions.annualInflationRate || 0) * 100);
    this.setCheck('applyInflationUncontracted', !!assumptions.applyInflationToUncontracted);
    this.setVal('contingencyPercent', (assumptions.contingencyPercent || 0.05) * 100);
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
    project.apartment.approxAreaM2 = parseFloat(this.getVal('approxAreaM2')) || 55;
    project.apartment.residentsCount = parseInt(this.getVal('residentsCount'), 10) || 2;
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

    project.budgetProfile.simplified.initialBalanceCents = this.parseMoneyToCents(this.getVal('simpInitialBalance'));
    project.budgetProfile.simplified.monthlyCapCents = this.parseMoneyToCents(this.getVal('simpMonthlyCap'));

    project.budgetProfile.detailed.netMonthlyIncomeCents = this.parseMoneyToCents(this.getVal('detNetIncome'));
    project.budgetProfile.detailed.fixedLivingExpensesCents = this.parseMoneyToCents(this.getVal('detFixedExp'));
    project.budgetProfile.detailed.variableLivingExpensesCents = this.parseMoneyToCents(this.getVal('detVarExp'));
    project.budgetProfile.detailed.propertyInstallmentCents = this.parseMoneyToCents(this.getVal('detPropInst'));
    project.budgetProfile.detailed.otherDebtsCents = this.parseMoneyToCents(this.getVal('detOtherDebts'));
    project.budgetProfile.detailed.emergencyReserveCents = this.parseMoneyToCents(this.getVal('detEmergRes'));
    project.budgetProfile.detailed.safetyMarginCents = this.parseMoneyToCents(this.getVal('detSafetyMarg'));

    // Etapa 4
    const annualInf = parseFloat(this.getVal('annualInflation')) || 0;
    project.assumptions.annualInflationRate = annualInf / 100;
    project.assumptions.applyInflationToUncontracted = this.getCheck('applyInflationUncontracted');

    const contPct = parseFloat(this.getVal('contingencyPercent')) || 0;
    project.assumptions.contingencyPercent = contPct / 100;

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

  parseMoneyToCents(str) {
    if (!str) return 0;
    const cleanStr = String(str).replace(/\./g, '').replace(',', '.').replace(/[^0-9.]/g, '');
    const num = parseFloat(cleanStr);
    return isNaN(num) ? 0 : Math.round(num * 100);
  }

  formatCentsToBrl(cents) {
    const val = (cents || 0) / 100;
    return val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}
