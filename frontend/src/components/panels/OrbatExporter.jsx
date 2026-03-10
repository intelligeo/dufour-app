/**
 * ORBAT Exporter Component
 * 
 * Exports ORBAT tree as:
 *  - PNG image (tree diagram with real NATO symbols)
 *  - JSON data (for reimport)
 *  - CSV summary
 * 
 * Uses server-side symbol rendering for high-quality export.
 * Falls back to client-side milsymbol if server unavailable.
 * 
 * @component OrbatExporter
 */

import React, { useState, useRef, useCallback } from 'react';
import { fetchSymbolBatch, getExportSymbol, getThumbnailSymbol, isServerAvailable } from '../../services/symbolService.js';
import '../../../src/styles/orbat-manager.css';

/**
 * ORBAT Export Formats
 */
const ExportFormat = {
  PNG: 'png',
  JSON: 'json',
  CSV: 'csv'
};

/**
 * OrbatExporter — renders ORBAT as exportable document
 */
export default function OrbatExporter({ orbatTree, onClose }) {
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [serverOk, setServerOk] = useState(null);
  const canvasRef = useRef(null);

  // Check server status on mount
  React.useEffect(() => {
    isServerAvailable().then(ok => setServerOk(ok));
  }, []);

  /**
   * Collect all units from ORBAT tree with hierarchy info
   */
  const collectUnits = useCallback((node, depth = 0, result = []) => {
    if (!node) return result;
    result.push({ unit: node, depth });
    if (node.children) {
      for (const child of node.children) {
        collectUnits(child, depth + 1, result);
      }
    }
    return result;
  }, []);

  /**
   * Export as PNG — render tree diagram to canvas, then download
   */
  const handleExportPNG = async () => {
    if (!orbatTree?.root) return;
    setExporting(true);
    setProgress(0);

    try {
      const units = collectUnits(orbatTree.root);
      const totalUnits = units.length;
      
      // Layout constants
      const ROW_HEIGHT = 72;
      const INDENT = 40;
      const SYMBOL_SIZE = 48;
      const PADDING = 32;
      const CANVAS_WIDTH = 800;
      const HEADER_HEIGHT = 60;
      const canvasHeight = HEADER_HEIGHT + PADDING + (totalUnits * ROW_HEIGHT) + PADDING;

      // Create offscreen canvas
      const canvas = document.createElement('canvas');
      canvas.width = CANVAS_WIDTH;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext('2d');

      // Background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, CANVAS_WIDTH, canvasHeight);

      // Title
      ctx.fillStyle = '#1a1a2e';
      ctx.font = 'bold 22px "Segoe UI", Arial, sans-serif';
      ctx.fillText(`ORBAT: ${orbatTree.name || 'Unnamed'}`, PADDING, HEADER_HEIGHT - 16);
      ctx.font = '12px "Segoe UI", Arial, sans-serif';
      ctx.fillStyle = '#666';
      ctx.fillText(`${totalUnits} units — exported ${new Date().toISOString().split('T')[0]}`, PADDING, HEADER_HEIGHT + 2);

      // Draw separator
      ctx.strokeStyle = '#dee2e6';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(PADDING, HEADER_HEIGHT + 12);
      ctx.lineTo(CANVAS_WIDTH - PADDING, HEADER_HEIGHT + 12);
      ctx.stroke();

      // Fetch symbols (batch if server available, else client)
      const sidcList = units
        .map(u => {
          const sidc = u.unit.generateSIDC ? u.unit.generateSIDC() : u.unit.sidc;
          return sidc;
        })
        .filter(Boolean);

      const uniqueSidcs = [...new Set(sidcList)];
      const symbolImages = new Map();

      // Load symbol images
      for (let i = 0; i < uniqueSidcs.length; i++) {
        const sidc = uniqueSidcs[i];
        try {
          const dataUrl = serverOk
            ? await getExportSymbol(sidc, { size: SYMBOL_SIZE, format: 'png' })
            : getThumbnailSymbol(sidc, SYMBOL_SIZE);

          const img = new Image();
          await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = dataUrl;
          });
          symbolImages.set(sidc, img);
        } catch (err) {
          console.warn(`Failed to load symbol for ${sidc}:`, err);
        }
        setProgress(Math.round(((i + 1) / uniqueSidcs.length) * 60));
      }

      // Draw units
      for (let i = 0; i < units.length; i++) {
        const { unit, depth } = units[i];
        const y = HEADER_HEIGHT + PADDING + 12 + (i * ROW_HEIGHT);
        const x = PADDING + (depth * INDENT);

        // Draw connection line to parent
        if (depth > 0) {
          ctx.strokeStyle = 'rgba(52, 152, 219, 0.4)';
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(x - 12, y + SYMBOL_SIZE / 2);
          ctx.lineTo(x + 4, y + SYMBOL_SIZE / 2);
          ctx.stroke();
          ctx.setLineDash([]);
        }

        // Draw symbol image
        const sidc = unit.generateSIDC ? unit.generateSIDC() : unit.sidc;
        const img = symbolImages.get(sidc);
        if (img) {
          const aspectRatio = img.width / img.height;
          const drawHeight = Math.min(SYMBOL_SIZE, ROW_HEIGHT - 8);
          const drawWidth = drawHeight * aspectRatio;
          ctx.drawImage(img, x + 8, y + (ROW_HEIGHT - drawHeight) / 2 - 4, drawWidth, drawHeight);
        }

        // Draw unit name
        ctx.fillStyle = '#1a1a2e';
        ctx.font = 'bold 13px "Segoe UI", Arial, sans-serif';
        ctx.fillText(unit.name || 'Unnamed', x + SYMBOL_SIZE + 20, y + 28);

        // Draw designation + echelon
        ctx.fillStyle = '#6c757d';
        ctx.font = '11px "Segoe UI", Arial, sans-serif';
        const echelonName = unit.echelon?.name || unit.echelon || '';
        const designation = unit.designation ? ` — ${unit.designation}` : '';
        ctx.fillText(`${echelonName}${designation}`, x + SYMBOL_SIZE + 20, y + 44);

        // Draw SIDC code (small)
        ctx.fillStyle = '#adb5bd';
        ctx.font = '9px "Courier New", monospace';
        ctx.fillText(sidc || '', x + SYMBOL_SIZE + 20, y + 56);

        setProgress(60 + Math.round(((i + 1) / units.length) * 40));
      }

      // Download
      const link = document.createElement('a');
      link.download = `ORBAT_${(orbatTree.name || 'export').replace(/\s+/g, '_')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();

    } catch (err) {
      console.error('ORBAT PNG export failed:', err);
      alert(`Export failed: ${err.message}`);
    } finally {
      setExporting(false);
      setProgress(0);
    }
  };

  /**
   * Export as JSON (for reimport)
   */
  const handleExportJSON = () => {
    if (!orbatTree) return;
    const json = orbatTree.toJSON ? orbatTree.toJSON() : orbatTree;
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ORBAT_${(orbatTree.name || 'export').replace(/\s+/g, '_')}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Export as CSV summary
   */
  const handleExportCSV = () => {
    if (!orbatTree?.root) return;
    const units = collectUnits(orbatTree.root);

    const headers = ['Depth', 'Name', 'Designation', 'Echelon', 'Type', 'Affiliation', 'SIDC', 'Lat', 'Lon'];
    const rows = units.map(({ unit, depth }) => {
      const sidc = unit.generateSIDC ? unit.generateSIDC() : (unit.sidc || '');
      const pos = unit.position || [0, 0];
      return [
        depth,
        `"${(unit.name || '').replace(/"/g, '""')}"`,
        `"${(unit.designation || '').replace(/"/g, '""')}"`,
        unit.echelon?.name || unit.echelon || '',
        unit.type || '',
        unit.affiliation || '',
        sidc,
        pos[1] || 0,
        pos[0] || 0
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ORBAT_${(orbatTree.name || 'export').replace(/\s+/g, '_')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalUnits = orbatTree?.getTotalUnits ? orbatTree.getTotalUnits() : 0;

  return (
    <div className="orbat-exporter-modal" style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      background: 'rgba(30, 30, 30, 0.97)',
      border: '2px solid #3498db',
      borderRadius: '10px',
      padding: '24px',
      minWidth: '380px',
      zIndex: 2000,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
      color: 'white'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>📤 Export ORBAT</h3>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#aaa', cursor: 'pointer', fontSize: '18px' }}>✕</button>
      </div>

      <div style={{ marginBottom: '16px', fontSize: '13px', color: '#adb5bd' }}>
        <strong>{orbatTree?.name || 'ORBAT'}</strong> — {totalUnits} units
        <br />
        Server: {serverOk === null ? '⏳ checking...' : serverOk ? '🟢 available (high-quality export)' : '🟡 offline (client rendering)'}
      </div>

      {exporting && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ background: '#2c3e50', borderRadius: '4px', overflow: 'hidden', height: '8px' }}>
            <div style={{
              width: `${progress}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #3498db, #2ecc71)',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <small style={{ color: '#7f8c8d' }}>Rendering symbols... {progress}%</small>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          onClick={handleExportPNG}
          disabled={exporting || !orbatTree?.root}
          style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, #3498db, #2980b9)',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            cursor: exporting ? 'wait' : 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            opacity: exporting ? 0.6 : 1
          }}
        >
          🖼️ Export as PNG (with NATO symbols)
        </button>

        <button
          onClick={handleExportJSON}
          disabled={!orbatTree}
          style={{
            padding: '12px 16px',
            background: 'rgba(52, 152, 219, 0.2)',
            color: '#3498db',
            border: '1px solid #3498db',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          📄 Export as JSON (reimportable)
        </button>

        <button
          onClick={handleExportCSV}
          disabled={!orbatTree?.root}
          style={{
            padding: '12px 16px',
            background: 'rgba(46, 204, 113, 0.15)',
            color: '#2ecc71',
            border: '1px solid #2ecc71',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          📊 Export as CSV (summary table)
        </button>
      </div>
    </div>
  );
}
