
import React, { useRef, useState, useEffect, useMemo, useCallback } from 'react';
import { Project } from '../types';
import { Icons, COLORS } from '../constants';
import html2canvas from 'html2canvas';
import { ZoomIn, ZoomOut, Maximize, Hand, MousePointer2, RefreshCw } from 'lucide-react';

interface MergeWorkspaceProps {
  projects: Project[];
  mergeQueue: (string | null)[];
  rows: number;
  cols: number;
  setRows: (r: number) => void;
  setCols: (c: number) => void;
  onReorder: (ids: (string | null)[]) => void;
  onDoubleClick: (id: string) => void;
  boxOpacity: number;
  showLabels: boolean;
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
  boxOpacity,
  showLabels
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Transform State
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number, y: number } | null>(null);

  // Drag & Drop State
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);

  const totalSlots = rows * cols;

  // 1. Calculate Strict Pixel Metrics based on the FIRST image (Reference)
  const gridMetrics = useMemo(() => {
    // Find the reference project (first occupied slot)
    const firstId = mergeQueue.find(id => id !== null);
    const definingProject = projects.find(p => p.id === firstId);

    // Default to A4-ish ratio if no images exist yet
    const baseW = (definingProject?.imageWidth && definingProject.imageWidth > 0) 
      ? definingProject.imageWidth 
      : 1240; 
      
    const baseH = (definingProject?.imageHeight && definingProject.imageHeight > 0) 
      ? definingProject.imageHeight 
      : 1754; 

    // Total canvas size in real pixels
    const totalW = baseW * cols;
    const totalH = baseH * rows;

    return { baseW, baseH, totalW, totalH };
  }, [mergeQueue, projects, rows, cols]);

  // Fit to View Logic
  const fitToView = useCallback(() => {
    if (!containerRef.current) return;
    const { clientWidth, clientHeight } = containerRef.current;
    const padding = 40; // Space around the canvas
    
    const availW = clientWidth - padding;
    const availH = clientHeight - padding;

    if (gridMetrics.totalW > 0 && gridMetrics.totalH > 0) {
        const scaleW = availW / gridMetrics.totalW;
        const scaleH = availH / gridMetrics.totalH;
        // Allow zooming out significantly or zooming in to 100%, but default to fitting
        const newZoom = Math.min(scaleW, scaleH); 
        
        setZoom(parseFloat(newZoom.toFixed(4)));
        
        // Center the content
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

  // Initial Auto-Scale
  useEffect(() => {
    // Debounce slightly to ensure DOM is ready
    const timer = setTimeout(fitToView, 10);
    window.addEventListener('resize', fitToView);
    return () => {
        clearTimeout(timer);
        window.removeEventListener('resize', fitToView);
    };
  }, [fitToView]);

  // Keyboard Shortcuts (Space for Hand, V for Select)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      
      if (e.code === 'Space' && tool !== 'hand') {
        e.preventDefault();
        setTool('hand');
      }
      if (e.key.toLowerCase() === 'v') setTool('select');
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
  }, [tool]);

  // Mouse Wheel Zoom
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

  // Update queue size when rows/cols change
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

  // --- Pan Handlers ---
  const onMouseDown = (e: React.MouseEvent) => {
    if (tool === 'hand' || e.button === 1) { // Middle click also pans
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panStart) {
      e.preventDefault();
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
    }
  };

  const onMouseUp = () => {
    setIsPanning(false);
    setPanStart(null);
  };

  // --- Drag & Drop Handlers (Only active when tool === 'select') ---
  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (tool === 'hand') {
        e.preventDefault();
        return;
    }
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';

    // Drag Preview Generation
    const projectId = mergeQueue[index];
    const project = projects.find(p => p.id === projectId);
    const slotElement = e.currentTarget as HTMLElement;
    const imgElement = slotElement.querySelector('img');

    if (project) {
        const canvas = document.createElement('canvas');
        const thumbWidth = 200; 
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
                ctx.fillStyle = '#64748b';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('ITEM', thumbWidth / 2, thumbHeight / 2);
            }
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, thumbWidth, thumbHeight);
            e.dataTransfer.setDragImage(canvas, thumbWidth / 2, thumbHeight / 2);
        }
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (tool === 'hand') return;
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (tool === 'hand') return;

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
    }
  };

  let cursorClass = 'cursor-default';
  if (tool === 'hand') cursorClass = isPanning ? 'cursor-grabbing' : 'cursor-grab';

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {/* Visual Editor Panel (Consistent with AnnotationEditor) */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
        
        {/* Header Toolbar */}
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-white z-10">
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
                    draggable={tool === 'select' && !!project}
                    onDragStart={(e) => handleDragStart(e, idx)}
                    onDoubleClick={() => project && onDoubleClick(project.id)}
                    style={{ width: gridMetrics.baseW, height: gridMetrics.baseH }}
                    className={`relative bg-white overflow-hidden flex flex-col group box-border ${
                      project 
                        ? draggingIndex === idx 
                          ? 'opacity-50' 
                          : ''
                        : ''
                    } ${dragOverIndex === idx ? 'z-10 ring-4 ring-blue-500 ring-inset' : ''} ${tool === 'select' && project ? 'cursor-grab active:cursor-grabbing' : ''}`}
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
                            className="absolute inset-0 w-full h-full"
                            viewBox={`0 0 ${project.imageWidth} ${project.imageHeight}`}
                            preserveAspectRatio="xMidYMid meet"
                          >
                            {project.boxes.map((box) => {
                              const color = COLORS[box.cls_id % COLORS.length];
                              return (
                                <g key={box.id}>
                                  <rect 
                                    x={Math.min(box.coordinate[0], box.coordinate[2])} 
                                    y={Math.min(box.coordinate[1], box.coordinate[3])} 
                                    width={Math.abs(box.coordinate[2] - box.coordinate[0])} 
                                    height={Math.abs(box.coordinate[3] - box.coordinate[1])} 
                                    fill={color}
                                    fillOpacity={boxOpacity}
                                    stroke={color}
                                    strokeWidth={project.imageWidth / 200}
                                    strokeOpacity={1}
                                  />
                                  {showLabels && (
                                    <text
                                      x={Math.min(box.coordinate[0], box.coordinate[2])}
                                      y={Math.min(box.coordinate[1], box.coordinate[3]) - (project.imageWidth * 0.005)}
                                      fill={color}
                                      fontSize={Math.max(14, project.imageWidth * 0.015)}
                                      fontWeight="bold"
                                      style={{ textShadow: '0px 0px 2px white' }}
                                    >
                                      {box.label}
                                    </text>
                                  )}
                                </g>
                              );
                            })}
                          </svg>
                        )}

                        {/* Info Overlay */}
                        <div className="absolute bottom-4 left-4 max-w-[80%] bg-black/70 backdrop-blur-md px-3 py-1.5 rounded text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity">
                          {project.input_path.split('/').pop()}
                        </div>
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
