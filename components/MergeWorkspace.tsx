
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Project, Box } from '../types';
import { Icons, COLORS } from '../constants';
import html2canvas from 'html2canvas';
import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2, RefreshCw, Trash2, X, PlusSquare, Eye, EyeOff } from 'lucide-react';

interface MergeWorkspaceProps {
  projects: Project[];
  mergeQueue: (string | null)[];
  rows: number;
  cols: number;
  setRows: (r: number) => void;
  setCols: (c: number) => void;
  onReorder: (ids: (string | null)[]) => void;
  onDoubleClick: (id: string) => void;
  onProjectUpdate: (projectId: string, boxes: Box[]) => void;
  boxOpacity: number;
  setBoxOpacity: (o: number) => void;
  showLabels: boolean;
  setShowLabels: (s: boolean) => void;
}

const MergeWorkspace: React.FC<MergeWorkspaceProps> = ({ 
  projects, 
  mergeQueue, 
  rows, 
  cols,
  setRows,
  setCols,
  onReorder,
  onDoubleClick,
  onProjectUpdate,
  boxOpacity,
  setBoxOpacity,
  showLabels,
  setShowLabels
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Transform State
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'select' | 'hand' | 'draw'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number, y: number } | null>(null);

  // Drag & Drop (Slot) State
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  // Box Editing State
  const [selectedBox, setSelectedBox] = useState<{ projectId: string, boxId: string } | null>(null);
  const [boxDrag, setBoxDrag] = useState<{
    projectId: string;
    boxId: string;
    type: 'move' | 'handle';
    handleIndex?: number;
    startPos: { x: number, y: number };
    originalCoords: [number, number, number, number];
  } | null>(null);

  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number, y: number, projectId: string } | null>(null);
  const [currentDrawRect, setCurrentDrawRect] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);

  const totalSlots = rows * cols;

  // 1. Calculate Strict Pixel Metrics based on the FIRST image (Reference)
  const gridMetrics = useMemo(() => {
    const firstId = mergeQueue.find(id => id !== null);
    const definingProject = projects.find(p => p.id === firstId);

    const baseW = (definingProject?.imageWidth && definingProject.imageWidth > 0) 
      ? definingProject.imageWidth 
      : 1240; 
      
    const baseH = (definingProject?.imageHeight && definingProject.imageHeight > 0) 
      ? definingProject.imageHeight 
      : 1754; 

    const totalW = baseW * cols;
    const totalH = baseH * rows;

    return { baseW, baseH, totalW, totalH };
  }, [mergeQueue, projects, rows, cols]);

  // Fit to View Logic
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const padding = 40;
    
    const availW = clientWidth - padding;
    const availH = clientHeight - padding;

    if (gridMetrics.totalW > 0 && gridMetrics.totalH > 0) {
        const scaleW = availW / gridMetrics.totalW;
        const scaleH = availH / gridMetrics.totalH;
        const newZoom = Math.min(scaleW, scaleH); 
        
        setZoom(parseFloat(newZoom.toFixed(4)));
        
        const contentW = gridMetrics.totalW * newZoom;
        const contentH = gridMetrics.totalH * newZoom;
        
        setOffset({
            x: (clientWidth - contentW) / 2,
            y: (clientHeight - contentH) / 2
        });
    }
  }, [gridMetrics.totalW, gridMetrics.totalH]);

  const resetView = () => {
      setZoom(1);
      setOffset({ x: 0, y: 0 });
  };

  useEffect(() => {
    const timer = setTimeout(fitToView, 10);
    window.addEventListener('resize', fitToView);
    return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', fitToView);
    };
  }, [fitToView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      
      if (e.code === 'Space' && tool !== 'hand') {
        e.preventDefault();
        setTool('hand');
      }
      if (e.key.toLowerCase() === 'v') setTool('select');
      if (e.key.toLowerCase() === 'd') setTool('draw');
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBox) {
        deleteSelectedBox();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && tool === 'hand') {
        setTool('select');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool, selectedBox]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom(prev => {
          const next = Math.min(5, Math.max(0.01, prev + delta * prev));
          return parseFloat(next.toFixed(4));
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleWheel);
  }, []);

  useEffect(() => {
    if (mergeQueue.length !== totalSlots) {
      const newQueue = [...mergeQueue];
      if (newQueue.length < totalSlots) {
        while (newQueue.length < totalSlots) newQueue.push(null);
      } else {
        newQueue.splice(totalSlots);
      }
      onReorder(newQueue);
    }
  }, [totalSlots, mergeQueue.length, onReorder]);

  const updateBox = (projectId: string, boxId: string, updates: Partial<Box>) => {
     const project = projects.find(p => p.id === projectId);
     if (!project) return;
     const newBoxes = project.boxes.map(b => b.id === boxId ? { ...b, ...updates } : b);
     onProjectUpdate(projectId, newBoxes);
  };

  const deleteSelectedBox = () => {
    if (!selectedBox) return;
    const { projectId, boxId } = selectedBox;
    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const newBoxes = project.boxes.filter(b => b.id !== boxId);
    onProjectUpdate(projectId, newBoxes);
    setSelectedBox(null);
  };

  // --- Draw Helpers ---
  const getCellCoordinates = (clientX: number, clientY: number) => {
     if (!contentRef.current) return null;
     
     // Get grid container boundaries relative to viewport
     const relX = (clientX - containerRef.current!.getBoundingClientRect().left - offset.x) / zoom;
     const relY = (clientY - containerRef.current!.getBoundingClientRect().top - offset.y) / zoom;

     if (relX < 0 || relY < 0 || relX > gridMetrics.totalW || relY > gridMetrics.totalH) return null;

     const col = Math.floor(relX / gridMetrics.baseW);
     const row = Math.floor(relY / gridMetrics.baseH);
     const index = row * cols + col;

     if (index >= 0 && index < totalSlots && mergeQueue[index]) {
         const localX = relX % gridMetrics.baseW;
         const localY = relY % gridMetrics.baseH;
         return { projectId: mergeQueue[index]!, localX, localY };
     }
     return null;
  };

  // --- Interaction Handlers ---

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool === 'hand' || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    if (tool === 'draw') {
        const coords = getCellCoordinates(e.clientX, e.clientY);
        if (coords) {
            const project = projects.find(p => p.id === coords.projectId);
            if (!project) return;

            // Map local cell coords to image coords using object-contain logic
            const scale = Math.min(gridMetrics.baseW / project.imageWidth, gridMetrics.baseH / project.imageHeight);
            const drawnW = project.imageWidth * scale;
            const drawnH = project.imageHeight * scale;
            const offX = (gridMetrics.baseW - drawnW) / 2;
            const offY = (gridMetrics.baseH - drawnH) / 2;

            // Convert to image space
            const imgX = (coords.localX - offX) / scale;
            const imgY = (coords.localY - offY) / scale;

            setIsDrawing(true);
            setDrawStart({ x: imgX, y: imgY, projectId: coords.projectId });
            setCurrentDrawRect({ x1: imgX, y1: imgY, x2: imgX, y2: imgY });
            setSelectedBox(null);
        }
        return;
    }
    
    if (e.target === containerRef.current || e.target === contentRef.current) {
       setSelectedBox(null);
    }
  };

  const handleBoxMouseDown = (e: React.MouseEvent, projectId: string, boxId: string, type: 'move' | 'handle', handleIndex?: number) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    e.preventDefault(); // Prevent native drag of parent slot

    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const box = project.boxes.find(b => b.id === boxId);
    if (!box) return;

    setSelectedBox({ projectId, boxId });
    setBoxDrag({
        projectId,
        boxId,
        type,
        handleIndex,
        startPos: { x: e.clientX, y: e.clientY },
        originalCoords: [...box.coordinate] as [number, number, number, number]
    });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panStart) {
      e.preventDefault();
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    if (isDrawing && drawStart && currentDrawRect) {
         // Logic simplified: just track mouse to update rect end
         // Re-calculate relative to container to get absolute grid position
         const relX = (e.clientX - containerRef.current!.getBoundingClientRect().left - offset.x) / zoom;
         const relY = (e.clientY - containerRef.current!.getBoundingClientRect().top - offset.y) / zoom;
         
         const project = projects.find(p => p.id === drawStart.projectId);
         if (!project) return;
         
         // Using modulo to find local coordinate within the current hovered cell-space
         // Note: this assumes drawing stays within a cell visually or maps to it
         const localX = relX % gridMetrics.baseW;
         const localY = relY % gridMetrics.baseH;
         
         const scale = Math.min(gridMetrics.baseW / project.imageWidth, gridMetrics.baseH / project.imageHeight);
         const drawnW = project.imageWidth * scale;
         const drawnH = project.imageHeight * scale;
         const offX = (gridMetrics.baseW - drawnW) / 2;
         const offY = (gridMetrics.baseH - drawnH) / 2;
         
         const imgX = (localX - offX) / scale;
         const imgY = (localY - offY) / scale;
         
         setCurrentDrawRect({
             x1: drawStart.x,
             y1: drawStart.y,
             x2: imgX,
             y2: imgY
         });
         return;
    }

    if (boxDrag) {
        e.preventDefault();
        const project = projects.find(p => p.id === boxDrag.projectId);
        if (!project) return;

        const effectiveScale = (gridMetrics.baseW / project.imageWidth) * zoom;
        
        const dx = (e.clientX - boxDrag.startPos.x) / effectiveScale;
        const dy = (e.clientY - boxDrag.startPos.y) / effectiveScale;

        const [x1, y1, x2, y2] = boxDrag.originalCoords;
        let nextCoords: [number, number, number, number] = [x1, y1, x2, y2];

        if (boxDrag.type === 'move') {
            nextCoords = [x1 + dx, y1 + dy, x2 + dx, y2 + dy];
        } else if (boxDrag.type === 'handle') {
            if (boxDrag.handleIndex === 0) nextCoords = [x1 + dx, y1 + dy, x2, y2];
            if (boxDrag.handleIndex === 1) nextCoords = [x1, y1 + dy, x2 + dx, y2];
            if (boxDrag.handleIndex === 2) nextCoords = [x1 + dx, y1, x2, y2 + dy];
            if (boxDrag.handleIndex === 3) nextCoords = [x1, y1, x2 + dx, y2 + dy];
        }

        updateBox(boxDrag.projectId, boxDrag.boxId, { coordinate: nextCoords });
    }
  };

  const onMouseUp = () => {
    if (isDrawing && drawStart && currentDrawRect) {
         const xMin = Math.min(currentDrawRect.x1, currentDrawRect.x2);
         const yMin = Math.min(currentDrawRect.y1, currentDrawRect.y2);
         const xMax = Math.max(currentDrawRect.x1, currentDrawRect.x2);
         const yMax = Math.max(currentDrawRect.y1, currentDrawRect.y2);

         if ((xMax - xMin) > 5 && (yMax - yMin) > 5) {
             const newBox: Box = {
                 id: `box-new-${Date.now()}-${Math.random().toString(36).substr(2,4)}`,
                 cls_id: 0,
                 label: 'New Object',
                 score: 1.0,
                 coordinate: [xMin, yMin, xMax, yMax]
             };
             const project = projects.find(p => p.id === drawStart.projectId);
             if (project) {
                 onProjectUpdate(drawStart.projectId, [...project.boxes, newBox]);
                 setSelectedBox({ projectId: drawStart.projectId, boxId: newBox.id });
             }
         }
    }

    setIsPanning(false);
    setPanStart(null);
    setBoxDrag(null);
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentDrawRect(null);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (tool === 'hand' || tool === 'draw' || boxDrag) {
        e.preventDefault();
        return;
    }
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';

    // Drag Preview Generation - REDUCED SIZE
    const projectId = mergeQueue[index];
    const project = projects.find(p => p.id === projectId);
    const slotElement = e.currentTarget as HTMLElement;
    const imgElement = slotElement.querySelector('img');

    if (project) {
        const canvas = document.createElement('canvas');
        const thumbWidth = 100;
        const ratio = gridMetrics.baseH / gridMetrics.baseW;
        const thumbHeight = thumbWidth * ratio;

        canvas.width = thumbWidth;
        canvas.height = thumbHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, thumbWidth, thumbHeight);

            if (imgElement && imgElement.complete) {
                const imgRatio = imgElement.naturalWidth / imgElement.naturalHeight;
                const canvasRatio = thumbWidth / thumbHeight;
                let drawW, drawH, drawX, drawY;

                if (imgRatio > canvasRatio) {
                    drawW = thumbWidth;
                    drawH = thumbWidth / imgRatio;
                    drawX = 0;
                    drawY = (thumbHeight - drawH) / 2;
                } else {
                    drawH = thumbHeight;
                    drawW = thumbHeight * imgRatio;
                    drawY = 0;
                    drawX = (thumbWidth - drawW) / 2;
                }
                ctx.drawImage(imgElement, drawX, drawY, drawW, drawH);
            } else {
                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(0, 0, thumbWidth, thumbHeight);
            }
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2;
            ctx.strokeRect(0, 0, thumbWidth, thumbHeight);
            e.dataTransfer.setDragImage(canvas, thumbWidth / 2, thumbHeight / 2);
        }
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (tool === 'hand' || tool === 'draw' || boxDrag) return;
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (tool === 'hand' || tool === 'draw' || boxDrag) return;

    if (draggingIndex === null || draggingIndex === targetIndex) {
      setDraggingIndex(null);
      return;
    }
    const nextQueue = [...mergeQueue];
    const temp = nextQueue[draggingIndex];
    nextQueue[draggingIndex] = nextQueue[targetIndex];
    nextQueue[targetIndex] = temp;
    onReorder(nextQueue);
    setDraggingIndex(null);
  };

  const handleExport = async (mode: 'copy' | 'download') => {
    if (!contentRef.current || copying) return;
    setCopying(true);
    const prevSelection = selectedBox;
    setSelectedBox(null);
    await new Promise(r => setTimeout(r, 50));

    try {
      const originalNode = contentRef.current;
      const clone = originalNode.cloneNode(true) as HTMLElement;
      
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = `${gridMetrics.totalW}px`;
      container.style.height = `${gridMetrics.totalH}px`;
      container.appendChild(clone);
      document.body.appendChild(container);

      const imgs = Array.from(clone.querySelectorAll('img'));
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(clone, {
        useCORS: true,
        scale: 1, 
        width: gridMetrics.totalW,
        height: gridMetrics.totalH,
        backgroundColor: '#ffffff',
        logging: false
      });

      if (mode === 'copy') {
        canvas.toBlob(async (blob) => {
          if (blob) {
            try {
              const item = new ClipboardItem({ 'image/png': blob });
              await navigator.clipboard.write([item]);
              alert("Image copied to clipboard!");
            } catch (e) {
              const link = document.createElement('a');
              link.href = canvas.toDataURL('image/png');
              link.download = 'merged-output.png';
              link.click();
              alert("Clipboard access restricted. Downloaded instead.");
            }
          }
        }, 'image/png');
      } else {
        const link = document.createElement('a');
        link.download = `merged-${Date.now()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
      }
      document.body.removeChild(container);
    } catch (err) {
      console.error("Export failed", err);
      alert("Failed to generate image.");
    } finally {
      setCopying(false);
      setSelectedBox(prevSelection);
    }
  };

  let cursorClass = 'cursor-default';
  if (tool === 'hand') cursorClass = isPanning ? 'cursor-grabbing' : 'cursor-grab';
  if (tool === 'draw') cursorClass = 'cursor-crosshair';

  const selectedProject = selectedBox ? projects.find(p => p.id === selectedBox.projectId) : null;

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      
      {/* Wrapper for Editor + Sidebar */}
      <div className="flex-1 flex gap-6 min-h-0 overflow-hidden">
        
        {/* Visual Editor Panel */}
        <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
          
          {/* Header Toolbar */}
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-white z-10 h-14 shrink-0">
            <div className="flex items-center gap-4">
              
              {/* Tools Group */}
              <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200 mr-2 shadow-sm">
                <button 
                  onClick={() => setTool('select')}
                  className={`p-1.5 rounded transition-all ${tool === 'select' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  title="Select / Reorder (V)"
                >
                  <MousePointer2 size={16} />
                </button>
                <button 
                  onClick={() => setTool('hand')}
                  className={`p-1.5 rounded transition-all ${tool === 'hand' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  title="Pan Tool (Space)"
                >
                  <Hand size={16} />
                </button>
                <button 
                  onClick={() => setTool('draw')}
                  className={`p-1.5 rounded transition-all ${tool === 'draw' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  title="Draw Box (D)"
                >
                  <PlusSquare size={16} />
                </button>
              </div>

              {/* Zoom Group */}
              <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200 shadow-sm">
                  <button 
                      onClick={() => setZoom(prev => Math.max(0.01, prev * 0.8))}
                      className="p-1.5 hover:bg-slate-50 rounded transition-all text-slate-600"
                      title="Zoom Out"
                  >
                      <ZoomOut size={14} />
                  </button>
                  <span className="text-[10px] font-bold text-slate-900 w-12 text-center tabular-nums">
                      {Math.round(zoom * 100)}%
                  </span>
                  <button 
                      onClick={() => setZoom(prev => Math.min(5, prev * 1.2))}
                      className="p-1.5 hover:bg-slate-50 rounded transition-all text-slate-600"
                      title="Zoom In"
                  >
                      <ZoomIn size={14} />
                  </button>
                  <div className="w-px h-3 bg-slate-200 mx-1" />
                  <button 
                      onClick={fitToView}
                      className="p-1.5 hover:bg-slate-50 rounded transition-all text-slate-600"
                      title="Fit to screen"
                  >
                      <Maximize size={14} />
                  </button>
                  <button 
                      onClick={resetView}
                      className="p-1.5 hover:bg-slate-50 rounded transition-all text-slate-600"
                      title="Reset View (100%)"
                  >
                      <RefreshCw size={14} />
                  </button>
              </div>

              <div className="h-6 w-px bg-slate-200 hidden lg:block mx-1" />
              {/* Grid Configuration */}
              <div className="flex items-center gap-2 bg-slate-50 p-1 rounded-lg border border-slate-200">
                  <div className="flex items-center gap-1 px-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Rows</label>
                      <input 
                      type="number" min="1" max="10" 
                      value={rows} 
                      onChange={(e) => setRows(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-8 bg-transparent text-sm font-bold text-slate-900 outline-none text-center"
                      />
                  </div>
                  <div className="h-4 w-px bg-slate-200" />
                  <div className="flex items-center gap-1 px-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Cols</label>
                      <input 
                      type="number" min="1" max="10" 
                      value={cols} 
                      onChange={(e) => setCols(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-8 bg-transparent text-sm font-bold text-slate-900 outline-none text-center"
                      />
                  </div>
              </div>
            </div>

            {/* Right Actions */}
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleExport('copy')}
                disabled={copying}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 text-slate-900 text-[11px] font-bold rounded shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
                title="Copy to Clipboard"
              >
                {copying ? <Icons.Check size={14} className="text-green-500" /> : <Icons.Copy size={14} />}
                {copying ? '...' : 'Copy'}
              </button>
              <button 
                onClick={() => handleExport('download')}
                disabled={copying}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 text-white text-[11px] font-bold rounded shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
                title="Download PNG"
              >
                <Icons.Download size={14} />
                Export
              </button>
            </div>
          </div>

          {/* Main Workspace Area */}
          <div 
            className={`flex-1 overflow-hidden bg-slate-50 relative z-0 block ${cursorClass}`}
            ref={containerRef}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
            style={{ touchAction: 'none' }}
          >
            <div 
              style={{ 
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: '0 0',
                width: gridMetrics.totalW, 
                height: gridMetrics.totalH,
              }}
              className="bg-white shadow-2xl transition-transform duration-75 ease-out"
            >
              {/* Grid Content */}
              <div 
                ref={contentRef}
                className="w-full h-full bg-white"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, ${gridMetrics.baseW}px)`,
                  gridTemplateRows: `repeat(${rows}, ${gridMetrics.baseH}px)`,
                  gap: '0px'
                }}
              >
                {Array.from({ length: totalSlots }).map((_, idx) => {
                  const projectId = mergeQueue[idx];
                  const project = projects.find(p => p.id === projectId);
                  
                  return (
                    <div 
                      key={`slot-${idx}`}
                      data-idx={idx}
                      onDragOver={(e) => handleDragOver(e, idx)}
                      onDrop={(e) => handleDrop(e, idx)}
                      onDragLeave={() => setDragOverIndex(null)}
                      draggable={tool === 'select' && !!project} // Enabled even if box selected, handled by preventDefault in box mousedown
                      onDragStart={(e) => handleDragStart(e, idx)}
                      onDoubleClick={() => project && onDoubleClick(project.id)}
                      onMouseDown={(e) => {
                        // Deselect box if clicking on the slot background
                        if (tool === 'select') {
                           setSelectedBox(null);
                        }
                      }}
                      style={{ width: gridMetrics.baseW, height: gridMetrics.baseH }}
                      className={`relative bg-white overflow-hidden flex flex-col group box-border ${
                        project 
                          ? draggingIndex === idx 
                            ? 'opacity-50' 
                            : ''
                          : ''
                      } ${dragOverIndex === idx ? 'z-10 ring-4 ring-blue-500 ring-inset' : ''} ${tool === 'select' && project && !selectedBox ? 'cursor-grab active:cursor-grabbing' : ''}`}
                    >
                      {project ? (
                        <div className="relative w-full h-full bg-white pointer-events-none">
                          {project.imageUrl && (
                            <img 
                              src={project.imageUrl} 
                              alt="" 
                              className="w-full h-full object-contain block"
                            />
                          )}
                          
                          {project.imageWidth > 0 && (
                            <svg 
                              className="absolute inset-0 w-full h-full pointer-events-none"
                              viewBox={`0 0 ${project.imageWidth} ${project.imageHeight}`}
                              preserveAspectRatio="xMidYMid meet"
                            >
                              {project.boxes.map((box) => {
                                const color = COLORS[box.cls_id % COLORS.length];
                                const isSelected = selectedBox?.projectId === project.id && selectedBox?.boxId === box.id;
                                const [x1, y1, x2, y2] = box.coordinate;
                                
                                return (
                                  <g key={box.id} className="pointer-events-auto">
                                    <rect 
                                      x={Math.min(box.coordinate[0], box.coordinate[2])} 
                                      y={Math.min(box.coordinate[1], box.coordinate[3])} 
                                      width={Math.abs(box.coordinate[2] - box.coordinate[0])} 
                                      height={Math.abs(box.coordinate[3] - box.coordinate[1])} 
                                      fill={color}
                                      fillOpacity={isSelected ? Math.min(1, boxOpacity + 0.2) : boxOpacity}
                                      stroke={color}
                                      strokeWidth={project.imageWidth / 200}
                                      strokeOpacity={1}
                                      style={{ cursor: tool === 'select' ? 'move' : 'default' }}
                                      onMouseDown={(e) => handleBoxMouseDown(e, project.id, box.id, 'move')}
                                    />
                                    {isSelected && tool === 'select' && !copying && [
                                      [x1, y1], [x2, y1], [x1, y2], [x2, y2]
                                    ].map(([hx, hy], hidx) => (
                                      <circle 
                                        key={hidx}
                                        cx={hx} cy={hy} 
                                        r={project.imageWidth / 100} // Dynamic radius based on image size
                                        fill="white" 
                                        stroke={color} 
                                        strokeWidth={project.imageWidth / 300}
                                        className="cursor-pointer"
                                        style={{ cursor: hidx === 0 || hidx === 3 ? 'nwse-resize' : 'nesw-resize' }}
                                        onMouseDown={(e) => handleBoxMouseDown(e, project.id, box.id, 'handle', hidx)}
                                      />
                                    ))}
                                    {showLabels && (
                                      <text
                                        x={Math.min(box.coordinate[0], box.coordinate[2])}
                                        y={Math.min(box.coordinate[1], box.coordinate[3]) - (project.imageWidth * 0.005)}
                                        fill={color}
                                        fontSize={Math.max(14, project.imageWidth * 0.015)}
                                        fontWeight="bold"
                                        className="pointer-events-none select-none"
                                        style={{ textShadow: '0px 0px 2px white' }}
                                      >
                                        {box.label}
                                      </text>
                                    )}
                                  </g>
                                );
                              })}
                              
                              {/* Drawing Preview */}
                              {isDrawing && drawStart?.projectId === project.id && currentDrawRect && (
                                <rect
                                    x={Math.min(currentDrawRect.x1, currentDrawRect.x2)}
                                    y={Math.min(currentDrawRect.y1, currentDrawRect.y2)}
                                    width={Math.abs(currentDrawRect.x2 - currentDrawRect.x1)}
                                    height={Math.abs(currentDrawRect.y2 - currentDrawRect.y1)}
                                    fill="rgba(37, 99, 235, 0.2)"
                                    stroke="#2563eb"
                                    strokeWidth={project.imageWidth / 200}
                                    strokeDasharray={`${project.imageWidth/100} ${project.imageWidth/200}`}
                                />
                              )}
                            </svg>
                          )}
                          
                          {/* Info Overlay (Hidden if box is selected to reduce clutter) */}
                          {!selectedBox && !isDrawing && (
                              <div className="absolute bottom-4 left-4 max-w-[80%] bg-black/70 backdrop-blur-md px-3 py-1.5 rounded text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                              {project.input_path.split('/').pop()}
                              </div>
                          )}
                        </div>
                      ) : (
                        <div className="w-full h-full flex items-center justify-center border border-slate-100 bg-slate-50/50">
                          <Icons.Plus size={48} className="text-slate-200" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Configuration</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="space-y-4">
               {/* Visual Config */}
               <div className="bg-white p-3 rounded-lg border border-slate-100">
                 <div className="flex items-center justify-between mb-2">
                   <label className="text-[10px] font-bold text-slate-600 uppercase tracking-wide">Box Fill Opacity</label>
                   <span className="text-[10px] font-bold text-slate-900 tabular-nums">{Math.round(boxOpacity * 100)}%</span>
                 </div>
                 <div className="p-2 bg-white border border-slate-100 rounded-md">
                   <input 
                    type="range" min="0" max="1" step="0.05"
                    value={boxOpacity}
                    onChange={(e) => setBoxOpacity(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-slate-900"
                   />
                 </div>
               </div>

               <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-slate-200 shadow-sm">
                  <div className="flex items-center gap-2">
                    {showLabels ? <Eye size={16} className="text-slate-900" /> : <EyeOff size={16} className="text-slate-400" />}
                    <span className="text-xs font-bold text-slate-900 uppercase tracking-tight">Show Labels</span>
                  </div>
                  <button 
                    onClick={() => setShowLabels(!showLabels)}
                    className={`w-10 h-5 rounded-full relative transition-colors duration-200 focus:outline-none ${showLabels ? 'bg-slate-900' : 'bg-slate-200'}`}
                  >
                    <div className={`absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform duration-200 ${showLabels ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
               </div>
            </div>

            <div className="border-t border-slate-100 pt-4 bg-white">
              {selectedBox && selectedProject ? (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200 bg-white">
                    <div className="flex items-center justify-between">
                        <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-wider">Object Properties</h4>
                        <div className="flex items-center gap-1">
                            <button 
                            onClick={deleteSelectedBox}
                            className="text-red-500 hover:text-red-700 transition-colors p-1 bg-white rounded hover:bg-red-50"
                            title="Delete object (Del/Backspace)"
                            >
                            <Trash2 size={14} />
                            </button>
                            <button 
                            onClick={() => setSelectedBox(null)}
                            className="text-slate-400 hover:text-slate-600 transition-colors p-1 bg-white rounded hover:bg-slate-50"
                            title="Deselect"
                            >
                            <X size={14} />
                            </button>
                        </div>
                    </div>

                    {/* Editor Fields */}
                    {(() => {
                        const box = selectedProject.boxes.find(b => b.id === selectedBox.boxId);
                        if (!box) return null;
                        return (
                            <>
                                <div className="grid grid-cols-2 gap-3 bg-white">
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Label</label>
                                        <input 
                                        type="text" 
                                        value={box.label}
                                        onChange={(e) => updateBox(selectedBox.projectId, box.id, { label: e.target.value })}
                                        className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Class ID</label>
                                        <input 
                                        type="number" 
                                        value={box.cls_id}
                                        onChange={(e) => updateBox(selectedBox.projectId, box.id, { cls_id: parseInt(e.target.value) || 0 })}
                                        className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                                        />
                                    </div>
                                </div>
                                
                                <div className="grid grid-cols-2 gap-3 bg-white">
                                    <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">X1</label><input type="number" value={Math.round(box.coordinate[0])} onChange={(e) => { const c=[...box.coordinate] as any; c[0]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                    <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Y1</label><input type="number" value={Math.round(box.coordinate[1])} onChange={(e) => { const c=[...box.coordinate] as any; c[1]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                    <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">X2</label><input type="number" value={Math.round(box.coordinate[2])} onChange={(e) => { const c=[...box.coordinate] as any; c[2]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                    <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Y2</label><input type="number" value={Math.round(box.coordinate[3])} onChange={(e) => { const c=[...box.coordinate] as any; c[3]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                </div>
                            </>
                        );
                    })()}
                </div>
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-8 bg-white">
                  <Icons.Move size={32} className="text-slate-300 mb-2" />
                  <p className="text-[11px] text-slate-500 font-semibold px-4">Select an object in any grid cell to edit its properties</p>
                </div>
              )}
            </div>

            {/* Entity List for Context */}
            <div className="border-t border-slate-100 pt-4 flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">
                        {selectedProject ? 'Entity List (Current)' : 'Entity List'}
                    </h3>
                    <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-bold">
                        {selectedProject ? selectedProject.boxes.length : '-'}
                    </span>
                </div>
                <div className="flex-1 overflow-y-auto bg-slate-50 rounded-lg border border-slate-200">
                    {selectedProject ? (
                        selectedProject.boxes.map((box) => (
                            <div 
                                key={box.id}
                                onClick={() => setSelectedBox({ projectId: selectedProject.id, boxId: box.id })}
                                className={`flex items-center gap-3 px-3 py-2 cursor-pointer border-l-2 transition-colors ${selectedBox?.boxId === box.id ? 'bg-white border-blue-500 shadow-sm' : 'border-transparent hover:bg-slate-100'}`}
                            >
                                <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: COLORS[box.cls_id % COLORS.length] }} />
                                <span className={`text-[10px] font-medium flex-1 truncate ${selectedBox?.boxId === box.id ? 'text-slate-900' : 'text-slate-500'}`}>{box.label}</span>
                            </div>
                        ))
                    ) : (
                        <div className="p-4 text-center text-[10px] text-slate-400 italic">Select an object to view project entities</div>
                    )}
                </div>
            </div>
          </div>
        </div>

      </div>
      
      {/* Footer Info */}
      <div className="shrink-0 p-4 bg-slate-900 rounded-xl flex items-center justify-between shadow-lg text-white">
        <div className="flex items-center gap-3">
          <Icons.LayoutGrid size={16} className="text-blue-400" />
          <span className="text-xs font-medium text-slate-300">
            WYSIWYG Mode: The grid above represents the exact pixel output ({Math.round(gridMetrics.totalW)}x{Math.round(gridMetrics.totalH)}).
          </span>
        </div>
        <div className="flex items-center gap-4">
           <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
             Current View Zoom: {Math.round(zoom * 100)}%
           </span>
        </div>
      </div>
    </div>
  );
};

export default MergeWorkspace;
