/**
 * MilitarySymbolEditor Component
 * Panel for creating and editing military units
 * Now with live NATO symbol preview via milsymbol
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  MilitaryUnit, 
  Affiliations, 
  Status, 
  Echelons, 
  UnitTypes,
  getAffiliationColor 
} from '../services/militarySymbols';
import { getThumbnailSymbol, getSymbolDataURL, validateSIDC } from '../services/symbolService';
import '../styles/panels.css';

const MilitarySymbolEditor = ({ onSave, onCancel, initialUnit = null, mode = 'create' }) => {
  const { t } = useTranslation();
  
  // Form state
  const [unit, setUnit] = useState(() => {
    if (initialUnit) {
      return { ...initialUnit };
    }
    return {
      name: '',
      designation: '',
      affiliation: Affiliations.FRIEND,
      status: Status.PRESENT,
      echelon: Echelons.COMPANY,
      type: UnitTypes.INFANTRY,
      position: null
    };
  });

  const handleChange = (field, value) => {
    setUnit(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Validate
    if (!unit.name.trim()) {
      alert(t('military.errors.nameRequired', 'Unit name is required'));
      return;
    }
    
    if (!unit.position || unit.position.length !== 2) {
      alert(t('military.errors.positionRequired', 'Please click on map to set position'));
      return;
    }
    
    // Create MilitaryUnit instance
    const militaryUnit = new MilitaryUnit(unit);
    onSave(militaryUnit);
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
  };

  return (
    <div className="side-panel military-editor-panel">
      <div className="panel-header">
        <h3>
          {mode === 'create' 
            ? t('military.editor.createUnit', 'Create Military Unit')
            : t('military.editor.editUnit', 'Edit Military Unit')
          }
        </h3>
        <button 
          className="panel-close-btn"
          onClick={handleCancel}
          title={t('common.close', 'Close')}
        >
          ✕
        </button>
      </div>

      <div className="panel-content">
        <form onSubmit={handleSubmit} className="military-editor-form">
          
          {/* Basic Information */}
          <fieldset>
            <legend>{t('military.editor.basicInfo', 'Basic Information')}</legend>
            
            <div className="form-group">
              <label htmlFor="unit-name">
                {t('military.editor.unitName', 'Unit Name')} *
              </label>
              <input
                id="unit-name"
                type="text"
                value={unit.name}
                onChange={(e) => handleChange('name', e.target.value)}
                placeholder={t('military.editor.namePlaceholder', 'e.g., 1st Battalion')}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="unit-designation">
                {t('military.editor.designation', 'Designation')}
              </label>
              <input
                id="unit-designation"
                type="text"
                value={unit.designation}
                onChange={(e) => handleChange('designation', e.target.value)}
                placeholder={t('military.editor.designationPlaceholder', 'e.g., 1/52')}
              />
            </div>
          </fieldset>

          {/* Unit Properties */}
          <fieldset>
            <legend>{t('military.editor.unitProperties', 'Unit Properties')}</legend>
            
            <div className="form-group">
              <label htmlFor="unit-affiliation">
                {t('military.editor.affiliation', 'Affiliation')}
              </label>
              <select
                id="unit-affiliation"
                value={unit.affiliation}
                onChange={(e) => handleChange('affiliation', e.target.value)}
              >
                <option value={Affiliations.FRIEND}>
                  {t('military.affiliation.friend', 'Friend')}
                </option>
                <option value={Affiliations.HOSTILE}>
                  {t('military.affiliation.hostile', 'Hostile')}
                </option>
                <option value={Affiliations.NEUTRAL}>
                  {t('military.affiliation.neutral', 'Neutral')}
                </option>
                <option value={Affiliations.UNKNOWN}>
                  {t('military.affiliation.unknown', 'Unknown')}
                </option>
              </select>
              <div 
                className="affiliation-indicator"
                style={{ 
                  backgroundColor: getAffiliationColor(unit.affiliation),
                  width: '20px',
                  height: '20px',
                  borderRadius: '4px',
                  display: 'inline-block',
                  marginLeft: '10px'
                }}
              />
            </div>

            <div className="form-group">
              <label htmlFor="unit-status">
                {t('military.editor.status', 'Status')}
              </label>
              <select
                id="unit-status"
                value={unit.status}
                onChange={(e) => handleChange('status', e.target.value)}
              >
                <option value={Status.PRESENT}>
                  {t('military.status.present', 'Present')}
                </option>
                <option value={Status.ANTICIPATED}>
                  {t('military.status.anticipated', 'Anticipated')}
                </option>
                <option value={Status.ASSUMED_FRIEND}>
                  {t('military.status.assumedFriend', 'Assumed Friend')}
                </option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="unit-echelon">
                {t('military.editor.echelon', 'Echelon (Size)')}
              </label>
              <select
                id="unit-echelon"
                value={unit.echelon}
                onChange={(e) => handleChange('echelon', e.target.value)}
              >
                <option value={Echelons.TEAM}>
                  {t('military.echelon.team', 'Team')}
                </option>
                <option value={Echelons.SQUAD}>
                  {t('military.echelon.squad', 'Squad')}
                </option>
                <option value={Echelons.SECTION}>
                  {t('military.echelon.section', 'Section')}
                </option>
                <option value={Echelons.PLATOON}>
                  {t('military.echelon.platoon', 'Platoon')}
                </option>
                <option value={Echelons.COMPANY}>
                  {t('military.echelon.company', 'Company')}
                </option>
                <option value={Echelons.BATTALION}>
                  {t('military.echelon.battalion', 'Battalion')}
                </option>
                <option value={Echelons.REGIMENT}>
                  {t('military.echelon.regiment', 'Regiment')}
                </option>
                <option value={Echelons.BRIGADE}>
                  {t('military.echelon.brigade', 'Brigade')}
                </option>
                <option value={Echelons.DIVISION}>
                  {t('military.echelon.division', 'Division')}
                </option>
                <option value={Echelons.CORPS}>
                  {t('military.echelon.corps', 'Corps')}
                </option>
                <option value={Echelons.ARMY}>
                  {t('military.echelon.army', 'Army')}
                </option>
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="unit-type">
                {t('military.editor.unitType', 'Unit Type')}
              </label>
              <select
                id="unit-type"
                value={unit.type}
                onChange={(e) => handleChange('type', e.target.value)}
              >
                <optgroup label={t('military.unitTypes.ground', 'Ground Units')}>
                  <option value={UnitTypes.INFANTRY}>
                    {t('military.unitType.infantry', 'Infantry')}
                  </option>
                  <option value={UnitTypes.ARMOR}>
                    {t('military.unitType.armor', 'Armor')}
                  </option>
                  <option value={UnitTypes.MECHANIZED}>
                    {t('military.unitType.mechanized', 'Mechanized')}
                  </option>
                  <option value={UnitTypes.ARTILLERY}>
                    {t('military.unitType.artillery', 'Artillery')}
                  </option>
                  <option value={UnitTypes.ENGINEER}>
                    {t('military.unitType.engineer', 'Engineer')}
                  </option>
                </optgroup>
                <optgroup label={t('military.unitTypes.special', 'Special Units')}>
                  <option value={UnitTypes.HEADQUARTERS}>
                    {t('military.unitType.headquarters', 'Headquarters')}
                  </option>
                  <option value={UnitTypes.RECON}>
                    {t('military.unitType.reconnaissance', 'Reconnaissance')}
                  </option>
                  <option value={UnitTypes.SPECIAL_FORCES}>
                    {t('military.unitType.specialForces', 'Special Forces')}
                  </option>
                </optgroup>
                <optgroup label={t('military.unitTypes.support', 'Support Units')}>
                  <option value={UnitTypes.SIGNAL}>
                    {t('military.unitType.signal', 'Signal')}
                  </option>
                  <option value={UnitTypes.LOGISTICS}>
                    {t('military.unitType.logistics', 'Logistics')}
                  </option>
                  <option value={UnitTypes.MEDICAL}>
                    {t('military.unitType.medical', 'Medical')}
                  </option>
                  <option value={UnitTypes.MAINTENANCE}>
                    {t('military.unitType.maintenance', 'Maintenance')}
                  </option>
                  <option value={UnitTypes.TRANSPORT}>
                    {t('military.unitType.transport', 'Transport')}
                  </option>
                  <option value={UnitTypes.SUPPLY}>
                    {t('military.unitType.supply', 'Supply')}
                  </option>
                </optgroup>
              </select>
            </div>
          </fieldset>

          {/* Position */}
          <fieldset>
            <legend>{t('military.editor.position', 'Position')}</legend>
            
            <div className="form-group">
              <div className="position-info">
                {unit.position ? (
                  <div>
                    <strong>{t('military.editor.coordinates', 'Coordinates')}:</strong>
                    <br />
                    <code>
                      {unit.position[1].toFixed(6)}°N, {unit.position[0].toFixed(6)}°E
                    </code>
                  </div>
                ) : (
                  <div className="info-message">
                    <span>ℹ️</span> {t('military.editor.clickMapToSetPosition', 'Click on map to set unit position')}
                  </div>
                )}
              </div>
            </div>
          </fieldset>

          {/* SIDC Preview — live rendered NATO symbol */}
          {(() => {
            const tempUnit = new MilitaryUnit(unit);
            const sidc = tempUnit.generateSIDC();
            const validation = validateSIDC(sidc);
            const previewDataUrl = validation.valid
              ? getSymbolDataURL(sidc, { size: 80 }, 'svg')
              : null;

            return (
              <fieldset>
                <legend>{t('military.editor.symbolPreview', 'Symbol Preview')}</legend>
                <div className="form-group" style={{ textAlign: 'center' }}>
                  {previewDataUrl ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                      <img 
                        src={previewDataUrl} 
                        alt="NATO Symbol Preview"
                        style={{ maxHeight: '120px', imageRendering: 'auto' }}
                      />
                      <code className="sidc-code" style={{ fontSize: '11px', letterSpacing: '1px' }}>
                        {sidc}
                      </code>
                      <small className="help-text" style={{ color: '#27ae60' }}>
                        ✓ {validation.message} ({validation.format?.toUpperCase()})
                      </small>
                    </div>
                  ) : (
                    <div style={{ padding: '16px', color: '#888' }}>
                      <code className="sidc-code">{sidc || '—'}</code>
                      <small className="help-text" style={{ color: '#e74c3c' }}>
                        ⚠ {validation.message}
                      </small>
                    </div>
                  )}
                </div>
              </fieldset>
            );
          })()}

          {/* Actions */}
          <div className="form-actions">
            <button 
              type="submit" 
              className="btn btn-primary"
            >
              {mode === 'create' 
                ? t('military.editor.createButton', 'Create Unit')
                : t('military.editor.updateButton', 'Update Unit')
              }
            </button>
            <button 
              type="button" 
              className="btn btn-secondary"
              onClick={handleCancel}
            >
              {t('common.cancel', 'Cancel')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MilitarySymbolEditor;
