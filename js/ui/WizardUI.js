export class WizardUI {
  constructor(onStepChangeCallback) {
    this.currentStep = 1;
    this.onStepChange = onStepChangeCallback;
    this.initEvents();
  }

  initEvents() {
    // Cliques nas etapas do topo
    document.querySelectorAll('.wizard-step').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const stepNum = parseInt(e.currentTarget.getAttribute('data-step'), 10);
        this.goToStep(stepNum);
      });
    });

    // Botões Próximo / Voltar
    document.querySelectorAll('.btn-next').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const nextStep = parseInt(e.currentTarget.getAttribute('data-next'), 10);
        this.goToStep(nextStep);
      });
    });

    document.querySelectorAll('.btn-prev').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const prevStep = parseInt(e.currentTarget.getAttribute('data-prev'), 10);
        this.goToStep(prevStep);
      });
    });

    // Botão de início do Banner
    const btnStart = document.getElementById('btnStartWizard');
    if (btnStart) {
      btnStart.addEventListener('click', () => {
        document.getElementById('welcomeBanner').classList.add('hidden');
        this.goToStep(1);
      });
    }
  }

  goToStep(stepNum) {
    if (stepNum < 1 || stepNum > 5) return;
    this.currentStep = stepNum;

    // Esconder banner inicial ao navegar
    const welcomeBanner = document.getElementById('welcomeBanner');
    if (welcomeBanner && stepNum > 1) {
      welcomeBanner.classList.add('hidden');
    }

    // Atualizar seções
    document.querySelectorAll('.wizard-section').forEach(sec => sec.classList.remove('active'));
    const targetSection = document.getElementById(`step${stepNum}`);
    if (targetSection) targetSection.classList.add('active');

    // Atualizar indicador de progresso
    document.querySelectorAll('.wizard-step').forEach(btn => {
      const sNum = parseInt(btn.getAttribute('data-step'), 10);
      btn.classList.remove('active');
      if (sNum === stepNum) {
        btn.classList.add('active');
      }
      if (sNum < stepNum) {
        btn.classList.add('completed');
      } else {
        btn.classList.remove('completed');
      }
    });

    // Rolar para o topo suavemente
    window.scrollTo({ top: 0, behavior: 'smooth' });

    if (this.onStepChange) {
      this.onStepChange(stepNum);
    }
  }
}
