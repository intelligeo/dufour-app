/**
 * Project Selector Component
 * 
 * Dropdown per selezionare il progetto QGIS attivo.
 * Carica dinamicamente i layer del progetto selezionato.
 */

import React, { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { projectManager } from '../services/projectManager';
import { qwcApiService } from '../services/qwcApiService';
import { setCurrentProject, setProjects, setThemeConfig } from '../store/store';

const ProjectSelector = () => {
  const dispatch = useDispatch();
  const currentProject = useSelector((state) => state.app.currentProject);
  const projects = useSelector((state) => state.app.projects);
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Carica lista progetti all'avvio
  useEffect(() => {
    loadProjects();
  }, []);

  /**
   * Carica lista di tutti i progetti disponibili
   */
  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const projectsList = await projectManager.listProjects();
      dispatch(setProjects(projectsList));
      
      // Se non c'è progetto corrente e ce ne sono disponibili, carica il primo
      if (!currentProject && projectsList.length > 0) {
        await handleProjectChange(projectsList[0].name);
      }
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Impossibile caricare i progetti');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Gestisce il cambio di progetto
   */
  const handleProjectChange = async (projectName) => {
    if (!projectName || projectName === currentProject) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // 1. Carica dettagli progetto
      const projectDetails = await projectManager.getProject(projectName);
      
      // 2. Carica theme configuration
      const themeConfig = await qwcApiService.getTheme(projectName);
      
      // 3. Aggiorna store
      dispatch(setCurrentProject(projectName));
      dispatch(setThemeConfig(themeConfig));

      console.log(`Project switched to: ${projectName}`, {
        project: projectDetails,
        theme: themeConfig
      });

    } catch (err) {
      console.error(`Error switching to project ${projectName}:`, err);
      setError(`Impossibile caricare il progetto "${projectName}"`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Ricarica lista progetti (dopo upload/delete)
   */
  const handleRefresh = () => {
    loadProjects();
  };

  if (projects.length === 0 && !loading) {
    return (
      <div className="project-selector project-selector--empty">
        <span className="project-selector__label">Nessun progetto</span>
        <button 
          className="project-selector__refresh"
          onClick={handleRefresh}
          title="Ricarica progetti"
        >
          ⟳
        </button>
      </div>
    );
  }

  return (
    <div className="project-selector">
      <label htmlFor="project-select" className="project-selector__label">
        Progetto:
      </label>
      
      <select
        id="project-select"
        className="project-selector__select"
        value={currentProject || ''}
        onChange={(e) => handleProjectChange(e.target.value)}
        disabled={loading || projects.length === 0}
      >
        {!currentProject && (
          <option value="">-- Seleziona progetto --</option>
        )}
        
        {projects.map((project) => (
          <option key={project.name} value={project.name}>
            {project.title || project.name}
          </option>
        ))}
      </select>

      <button
        className="project-selector__refresh"
        onClick={handleRefresh}
        disabled={loading}
        title="Ricarica lista progetti"
      >
        {loading ? '⟳' : '⟳'}
      </button>

      {error && (
        <div className="project-selector__error" title={error}>
          ⚠️
        </div>
      )}

      {loading && (
        <div className="project-selector__loading">
          Caricamento...
        </div>
      )}
    </div>
  );
};

export default ProjectSelector;
