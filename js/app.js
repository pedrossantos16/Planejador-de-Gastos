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
import { AcceptanceTests } from './tests/AcceptanceTests.js';

class App {
  constructor() {
    this.project = null;
    this.financialResult = null;
    this.scenarios = null;
    this.recommendation = null;

    this.wizardUI = null;
    this.formsUI = null;
    this.itemsUI = null;
  }

  init() {
    // 1. Carregar projeto salvo ou criar padrão
    this.project = StorageManager.loadProject();

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
    this.bindTestEvents();

    // 5. Cálculo Inicial
    this.recalculateAndRender();
  }

  handleDataChange() {
    this.formsUI.readForms(this.project);
    StorageManager.saveProject(this.project);
    this.recalculateAndRender();
  }

  recalculateAndRender() {
    this.formsUI.readForms(this.project);

    // Executar cálculo financeiro determinístico
    this.financialResult = FinancialEngine.calculate(this.project);

    // Executar simulação de cenários
    this.scenarios = ScenarioEngine.generateScenarios(this.project);

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
        if (val === 'viable') this.loadProjectData(getDemoViableProject());
        else if (val === 'inviable') this.loadProjectData(getDemoInviableProject());
        else if (val === 'incomplete') this.loadProjectData(getDemoIncompleteProject());
        e.target.value = '';
      });
    }

    const btnLoadDemoViable = document.getElementById('btnLoadDemoViable');
    if (btnLoadDemoViable) {
      btnLoadDemoViable.addEventListener('click', () => {
        this.loadProjectData(getDemoViableProject());
        this.wizardUI.goToStep(5);
      });
    }

    // Botão Novo Projeto
    const btnReset = document.getElementById('btnResetProject');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        if (confirm('Deseja iniciar um novo planejamento limpo? Os dados não salvos no LocalStorage serão reiniciados.')) {
          this.loadProjectData(createDefaultProject());
          this.wizardUI.goToStep(1);
        }
      });
    }

    // Botões de Backup / Carregar JSON
    const btnSaveJson = document.getElementById('btnSaveJson');
    if (btnSaveJson) {
      btnSaveJson.addEventListener('click', () => {
        StorageManager.exportToJson(this.project);
      });
    }

    const btnOpenJson = document.getElementById('btnOpenJson');
    const jsonFileInput = document.getElementById('jsonFileInput');
    if (btnOpenJson && jsonFileInput) {
      btnOpenJson.addEventListener('click', () => jsonFileInput.click());
      jsonFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          const res = StorageManager.importFromJsonText(event.target.result);
          if (res.success) {
            alert('Projeto importado com sucesso!');
            this.loadProjectData(res.project);
            this.wizardUI.goToStep(5);
          } else {
            alert('Erro ao importar arquivo JSON: ' + res.error);
          }
        };
        reader.readAsText(file);
      });
    }

    // Título Editável
    const titleText = document.getElementById('appTitleText');
    if (titleText) {
      titleText.addEventListener('blur', () => {
        this.project.name = titleText.innerText.trim() || 'Meu Apê Planejado';
        StorageManager.saveProject(this.project);
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
      btnExportJson.addEventListener('click', () => StorageManager.exportToJson(this.project));
    }
  }

  bindTestEvents() {
    const btnRunTests = document.getElementById('btnRunAcceptanceTests');
    const modal = document.getElementById('testsModal');
    const btnClose = document.getElementById('btnCloseTestsModal');
    const body = document.getElementById('testsResultsBody');

    if (btnRunTests && modal && body) {
      btnRunTests.addEventListener('click', () => {
        const testRunner = new AcceptanceTests();
        const results = testRunner.runAllTests();

        let passCount = results.filter(r => r.passed).length;
        let failCount = results.length - passCount;

        body.innerHTML = `
          <div style="margin-bottom:16px; padding:12px; border-radius:6px; background:${failCount === 0 ? '#dcfce7' : '#fef2f2'}; color:${failCount === 0 ? '#166534' : '#991b1b'};">
            <strong>Resumo da Execução:</strong> ${passCount} de ${results.length} testes passaram. ${failCount > 0 ? `(${failCount} falhas)` : '🎉 100% dos Testes de Aceitação PASSARAM!'}
          </div>

          <table style="width:100%; border-collapse:collapse; font-size:13px;">
            <thead>
              <tr style="background:#f8fafc; border-bottom:2px solid #e2e8f0; text-align:left;">
                <th style="padding:8px;">Teste</th>
                <th style="padding:8px;">Descrição</th>
                <th style="padding:8px;">Resultado</th>
              </tr>
            </thead>
            <tbody>
              ${results.map(r => `
                <tr style="border-bottom:1px solid #e2e8f0;">
                  <td style="padding:8px;"><strong>Teste ${r.id}</strong></td>
                  <td style="padding:8px;">${r.name}<br><small style="color:#64748b;">${r.details}</small></td>
                  <td style="padding:8px;">
                    <span class="badge ${r.passed ? 'badge-viable' : 'badge-danger'}">
                      ${r.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;

        modal.classList.remove('hidden');
      });

      if (btnClose) {
        btnClose.addEventListener('click', () => modal.classList.add('hidden'));
      }
    }
  }

  loadProjectData(newProject) {
    this.project = newProject;
    StorageManager.saveProject(this.project);
    this.formsUI.populateForms(this.project);
    this.itemsUI.setProject(this.project);
    this.recalculateAndRender();
  }
}

// Inicializar a aplicação quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
