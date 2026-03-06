/**
 * Project Manager Service
 * 
 * API client per operazioni su progetti QGIS:
 * - Lista progetti disponibili
 * - Carica dettagli progetto specifico
 * - Upload nuovo progetto da QGIS Desktop
 * - Elimina progetto
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

class ProjectManagerService {
  /**
   * Ottiene lista di tutti i progetti disponibili
   * @returns {Promise<Array>} Array di progetti con metadata
   */
  async listProjects() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch projects: ${response.statusText}`);
      }
      
      const projects = await response.json();
      return projects;
    } catch (error) {
      console.error('Error listing projects:', error);
      throw error;
    }
  }

  /**
   * Ottiene dettagli di un progetto specifico
   * @param {string} projectName - Nome del progetto
   * @returns {Promise<Object>} Dettagli del progetto
   */
  async getProject(projectName) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectName}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Project "${projectName}" not found`);
        }
        throw new Error(`Failed to fetch project: ${response.statusText}`);
      }
      
      const project = await response.json();
      return project;
    } catch (error) {
      console.error(`Error fetching project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Upload nuovo progetto QGIS
   * @param {Object} data - Dati del progetto
   * @param {string} data.name - Nome del progetto (slug)
   * @param {string} data.title - Titolo leggibile
   * @param {string} data.description - Descrizione opzionale
   * @param {File} data.file - File .qgs
   * @returns {Promise<Object>} Risposta con dettagli del progetto creato
   */
  async uploadProject({ name, title, description, file }) {
    try {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('title', title);
      
      if (description) {
        formData.append('description', description);
      }
      
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/api/projects`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error('Error uploading project:', error);
      throw error;
    }
  }

  /**
   * Elimina un progetto
   * @param {string} projectName - Nome del progetto da eliminare
   * @returns {Promise<Object>} Risposta di conferma
   */
  async deleteProject(projectName) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/projects/${projectName}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        if (response.status === 404) {
          throw new Error(`Project "${projectName}" not found`);
        }
        throw new Error(`Failed to delete project: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`Error deleting project ${projectName}:`, error);
      throw error;
    }
  }

  /**
   * Verifica lo stato dell'API
   * @returns {Promise<Object>} Stato servizi (database, QGIS Server)
   */
  async checkStatus() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/status`);
      
      if (!response.ok) {
        throw new Error(`Status check failed: ${response.statusText}`);
      }
      
      const status = await response.json();
      return status;
    } catch (error) {
      console.error('Error checking API status:', error);
      throw error;
    }
  }

  /**
   * Ottiene WMS GetCapabilities URL per un progetto
   * @param {string} projectName - Nome del progetto
   * @returns {string} URL completo per GetCapabilities
   */
  getCapabilitiesUrl(projectName) {
    const qgisServerUrl = import.meta.env.VITE_QGIS_SERVER_URL || 'http://localhost:8080';
    return `${qgisServerUrl}/cgi-bin/qgis_mapserv.fcgi?SERVICE=WMS&REQUEST=GetCapabilities&MAP=/data/projects/${projectName}.qgs`;
  }

  /**
   * Ottiene WMS GetMap URL base per un progetto
   * @param {string} projectName - Nome del progetto
   * @returns {string} URL base per richieste WMS
   */
  getWmsUrl(projectName) {
    const qgisServerUrl = import.meta.env.VITE_QGIS_SERVER_URL || 'http://localhost:8080';
    return `${qgisServerUrl}/cgi-bin/qgis_mapserv.fcgi?MAP=/data/projects/${projectName}.qgs`;
  }
}

// Export singleton instance
export const projectManager = new ProjectManagerService();
export default projectManager;
