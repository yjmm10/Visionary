import React, { useState, useEffect, useRef } from 'react';
import { GridSpan } from '../types';
import { X, Check, Merge, Split, Plus, Minus, Trash2 } from 'lucide-react';

interface GridSettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  initialRows: number;
  initialCols: number;
  initialLayout: GridSpan[];
  onSave: (rows: number, cols: number, layout: GridSpan[]) => void;
}

const GridSettingsDialog: React.FC<GridSettingsDialogProps> = ({
  isOpen,
  onClose,
  initialRows,
  initialCols,
  initialLayout,
  onSave
}) => {
  const [rows, setRows] = useState(initialRows);
  const [cols, setCols] = useState(initialCols);
  const [layout, setLayout] = useState<GridSpan[]>(initialLayout);
  
  // Selection State
  const [selectionStart, setSelectionStart] = useState<{r: number, c: number} | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<{r: number, c: number} | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setRows(initialRows);
      setCols(initialCols);
      setLayout(initialLayout);
      setSelectionStart(null);
      setSelectionEnd(null);
    }
  }, [isOpen, initialRows, initialCols, initialLayout]);

  if (!isOpen) return null;

  // Helper: Check if a cell is covered by a span
  const getSpanCovering = (r: number, c: number) => {
    return layout.find(s => 
      r >= s.row && r < s.row + s.rowSpan &&
      c >= s.col && c < s.col + s.colSpan
    );
  };

  // Helper: Get selection bounds
  const getSelectionBounds = () => {
    if (!selectionStart || !selectionEnd) return null;
    const r1 = Math.min(selectionStart.r, selectionEnd.r);
    const c1 = Math.min(selectionStart.c, selectionEnd.c);
    const r2 = Math.max(selectionStart.r, selectionEnd.r);
    const c2 = Math.max(selectionStart.c, selectionEnd.c);
    return { r1, c1, r2, c2 };
  };

  const handleMouseDown = (r: number, c: number) => {
    setSelectionStart({ r, c });
    setSelectionEnd({ r, c });
    setIsSelecting(true);
  };

  const handleMouseEnter = (r: number, c: number) => {
    if (isSelecting) {
      setSelectionEnd({ r, c });
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleMerge = () => {
    const bounds = getSelectionBounds();
    if (!bounds) return;
    const { r1, c1, r2, c2 } = bounds;

    // Remove any existing spans that are fully contained in the new merge
    // Or partially contained (which would be invalid, but we'll just overwrite)
    const newLayout = layout.filter(s => 
      !(s.row >= r1 && s.row <= r2 && s.col >= c1 && s.col <= c2)
    );

    // Add new span
    newLayout.push({
      row: r1,
      col: c1,
      rowSpan: r2 - r1 + 1,
      colSpan: c2 - c1 + 1
    });

    setLayout(newLayout);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const handleSplit = () => {
    const bounds = getSelectionBounds();
    if (!bounds) return;
    const { r1, c1, r2, c2 } = bounds;

    // Remove spans that intersect with selection
    const newLayout = layout.filter(s => 
      !(s.row >= r1 && s.row + s.rowSpan - 1 <= r2 && 
        s.col >= c1 && s.col + s.colSpan - 1 <= c2)
    );
    
    setLayout(newLayout);
    setSelectionStart(null);
    setSelectionEnd(null);
  };

  const handleSave = () => {
    // Validate layout against new dimensions
    const validLayout = layout.filter(s => 
      s.row + s.rowSpan <= rows && s.col + s.colSpan <= cols
    );
    onSave(rows, cols, validLayout);
    onClose();
  };

  // Render Grid
  const renderGrid = () => {
    const gridCells = [];
    const bounds = getSelectionBounds();

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const span = getSpanCovering(r, c);
        const isStart = span && span.row === r && span.col === c;
        const isCovered = span && !isStart;
        
        // Selection Logic
        let isSelected = false;
        if (bounds) {
          isSelected = r >= bounds.r1 && r <= bounds.r2 && c >= bounds.c1 && c <= bounds.c2;
        }

        if (isCovered) continue;

        gridCells.push(
          <div
            key={`${r}-${c}`}
            onMouseDown={() => handleMouseDown(r, c)}
            onMouseEnter={() => handleMouseEnter(r, c)}
            onMouseUp={handleMouseUp}
            style={{
              gridColumn: span ? `span ${span.colSpan}` : 'span 1',
              gridRow: span ? `span ${span.rowSpan}` : 'span 1',
            }}
            className={`
              border border-slate-300 flex items-center justify-center text-xs font-mono text-slate-400 select-none cursor-pointer transition-colors
              ${isSelected ? 'bg-blue-100 border-blue-400' : 'bg-white hover:bg-slate-50'}
              ${span ? 'bg-blue-50' : ''}
            `}
          >
            {span ? `${span.rowSpan}x${span.colSpan}` : ''}
          </div>
        );
      }
    }
    return gridCells;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onMouseUp={handleMouseUp}>
      <div className="bg-white rounded-xl shadow-2xl w-[800px] max-h-[90vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
          <h3 className="text-lg font-bold text-slate-800">Grid Layout Settings</h3>
          <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded-full text-slate-500">
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex items-center bg-white border border-slate-300 rounded-md overflow-hidden">
              <button onClick={() => setRows(Math.max(1, rows - 1))} className="p-1.5 hover:bg-slate-100 border-r border-slate-200"><Minus size={14}/></button>
              <span className="w-12 text-center text-sm font-bold">{rows} Rows</span>
              <button onClick={() => setRows(rows + 1)} className="p-1.5 hover:bg-slate-100 border-l border-slate-200"><Plus size={14}/></button>
            </div>
            <div className="flex items-center bg-white border border-slate-300 rounded-md overflow-hidden">
              <button onClick={() => setCols(Math.max(1, cols - 1))} className="p-1.5 hover:bg-slate-100 border-r border-slate-200"><Minus size={14}/></button>
              <span className="w-12 text-center text-sm font-bold">{cols} Cols</span>
              <button onClick={() => setCols(cols + 1)} className="p-1.5 hover:bg-slate-100 border-l border-slate-200"><Plus size={14}/></button>
            </div>
          </div>

          <div className="h-6 w-px bg-slate-300" />

          <div className="flex items-center gap-2">
            <button 
              onClick={handleMerge}
              disabled={!getSelectionBounds()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Merge size={14} />
              Merge Cells
            </button>
            <button 
              onClick={handleSplit}
              disabled={!getSelectionBounds()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Split size={14} />
              Split Cells
            </button>
          </div>
          
          <div className="flex-1" />
          
          <button 
            onClick={() => setLayout([])}
            className="flex items-center gap-1.5 px-3 py-1.5 text-red-600 hover:bg-red-50 rounded text-sm font-medium transition-colors"
          >
            <Trash2 size={14} />
            Reset Layout
          </button>
        </div>

        {/* Preview Area */}
        <div className="flex-1 overflow-auto p-8 bg-slate-100 flex items-center justify-center min-h-[400px]">
          <div 
            className="bg-white shadow-lg grid gap-1 p-1 border border-slate-300"
            style={{
              gridTemplateColumns: `repeat(${cols}, 60px)`,
              gridTemplateRows: `repeat(${rows}, 60px)`,
              width: 'fit-content'
            }}
          >
            {renderGrid()}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 bg-white flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 rounded-lg shadow-sm transition-colors flex items-center gap-2"
          >
            <Check size={16} />
            Apply Changes
          </button>
        </div>

      </div>
    </div>
  );
};

export default GridSettingsDialog;
