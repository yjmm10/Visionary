
import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Project, LayoutFormat } from '../types';
import { Icons, LAYOUT_CONFIGS, COLORS } from '../constants';
import html2canvas from 'html2canvas';

interface MergeWorkspaceProps {
  projects: Project[];
  mergeQueue: (string | null)[];
  layout: LayoutFormat;
  customRows: number;
  customCols: number;
  setLayout: (l: LayoutFormat) => void;
  setCustomRows: (r: number) => void;
  setCustomCols: (c: number) => void;
  onReorder: (ids: (string | null)[]) => void;
  onDoubleClick: (id: string) => void;
  boxOpacity: number;
  showLabels: boolean;
}

const MergeWorkspace: React.FC<MergeWorkspaceProps> = ({ 
  projects, 
  mergeQueue, 
  layout, 
  customRows, 
  customCols,
  setLayout,
  setCustomRows,
  setCustomCols,
  onReorder,
  onDoubleClick,
  boxOpacity,
  showLabels
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [copying, setCopying] = useState(false);
  const [scale, setScale] = useState(1);

  const { rows, cols } = layout === 'custom' ? { rows: customRows, cols: customCols } : LAYOUT_CONFIGS[layout];
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

  // 2. Auto-Scale the view to fit the container
  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      const { clientWidth, clientHeight } = containerRef.current;
      const padding = 40; // Space around the canvas
      
      const availW = clientWidth - padding;
      const availH = clientHeight - padding;

      const scaleW = availW / gridMetrics.totalW;
      const scaleH = availH / gridMetrics.totalH;

      // Fit entire image within container
      setScale(Math.min(scaleW, scaleH, 1.0)); 
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [gridMetrics.totalW, gridMetrics.totalH]);

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

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggingIndex(index);
    e.dataTransfer.effectAllowed = 'move';

    // OPTIMIZATION: Create a small thumbnail for the drag image
    // This prevents the browser from creating a massive ghost image from the full-res DOM element
    const projectId = mergeQueue[index];
    const project = projects.find(p => p.id === projectId);
    const slotElement = e.currentTarget as HTMLElement;
    const imgElement = slotElement.querySelector('img');

    if (project) {
        const canvas = document.createElement('canvas');
        const thumbWidth = 200; // Manageable drag preview width
        const ratio = gridMetrics.baseH / gridMetrics.baseW;
        const thumbHeight = thumbWidth * ratio;

        canvas.width = thumbWidth;
        canvas.height = thumbHeight;

        const ctx = canvas.getContext('2d');
        if (ctx) {
            // Background
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, thumbWidth, thumbHeight);

            // Draw Image
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
                // Placeholder
                ctx.fillStyle = '#e2e8f0';
                ctx.fillRect(0, 0, thumbWidth, thumbHeight);
                ctx.fillStyle = '#64748b';
                ctx.font = 'bold 16px sans-serif';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText('ITEM', thumbWidth / 2, thumbHeight / 2);
            }

            // Border
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 4;
            ctx.strokeRect(0, 0, thumbWidth, thumbHeight);

            e.dataTransfer.setDragImage(canvas, thumbWidth / 2, thumbHeight / 2);
        }
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
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
      // We clone the high-res DOM node to a hidden container to capture it without the CSS transform scaling
      const originalNode = contentRef.current;
      const clone = originalNode.cloneNode(true) as HTMLElement;
      
      // Setup hidden container
      const container = document.createElement('div');
      container.style.position = 'absolute';
      container.style.top = '-9999px';
      container.style.left = '-9999px';
      container.style.width = `${gridMetrics.totalW}px`;
      container.style.height = `${gridMetrics.totalH}px`;
      container.appendChild(clone);
      document.body.appendChild(container);

      // Ensure images in clone are loaded (since we cloned nodes)
      const imgs = Array.from(clone.querySelectorAll('img'));
      await Promise.all(imgs.map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise((resolve) => {
          img.onload = resolve;
          img.onerror = resolve;
        });
      }));

      // Wait a tick for layout
      await new Promise(r => setTimeout(r, 100));

      const canvas = await html2canvas(clone, {
        useCORS: true,
        scale: 1, // 1:1 scale because the DOM is already full resolution
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

  return (
    <div className="h-full flex flex-col gap-6 overflow-hidden">
      {/* Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 shrink-0 bg-white p-4 rounded-xl border border-slate-200 shadow-sm z-20">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-500 uppercase mb-1">Layout Preset</label>
            <select 
              value={layout} 
              onChange={(e) => setLayout(e.target.value as LayoutFormat)}
              className="bg-white border border-slate-300 rounded px-3 py-1.5 text-xs font-bold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 shadow-sm"
            >
              {Object.keys(LAYOUT_CONFIGS).map(k => (
                <option key={k} value={k}>{k.toUpperCase()}</option>
              ))}
            </select>
          </div>

          {layout === 'custom' && (
            <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-2 duration-300">
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1">Rows</label>
                <input 
                  type="number" min="1" max="10" 
                  value={customRows} 
                  onChange={(e) => setCustomRows(parseInt(e.target.value) || 1)}
                  className="w-16 bg-white border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-900 shadow-sm outline-none"
                />
              </div>
              <div className="flex flex-col">
                <label className="text-[10px] font-bold text-slate-500 uppercase mb-1">Cols</label>
                <input 
                  type="number" min="1" max="10" 
                  value={customCols} 
                  onChange={(e) => setCustomCols(parseInt(e.target.value) || 1)}
                  className="w-16 bg-white border border-slate-300 rounded px-2 py-1.5 text-xs font-bold text-slate-900 shadow-sm outline-none"
                />
              </div>
            </div>
          )}
          
          <div className="h-8 w-px bg-slate-200 hidden lg:block" />
          
          <div className="flex flex-col">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Ref. Cell Size</label>
            <p className="text-xs font-bold text-slate-900 tabular-nums">
              {Math.round(gridMetrics.baseW)} × {Math.round(gridMetrics.baseH)} px
            </p>
          </div>

          <div className="flex flex-col border-l border-slate-200 pl-4 ml-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase mb-1">Output Resolution</label>
            <p className="text-xs font-bold text-slate-900 tabular-nums text-blue-600">
              {Math.round(gridMetrics.totalW)} × {Math.round(gridMetrics.totalH)} px
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button 
            onClick={() => handleExport('copy')}
            disabled={copying}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-900 text-xs font-bold rounded shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            {copying ? <Icons.Check size={14} className="text-green-500" /> : <Icons.Copy size={14} />}
            {copying ? 'Processing...' : 'Copy Image'}
          </button>
          <button 
            onClick={() => handleExport('download')}
            disabled={copying}
            className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded shadow-sm hover:shadow-md transition-all active:scale-95 disabled:opacity-50"
          >
            <Icons.Download size={14} />
            Download PNG
          </button>
        </div>
      </div>

      {/* Main Workspace - Rendered at SCALE */}
      <div 
        className="flex-1 overflow-hidden flex items-center justify-center p-8 bg-slate-100 rounded-2xl border border-slate-200 border-dashed relative z-0"
        ref={containerRef}
      >
        <div 
          style={{ 
            width: gridMetrics.totalW, 
            height: gridMetrics.totalH,
            transform: `scale(${scale})`,
            transformOrigin: 'center center'
          }}
          className="bg-white shadow-2xl transition-transform duration-200 ease-out"
        >
          {/* This contentRef contains the EXACT pixel structure that will be exported */}
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
                  draggable={!!project}
                  onDragStart={(e) => handleDragStart(e, idx)}
                  onDoubleClick={() => project && onDoubleClick(project.id)}
                  style={{ width: gridMetrics.baseW, height: gridMetrics.baseH }}
                  className={`relative bg-white overflow-hidden flex flex-col group box-border ${
                    project 
                      ? draggingIndex === idx 
                        ? 'opacity-50' 
                        : ''
                      : ''
                  } ${dragOverIndex === idx ? 'z-10 ring-4 ring-blue-500 ring-inset' : ''}`}
                >
                  {project ? (
                    <div className="relative w-full h-full bg-white">
                      {project.imageUrl && (
                        <img 
                          src={project.imageUrl} 
                          alt="" 
                          className="w-full h-full object-contain pointer-events-none block"
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
                                  strokeWidth={project.imageWidth / 200} // Tuned stroke width
                                  strokeOpacity={1}
                                />
                                {showLabels && (
                                  <text
                                    x={Math.min(box.coordinate[0], box.coordinate[2])}
                                    y={Math.min(box.coordinate[1], box.coordinate[3]) - (project.imageWidth * 0.005)}
                                    fill={color}
                                    fontSize={Math.max(14, project.imageWidth * 0.015)} // Dynamic but minimum 14px
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

                      {/* Hover Overlay for Info (Hidden during export usually, but safer to hide via opacity) */}
                      <div className="absolute bottom-4 left-4 max-w-[80%] bg-black/70 backdrop-blur-md px-3 py-1.5 rounded text-white text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
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
             Current View Scale: {Math.round(scale * 100)}%
           </span>
        </div>
      </div>
    </div>
  );
};

export default MergeWorkspace;
