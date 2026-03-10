/**
 * ORBAT Manager Component
 * 
 * Hierarchical military unit management with tree view, drag & drop, and context menu.
 * Integrates with existing MilitarySymbolEditor for unit details.
 * 
 * @component OrbatManager
 */

import React, { useState, useEffect, useRef } from 'react';
import { OrbatUnit, OrbatTree, NATOEchelons, createSampleOrbat } from '../services/orbatModel.js';
import { flatToHierarchy, hierarchyToFlat, scenarioToOrbat, orbatToScenario } from '../services/orbatConverter.js';
import MilitarySymbolEditor from './MilitarySymbolEditor.jsx';
import OrbatExporter from './panels/OrbatExporter.jsx';
import { getThumbnailSymbol } from '../services/symbolService.js';
import '../styles/orbat-manager.css';

/**
 * OrbatManager - Main component
 */
export default function OrbatManager({ onDeploy, onClose, initialOrbat = null }) {
    const [orbatTree, setOrbatTree] = useState(initialOrbat || new OrbatTree({ name: 'New ORBAT' }));
    const [selectedUnit, setSelectedUnit] = useState(null);
    const [expandedUnits, setExpandedUnits] = useState(new Set());
    const [showEditor, setShowEditor] = useState(false);
    const [contextMenu, setContextMenu] = useState(null);
    const [draggedUnit, setDraggedUnit] = useState(null);
    const [showExporter, setShowExporter] = useState(false);
    
    const fileInputRef = useRef(null);
    
    // Auto-expand root on mount
    useEffect(() => {
        if (orbatTree.root) {
            setExpandedUnits(new Set([orbatTree.root.id]));
        }
    }, []);
    
    // Handle new ORBAT
    const handleNew = () => {
        if (confirm('Create new ORBAT? Current data will be lost.')) {
            setOrbatTree(new OrbatTree({ name: 'New ORBAT' }));
            setSelectedUnit(null);
            setExpandedUnits(new Set());
        }
    };
    
    // Handle load sample
    const handleLoadSample = () => {
        const sample = createSampleOrbat();
        setOrbatTree(sample);
        setExpandedUnits(new Set([sample.root.id]));
        setSelectedUnit(sample.root);
    };
    
    // Handle import JSON
    const handleImport = () => {
        fileInputRef.current?.click();
    };
    
    const handleFileChange = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target.result);
                const imported = OrbatTree.fromJSON(json);
                setOrbatTree(imported);
                if (imported.root) {
                    setExpandedUnits(new Set([imported.root.id]));
                }
                alert(`ORBAT imported: ${imported.getTotalUnits()} units`);
            } catch (err) {
                alert(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
    };
    
    // Handle export JSON
    const handleExport = () => {
        const json = orbatTree.toJSON();
        const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${orbatTree.name.replace(/\s+/g, '_')}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };
    
    // Handle deploy to map
    const handleDeploy = () => {
        if (!orbatTree.root) {
            alert('No units to deploy');
            return;
        }
        
        const validation = orbatTree.validate();
        if (!validation.valid) {
            alert(`ORBAT validation failed:\n${validation.errors.join('\n')}`);
            return;
        }
        
        if (onDeploy) {
            onDeploy(orbatTree);
        }
        alert(`Deployed ${orbatTree.getTotalUnits()} units to map`);
    };
    
    // Handle clear
    const handleClear = () => {
        if (confirm('Clear all units?')) {
            setOrbatTree(new OrbatTree({ name: orbatTree.name }));
            setSelectedUnit(null);
            setExpandedUnits(new Set());
        }
    };
    
    // Toggle unit expansion
    const toggleExpand = (unitId) => {
        setExpandedUnits(prev => {
            const next = new Set(prev);
            if (next.has(unitId)) {
                next.delete(unitId);
            } else {
                next.add(unitId);
            }
            return next;
        });
    };
    
    // Select unit
    const handleSelectUnit = (unit) => {
        setSelectedUnit(unit);
        setContextMenu(null);
    };
    
    // Context menu handlers
    const handleContextMenu = (e, unit) => {
        e.preventDefault();
        e.stopPropagation();
        
        setContextMenu({
            x: e.clientX,
            y: e.clientY,
            unit: unit
        });
    };
    
    const closeContextMenu = () => {
        setContextMenu(null);
    };
    
    // Add subordinate unit
    const handleAddSubordinate = (parentUnit) => {
        const childLevel = Math.min(parentUnit.level + 1, 10);
        const childEchelon = Object.values(NATOEchelons).find(e => e.level === childLevel);
        
        const newUnit = new OrbatUnit({
            name: `New ${childEchelon.name}`,
            level: childLevel,
            echelon: childEchelon,
            affiliation: parentUnit.affiliation,
            type: parentUnit.type,
            position: [
                parentUnit.position[0] + (Math.random() - 0.5) * 0.02,
                parentUnit.position[1] + (Math.random() - 0.5) * 0.02
            ]
        });
        
        parentUnit.addChild(newUnit);
        setOrbatTree({ ...orbatTree }); // Trigger re-render
        setExpandedUnits(prev => new Set([...prev, parentUnit.id]));
        setSelectedUnit(newUnit);
        closeContextMenu();
    };
    
    // Edit unit
    const handleEditUnit = (unit) => {
        setSelectedUnit(unit);
        setShowEditor(true);
        closeContextMenu();
    };
    
    // Delete unit
    const handleDeleteUnit = (unit) => {
        const descendantsCount = unit.getTotalSubordinates();
        const message = descendantsCount > 0
            ? `Delete ${unit.name} and ${descendantsCount} subordinate(s)?`
            : `Delete ${unit.name}?`;
        
        if (confirm(message)) {
            if (unit.parent) {
                unit.parent.removeChild(unit);
            } else {
                // Deleting root
                orbatTree.setRoot(null);
            }
            
            setOrbatTree({ ...orbatTree });
            if (selectedUnit === unit) {
                setSelectedUnit(null);
            }
        }
        closeContextMenu();
    };
    
    // Promote unit (move up in hierarchy)
    const handlePromote = (unit) => {
        if (!unit.parent || !unit.parent.parent) {
            alert('Cannot promote root or top-level unit');
            return;
        }
        
        const grandparent = unit.parent.parent;
        unit.moveTo(grandparent);
        setOrbatTree({ ...orbatTree });
        closeContextMenu();
    };
    
    // Demote unit (move down in hierarchy)
    const handleDemote = (unit) => {
        if (!unit.parent || unit.parent.children.length <= 1) {
            alert('Cannot demote - no sibling to move under');
            return;
        }
        
        // Move under first sibling
        const siblings = unit.parent.children.filter(c => c !== unit);
        unit.moveTo(siblings[0]);
        setOrbatTree({ ...orbatTree });
        closeContextMenu();
    };
    
    // Drag and drop handlers
    const handleDragStart = (e, unit) => {
        e.stopPropagation();
        setDraggedUnit(unit);
        e.dataTransfer.effectAllowed = 'move';
    };
    
    const handleDragOver = (e, targetUnit) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!draggedUnit || draggedUnit === targetUnit) return;
        
        // Check if valid drop target
        if (draggedUnit.isAncestorOf(targetUnit)) {
            e.dataTransfer.dropEffect = 'none';
            return;
        }
        
        e.dataTransfer.dropEffect = 'move';
    };
    
    const handleDrop = (e, targetUnit) => {
        e.preventDefault();
        e.stopPropagation();
        
        if (!draggedUnit || draggedUnit === targetUnit) return;
        
        // Check if valid drop
        if (draggedUnit.isAncestorOf(targetUnit)) {
            alert('Cannot move unit to its own descendant');
            return;
        }
        
        try {
            draggedUnit.moveTo(targetUnit);
            setOrbatTree({ ...orbatTree });
            setExpandedUnits(prev => new Set([...prev, targetUnit.id]));
        } catch (err) {
            alert(`Move failed: ${err.message}`);
        }
        
        setDraggedUnit(null);
    };
    
    const handleDragEnd = () => {
        setDraggedUnit(null);
    };
    
    // Handle unit editor save
    const handleEditorSave = (updatedUnit) => {
        if (selectedUnit) {
            // Update properties
            Object.assign(selectedUnit, updatedUnit);
            setOrbatTree({ ...orbatTree });
        }
        setShowEditor(false);
    };
    
    // Close context menu on click outside
    useEffect(() => {
        const handleClick = () => closeContextMenu();
        document.addEventListener('click', handleClick);
        return () => document.removeEventListener('click', handleClick);
    }, []);
    
    // Render tree node
    const renderTreeNode = (unit, depth = 0) => {
        const isExpanded = expandedUnits.has(unit.id);
        const isSelected = selectedUnit === unit;
        const isDragging = draggedUnit === unit;
        const hasChildren = unit.children.length > 0;
        
        return (
            <div key={unit.id} className="orbat-tree-node" style={{ marginLeft: `${depth * 20}px` }}>
                <div
                    className={`orbat-node-content ${isSelected ? 'selected' : ''} ${isDragging ? 'dragging' : ''}`}
                    onClick={() => handleSelectUnit(unit)}
                    onContextMenu={(e) => handleContextMenu(e, unit)}
                    onDragStart={(e) => handleDragStart(e, unit)}
                    onDragOver={(e) => handleDragOver(e, unit)}
                    onDrop={(e) => handleDrop(e, unit)}
                    onDragEnd={handleDragEnd}
                    draggable
                >
                    {hasChildren && (
                        <button
                            className="orbat-expand-btn"
                            onClick={(e) => { e.stopPropagation(); toggleExpand(unit.id); }}
                        >
                            {isExpanded ? '▼' : '▶'}
                        </button>
                    )}
                    {!hasChildren && <span className="orbat-expand-spacer"></span>}
                    
                    {/* NATO symbol thumbnail (real milsymbol rendering) */}
                    {(() => {
                        const sidc = (unit.generateSIDC && typeof unit.generateSIDC === 'function')
                            ? unit.generateSIDC()
                            : null;
                        if (sidc) {
                            const thumbUrl = getThumbnailSymbol(sidc, 28);
                            return (
                                <img 
                                    className="orbat-symbol-icon"
                                    src={thumbUrl}
                                    alt={unit.echelon?.name || 'unit'}
                                    title={`${unit.echelon?.name || ''} — ${sidc}`}
                                    style={{ width: '28px', height: '28px', flexShrink: 0 }}
                                />
                            );
                        }
                        // Fallback to text echelon symbol
                        return (
                            <span className="orbat-echelon-icon" title={unit.echelon?.name || ''}>
                                {unit.echelon?.symbol || '?'}
                            </span>
                        );
                    })()}
                    
                    <span className="orbat-unit-name">{unit.name}</span>
                    
                    {hasChildren && (
                        <span className="orbat-unit-badge">{unit.children.length}</span>
                    )}
                    
                    <span className={`orbat-affiliation-indicator ${unit.affiliation.toLowerCase()}`}></span>
                </div>
                
                {isExpanded && hasChildren && (
                    <div className="orbat-children">
                        {unit.children.map(child => renderTreeNode(child, depth + 1))}
                    </div>
                )}
            </div>
        );
    };
    
    return (
        <div className="orbat-manager">
            {/* Header */}
            <div className="orbat-header">
                <h2>ORBAT Manager</h2>
                <button className="orbat-close-btn" onClick={onClose} title="Close">✕</button>
            </div>
            
            {/* Toolbar */}
            <div className="orbat-toolbar">
                <button onClick={handleNew} title="New ORBAT">
                    📄 New
                </button>
                <button onClick={handleLoadSample} title="Load Sample">
                    📋 Sample
                </button>
                <button onClick={handleImport} title="Import JSON">
                    📥 Import
                </button>
                <button onClick={handleExport} title="Export JSON" disabled={!orbatTree.root}>
                    📤 Export
                </button>
                <button onClick={() => setShowExporter(true)} title="Export ORBAT (PNG/CSV)" disabled={!orbatTree.root}>
                    🖼️ Export+
                </button>
                <button onClick={handleDeploy} className="deploy-btn" disabled={!orbatTree.root}>
                    🗺️ Deploy
                </button>
                <button onClick={handleClear} title="Clear All" disabled={!orbatTree.root}>
                    🗑️ Clear
                </button>
                
                <input
                    ref={fileInputRef}
                    type="file"
                    accept=".json"
                    onChange={handleFileChange}
                    style={{ display: 'none' }}
                />
            </div>
            
            {/* Tree View */}
            <div className="orbat-tree-view">
                {orbatTree.root ? (
                    renderTreeNode(orbatTree.root)
                ) : (
                    <div className="orbat-empty-state">
                        <p>No units in ORBAT</p>
                        <button onClick={handleLoadSample}>Load Sample ORBAT</button>
                    </div>
                )}
            </div>
            
            {/* Bottom Panel */}
            <div className="orbat-bottom-panel">
                <div className="orbat-stats">
                    <div className="orbat-stat">
                        <span className="stat-label">Total Units:</span>
                        <span className="stat-value">{orbatTree.getTotalUnits()}</span>
                    </div>
                    <div className="orbat-stat">
                        <span className="stat-label">Max Depth:</span>
                        <span className="stat-value">{orbatTree.getMaxDepth()}</span>
                    </div>
                    {selectedUnit && (
                        <div className="orbat-stat">
                            <span className="stat-label">Selected:</span>
                            <span className="stat-value">{selectedUnit.name}</span>
                        </div>
                    )}
                </div>
                
                {selectedUnit && (
                    <button
                        className="orbat-edit-details-btn"
                        onClick={() => setShowEditor(true)}
                    >
                        ✏️ Edit Details
                    </button>
                )}
            </div>
            
            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="orbat-context-menu"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button onClick={() => handleAddSubordinate(contextMenu.unit)}>
                        ➕ Add Subordinate
                    </button>
                    <button onClick={() => handleEditUnit(contextMenu.unit)}>
                        ✏️ Edit Unit
                    </button>
                    <button onClick={() => handleDeleteUnit(contextMenu.unit)}>
                        🗑️ Delete Unit
                    </button>
                    <hr />
                    <button
                        onClick={() => handlePromote(contextMenu.unit)}
                        disabled={!contextMenu.unit.parent?.parent}
                    >
                        ⬆️ Promote
                    </button>
                    <button
                        onClick={() => handleDemote(contextMenu.unit)}
                        disabled={!contextMenu.unit.parent || contextMenu.unit.parent.children.length <= 1}
                    >
                        ⬇️ Demote
                    </button>
                    <hr />
                    <button onClick={() => {
                        setSelectedUnit(contextMenu.unit);
                        closeContextMenu();
                        // Trigger map focus (would be handled by parent)
                        console.log('Show on map:', contextMenu.unit);
                    }}>
                        🗺️ Show on Map
                    </button>
                </div>
            )}
            
            {/* Unit Editor Modal */}
            {showEditor && selectedUnit && (
                <div className="orbat-editor-modal">
                    <div className="orbat-editor-content">
                        <MilitarySymbolEditor
                            unit={selectedUnit}
                            onSave={handleEditorSave}
                            onCancel={() => setShowEditor(false)}
                        />
                    </div>
                </div>
            )}
            
            {/* ORBAT Exporter Modal */}
            {showExporter && (
                <OrbatExporter
                    orbatTree={orbatTree}
                    onClose={() => setShowExporter(false)}
                />
            )}
        </div>
    );
}
