import { StorageManager } from './storage/StorageManager.js';
import { FinancialEngine } from './engine/FinancialEngine.js';
import { ScenarioEngine } from './engine/ScenarioEngine.js';
import { Recommender } from './engine/Recommender.js';
import { WizardUI } from './ui/WizardUI.js';
import { FormsUI } from './ui/FormsUI.js';
import { ItemsUI } from './ui/ItemsUI.js';
import { DashboardUI } from './ui/DashboardUI.js';
import { SensitivityUI } from './ui/SensitivityUI.js';
import { ExcelExporter } from './export/ExcelExporter.js';
import { PdfExporter } from './export/PdfExporter.js';
import { CsvExporter } from './export/CsvExporter.js';
import { getDemoViableProject, getDemoInviableProject, getDemoIncompleteProject } from './models/defaultData.js';
import { createDefaultProject } from './models/types.js';

class App {
  constructor() {
    this.project = null;
    this.financialResult = null;
    this.scenarios = null;
    this.recommendation = null;
    this.isDemo = false;
    this.hasCorruptSavedProject = false;

    this.wizardUI = null;
    this.formsUI = null;
    this.itemsUI = null;
  }

  init() {
    // 1. Carregar projeto salvo ou criar padrão
    try {
      this.project = StorageManager.loadProject();
    } catch (error) {
      console.error(error);
      this.hasCorruptSavedProject = true;
      this.project = createDefaultProject();
      this.setSaveStatus('Projeto salvo inválido; original preservado. Exporte a recuperação antes de continuar.');
      alert(`${error.message}\n\nO projeto original não foi sobrescrito. Você pode exportar o arquivo original para recuperação.`);
      const recoverButton = document.getElementById('btnSaveJson');
      if (recoverButton) recoverButton.title = 'Há um arquivo salvo inválido; a recuperação permanece no armazenamento local.';
    }

    // 2. Inicializar controladores de UI
    this.formsUI = new FormsUI(() => this.handleDataChange());
    this.itemsUI = new ItemsUI(this.project, () => this.handleDataChange());

    this.wizardUI = new WizardUI((stepNum) => {
      if (stepNum === 5) {
        this.recalculateAndRender();
      }
    });

    // 3. População inicial
    this.formsUI.populateForms(this.project);
    this.itemsUI.setProject(this.project);

    // 4. Conectar Eventos da Barra Superior e Exportações
    this.bindHeaderEvents();
    this.bindExportEvents();
    // 5. Cálculo Inicial
    this.recalculateAndRender();
    if (!this.hasCorruptSavedProject) {
      this.setSaveStatus('Pronto — as alterações serão salvas neste dispositivo.');
    }
  }

  handleDataChange() {
    this.formsUI.readForms(this.project);
    if (this.hasCorruptSavedProject) {
      this.setSaveStatus('Salvamento bloqueado: exporte o original ou inicie um novo planejamento com backup.');
    } else if (this.isDemo) {
      this.setSaveStatus('Demonstração fictícia — não salva no seu planejamento.');
    } else {
      const result = StorageManager.saveProject(this.project);
      this.setSaveStatus(result.success ? 'Salvo neste dispositivo' : `Falha ao salvar: ${result.error}`);
    }
    this.recalculateAndRender();
  }

  recalculateAndRender() {
    // Executar cálculo financeiro determinístico
    try {
      this.financialResult = FinancialEngine.calculate(this.project);
      this.financialResult.viability = ScenarioEngine.evaluateViability(this.financialResult, this.project);
    } catch (error) {
      this.setSaveStatus(`Não foi possível calcular: ${error.message}`);
      console.error('Falha ao calcular o planejamento:', error);
      return;
    }

    // Executar simulação de cenários
    this.scenarios = ScenarioEngine.generateScenarios(this.project);
    this.renderDataQualitySummary(this.financialResult);

    // Diagnóstico e Recomendações
    this.recommendation = Recommender.analyze(this.project, this.financialResult, this.scenarios);

    // Renderizar Dashboard na Etapa 5
    DashboardUI.render(this.project, this.financialResult, this.scenarios, this.recommendation);

    const riskContainer = document.getElementById('riskCardContainer');
    if (riskContainer) {
      SensitivityUI.render(riskContainer, this.recommendation.riskAnalysis);
    }
  }

  bindHeaderEvents() {
    // Seletor de Demos
    const demoSelect = document.getElementById('demoSelector');
    if (demoSelect) {
      demoSelect.addEventListener('change', (e) => {
        const val = e.target.value;
        if (val === 'viable') this.loadProjectData(getDemoViableProject(), { persist: false, demo: true });
        else if (val === 'inviable') this.loadProjectData(getDemoInviableProject(), { persist: false, demo: true });
        else if (val === 'incomplete') this.loadProjectData(getDemoIncompleteProject(), { persist: false, demo: true });
        e.target.value = '';
      });
    }

    const btnLoadDemoViable = document.getElementById('btnLoadDemoViable');
    if (btnLoadDemoViable) {
      btnLoadDemoViable.addEventListener('click', () => {
        this.loadProjectData(getDemoViableProject(), { persist: false, demo: true });
        this.wizardUI.goToStep(5);
      });
    }

    // Botão Novo Projeto
    const btnReset = document.getElementById('btnResetProject');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Iniciar um novo planejamento? O projeto atual será baixado como backup antes da substituição.')) {
          if (!this.exportPreviousProjectBackup()) return;
          this.loadProjectData(createDefaultProject(), { persist: true });
          this.wizardUI.goToStep(1);
        }
      });
    }

    // Botões de Backup / Carregar JSON
    const btnSaveJson = document.getElementById('btnSaveJson');
    if (btnSaveJson) {
      btnSaveJson.addEventListener('click', () => {
        this.exportCurrentBackup();
      });
    }

    const btnOpenJson = document.getElementById('btnOpenJson');
    const jsonFileInput = document.getElementById('jsonFileInput');
    if (btnOpenJson && jsonFileInput) {
      btnOpenJson.addEventListener('click', () => jsonFileInput.click());
      jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 5 * 1024 * 1024) {
          alert('O arquivo excede o limite de 5 MB.');
          jsonFileInput.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (event) => {
          const res = StorageManager.importFromJsonText(event.target.result);
          if (res.success) {
            const preview = `Projeto: ${res.project.name}\nItens: ${res.project.items.length}\nData-base: ${res.project.baseDate}\n\nA importação substituirá o planejamento atual. Baixar backup do atual e continuar?`;
            if (confirm(preview)) {
              if (!this.exportPreviousProjectBackup()) return;
              const saved = StorageManager.saveProject(res.project);
              if (!saved.success) {
                alert(`Não foi possível gravar a importação. O projeto atual continua aberto.\n${saved.error}`);
                return;
              }
              this.hasCorruptSavedProject = false;
              this.loadProjectData(res.project, { persist: false });
              this.wizardUI.goToStep(5);
            }
          } else {
            alert('Erro ao importar arquivo JSON: ' + res.error);
          }
          jsonFileInput.value = '';
        };
        reader.onerror = () => {
          alert('Não foi possível ler o arquivo selecionado. O planejamento atual foi mantido.');
          jsonFileInput.value = '';
        };
        reader.readAsText(file);
      });
    }

    // Título Editável
    const titleText = document.getElementById('appTitleText');
    if (titleText) {
      titleText.addEventListener('blur', () => {
        this.project.name = titleText.innerText.trim() || 'Meu Apê Planejado';
        this.handleDataChange();
      });
    }
  }

  bindExportEvents() {
    const btnPdfExec = document.getElementById('btnExportPdfExec');
    if (btnPdfExec) {
      btnPdfExec.addEventListener('click', () => PdfExporter.exportToPdf(this.project, this.financialResult, false));
    }

    const btnPdfDet = document.getElementById('btnExportPdfDet');
    if (btnPdfDet) {
      btnPdfDet.addEventListener('click', () => PdfExporter.exportToPdf(this.project, this.financialResult, true));
    }

    const btnExcel = document.getElementById('btnExportExcel');
    if (btnExcel) {
      btnExcel.addEventListener('click', () => ExcelExporter.exportToExcel(this.project, this.financialResult));
    }

    const btnCsvItems = document.getElementById('btnExportCsvItems');
    if (btnCsvItems) {
      btnCsvItems.addEventListener('click', () => CsvExporter.exportItemsCsv(this.project, this.financialResult));
    }

    const btnCsvLedger = document.getElementById('btnExportCsvLedger');
    if (btnCsvLedger) {
      btnCsvLedger.addEventListener('click', () => CsvExporter.exportLedgerCsv(this.project, this.financialResult));
    }

    const btnExportJson = document.getElementById('btnExportJson');
    if (btnExportJson) {
      btnExportJson.addEventListener('click', () => this.exportCurrentBackup());
    }
  }

  loadProjectData(newProject, { persist = true, demo = false } = {}) {
    if (persist) {
      const saved = StorageManager.saveProject(newProject);
      if (!saved.success) {
        this.setSaveStatus(`Falha ao salvar: ${saved.error}`);
        return;
      }
      this.hasCorruptSavedProject = false;
    }
    this.project = newProject;
    this.isDemo = demo;
    this.formsUI.populateForms(this.project);
    this.itemsUI.setProject(this.project);
    this.setSaveStatus(this.isDemo
      ? 'Demonstração fictícia — seu planejamento salvo foi preservado.'
      : 'Salvo neste dispositivo');
    this.recalculateAndRender();
  }

  setSaveStatus(message) {
    const status = document.getElementById('saveStatus');
    if (status) {
      status.textContent = message;
      status.title = message;
    }
  }

  renderDataQualitySummary(result) {
    const container = document.getElementById('dataQualitySummary');
    if (!container) return;
    const fragment = document.createDocumentFragment();
    const heading = document.createElement('p');
    heading.textContent = result.hasCompleteData
      ? 'Os dados mínimos para esta projeção foram informados. Confira se as estimativas e premissas continuam corretas.'
      : 'Análise preliminar: estas informações ainda são necessárias para concluir a avaliação.';
    fragment.appendChild(heading);
    if (result.viability.missingFieldLabels.length) {
      const list = document.createElement('ul');
      result.viability.missingFieldLabels.forEach(label => {
        const item = document.createElement('li');
        item.textContent = label;
        list.appendChild(item);
      });
      fragment.appendChild(list);
    }
    const base = document.createElement('p');
    base.textContent = `Data-base: ${result.baseDate}. Contingência protegida: R$ ${(result.contingencyProtectedCents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}.`;
    fragment.appendChild(base);
    container.replaceChildren(fragment);
  }

  exportPreviousProjectBackup() {
    try {
      if (this.hasCorruptSavedProject) {
        StorageManager.exportRawBackup();
      } else {
        const savedProject = this.isDemo ? StorageManager.loadProject() : this.project;
        StorageManager.exportToJson(savedProject);
      }
      return true;
    } catch (error) {
      this.setSaveStatus(`Não foi possível gerar o backup: ${error.message}`);
      alert(`Não foi possível gerar o backup. A operação foi cancelada e nenhum dado foi substituído.\n${error.message}`);
      return false;
    }
  }

  exportCurrentBackup() {
    try {
      if (this.hasCorruptSavedProject) StorageManager.exportRawBackup();
      else StorageManager.exportToJson(this.project);
      return true;
    } catch (error) {
      this.setSaveStatus(`Não foi possível exportar o backup: ${error.message}`);
      alert(`Não foi possível exportar o backup.\n${error.message}`);
      return false;
    }
  }
}

// Inicializar a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
