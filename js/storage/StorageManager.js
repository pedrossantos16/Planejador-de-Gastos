import { createDefaultProject } from '../models/types.js';

const STORAGE_KEY = 'meu_ape_planejado_project';

export class StorageManager {
  /**
   * Salva o projeto no LocalStorage.
   */
  static saveProject(project) {
    try {
      project.updatedAt = new Date().toISOString();
      const serialized = JSON.stringify(project);
      localStorage.setItem(STORAGE_KEY, serialized);
      return true;
    } catch (err) {
      console.error('Erro ao salvar projeto localmente:', err);
      return false;
    }
  }

  /**
   * Carrega o projeto do LocalStorage. Se não existir, retorna um projeto padrão.
   */
  static loadProject() {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      if (!data) {
        return createDefaultProject();
      }
      const parsed = JSON.parse(data);
      return this.migrateAndValidateSchema(parsed);
    } catch (err) {
      console.warn('Falha ao ler projeto salvo, carregando padrão:', err);
      return createDefaultProject();
    }
  }

  /**
   * Limpa os dados salvos do LocalStorage.
   */
  static clearProject() {
    try {
      localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (err) {
      return false;
    }
  }

  /**
   * Exporta o projeto como um objeto JSON formatado e inicia o download.
   */
  static exportToJson(project) {
    const exportData = {
      meta: {
        appName: 'Meu Apê Planejado',
        exportDate: new Date().toISOString(),
        version: '1.0'
      },
      project
    };

    const jsonString = JSON.stringify(exportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const link = document.createElement('a');
    link.href = url;
    link.download = `Meu_Ape_Planejado_${sanitizeFileName(project.name)}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  /**
   * Importa e valida um arquivo JSON.
   */
  static importFromJsonText(jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const projectData = parsed.project || parsed;

      if (!projectData.apartment || !projectData.budgetProfile) {
        throw new Error('Formato de arquivo JSON inválido para o projeto.');
      }

      const validatedProject = this.migrateAndValidateSchema(projectData);
      this.saveProject(validatedProject);
      return { success: true, project: validatedProject };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  /**
   * Migra e garante integridade de versão de schema do projeto.
   */
  static migrateAndValidateSchema(project) {
    const defaultProj = createDefaultProject();

    return {
      ...defaultProj,
      ...project,
      apartment: {
        ...defaultProj.apartment,
        ...(project.apartment || {}),
        deliveredItems: {
          ...defaultProj.apartment.deliveredItems,
          ...((project.apartment && project.apartment.deliveredItems) || {})
        }
      },
      budgetProfile: {
        ...defaultProj.budgetProfile,
        ...(project.budgetProfile || {}),
        simplified: {
          ...defaultProj.budgetProfile.simplified,
          ...((project.budgetProfile && project.budgetProfile.simplified) || {})
        },
        detailed: {
          ...defaultProj.budgetProfile.detailed,
          ...((project.budgetProfile && project.budgetProfile.detailed) || {})
        }
      },
      assumptions: {
        ...defaultProj.assumptions,
        ...(project.assumptions || {})
      },
      items: Array.isArray(project.items) ? project.items : [],
      paidHistory: Array.isArray(project.paidHistory) ? project.paidHistory : []
    };
  }
}

function sanitizeFileName(name) {
  return (name || 'projeto').replace(/[^a-zA-Z0-9_-]/g, '_');
}
