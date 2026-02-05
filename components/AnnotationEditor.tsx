
import React, { useRef, useState, useEffect } from 'react';
import { Project, Box } from '../types';
import { Icons, COLORS } from '../constants';
import { ZoomIn, ZoomOut, Maximize, Eye, EyeOff, Hand, MousePointer2, RefreshCw, Square } from 'lucide-react';

interface AnnotationEditorProps {
  project: Project;
  onUpdate: (boxes: Box[]) => void;
  onImageSet: (url: string | undefined, w: number, h: number) => void;
  boxOpacity: number;
  setBoxOpacity: (o: number) => void;
  showLabels: boolean;
  setShowLabels: (s: boolean) => void;
}

const AnnotationEditor: React.FC<AnnotationEditorProps> = ({ 
  project, 
  onUpdate, 
  onImageSet,
  boxOpacity,
  setBoxOpacity,
  showLabels,
  setShowLabels
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'select' | 'hand'>('select');
  const [isPanning, setIsPanning] = useState(false);
  
  const [customWidth, setCustomWidth] = useState(project.imageWidth || 1224);
  const [customHeight, setCustomHeight] = useState(project.imageHeight || 1584);

  const [dragInfo, setDragInfo] = useState<{ 
    id: string, 
    type: 'move' | 'handle', 
    handle?: number, 
    startPos: { x: number, y: number }, 
    originalCoords: [number, number, number, number] 
  } | null>(null);

  const [panStart, setPanStart] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && tool !== 'hand' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        setTool('hand');
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
  }, [tool]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleNativeWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY > 0 ? -0.15 : 0.15;
        setZoom(prev => {
          const next = Math.min(15, Math.max(0.01, prev + delta * prev));
          return parseFloat(next.toFixed(3));
        });
      }
    };

    container.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => container.removeEventListener('wheel', handleNativeWheel);
  }, []);

  const getVisualScale = () => {
    if (project.imageUrl && imgRef.current) {
      const rect = imgRef.current.getBoundingClientRect();
      return rect.width / project.imageWidth;
    }
    return zoom; 
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        onImageSet(url, img.naturalWidth, img.naturalHeight);
        resetView();
      };
      img.src = url;
    }
  };

  const initializeBlank = () => {
    onImageSet(undefined, customWidth, customHeight);
    resetView();
  };

  const updateBox = (id: string, updates: Partial<Box>) => {
    const newBoxes = project.boxes.map(b => b.id === id ? { ...b, ...updates } : b);
    onUpdate(newBoxes);
  };

  const deleteBox = (id: string) => {
    onUpdate(project.boxes.filter(b => b.id !== id));
    if (selectedBoxId === id) setSelectedBoxId(null);
  };

  const startDragging = (e: React.MouseEvent, id: string, type: 'move' | 'handle', handleIndex?: number) => {
    if (tool === 'hand') return;
    e.stopPropagation();
    const box = project.boxes.find(b => b.id === id);
    if (!box) return;
    setSelectedBoxId(id);
    setDragInfo({
      id,
      type,
      handle: handleIndex,
      startPos: { x: e.clientX, y: e.clientY },
      originalCoords: [...box.coordinate] as [number, number, number, number]
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool === 'hand' || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
    }
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (isPanning && panStart) {
      setOffset({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y
      });
      return;
    }

    if (!dragInfo) return;
    
    const visualScale = project.imageUrl ? getVisualScale() : zoom;
    const dx = (e.clientX - dragInfo.startPos.x) / visualScale;
    const dy = (e.clientY - dragInfo.startPos.y) / visualScale;

    const [x1, y1, x2, y2] = dragInfo.originalCoords;
    let nextCoords: [number, number, number, number] = [x1, y1, x2, y2];

    if (dragInfo.type === 'move') {
      nextCoords = [x1 + dx, y1 + dy, x2 + dx, y2 + dy];
    } else if (dragInfo.type === 'handle') {
      if (dragInfo.handle === 0) nextCoords = [x1 + dx, y1 + dy, x2, y2];
      if (dragInfo.handle === 1) nextCoords = [x1, y1 + dy, x2 + dx, y2];
      if (dragInfo.handle === 2) nextCoords = [x1 + dx, y1, x2, y2 + dy];
      if (dragInfo.handle === 3) nextCoords = [x1, y1, x2 + dx, y2 + dy];
    }

    updateBox(dragInfo.id, { coordinate: nextCoords });
  };

  const onMouseUp = () => {
    setDragInfo(null);
    setIsPanning(false);
    setPanStart(null);
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const fitToView = () => {
    if (containerRef.current && project.imageWidth) {
      const cw = containerRef.current.clientWidth - 64;
      const ch = containerRef.current.clientHeight - 64;
      const scaleX = cw / project.imageWidth;
      const scaleY = ch / project.imageHeight;
      const newZoom = Math.min(scaleX, scaleY);
      setZoom(newZoom);
      setOffset({ x: 0, y: 0 });
    }
  };

  const hasCanvas = project.imageWidth > 0 && project.imageHeight > 0;

  return (
    <div className="flex flex-col lg:flex-row h-full gap-6 select-none overflow-hidden" onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
      {/* Visual Editor */}
      <div className="flex-1 bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col min-h-0">
        <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-white z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1 bg-white rounded-lg p-0.5 border border-slate-200 mr-2 shadow-sm">
              <button 
                onClick={() => setTool('select')}
                className={`p-1.5 rounded transition-all ${tool === 'select' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="Select Tool (V)"
              >
                <MousePointer2 size={16} />
              </button>
              <button 
                onClick={() => setTool('hand')}
                className={`p-1.5 rounded transition-all ${tool === 'hand' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="Hand Tool (Space)"
              >
                <Hand size={16} />
              </button>
            </div>

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
                onClick={() => setZoom(prev => Math.min(15, prev * 1.2))}
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
                title="Reset View"
               >
                 <RefreshCw size={14} />
               </button>
            </div>
          </div>
          <label className="flex items-center gap-2 px-3 py-1 bg-white hover:bg-slate-50 rounded cursor-pointer transition-colors border border-slate-200 shadow-sm">
            <Icons.ImageIcon size={14} className="text-slate-600" />
            <span className="text-[11px] font-semibold text-slate-900">Change Image</span>
            <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
          </label>
        </div>
        
        <div 
          ref={containerRef}
          onMouseDown={onMouseDown}
          className={`flex-1 relative overflow-hidden bg-slate-50 flex items-center justify-center ${tool === 'hand' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : 'cursor-crosshair'}`}
        >
          {hasCanvas ? (
            <div 
              className="relative shadow-2xl bg-white transition-transform duration-75 ease-out flex-shrink-0"
              style={{ 
                width: project.imageWidth,
                height: project.imageHeight,
                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                transformOrigin: 'center' 
              }}
            >
              {project.imageUrl && (
                <img 
                  ref={imgRef}
                  src={project.imageUrl} 
                  alt="Source" 
                  className="w-full h-full pointer-events-none block"
                />
              )}
              <svg 
                className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-visible"
                viewBox={`0 0 ${project.imageWidth} ${project.imageHeight}`}
              >
                {project.boxes.map((box) => {
                  const [x1, y1, x2, y2] = box.coordinate;
                  const color = COLORS[box.cls_id % COLORS.length];
                  const isSelected = selectedBoxId === box.id;
                  
                  const rx = Math.min(x1, x2);
                  const ry = Math.min(y1, y2);
                  const rw = Math.abs(x2 - x1);
                  const rh = Math.abs(y2 - y1);

                  return (
                    <g key={box.id} className={`pointer-events-auto ${tool === 'hand' ? 'pointer-events-none' : 'cursor-pointer'}`}>
                      <rect 
                        x={rx} 
                        y={ry} 
                        width={rw} 
                        height={rh} 
                        fill={color}
                        fillOpacity={isSelected ? Math.min(1, boxOpacity + 0.2) : boxOpacity}
                        stroke={color}
                        strokeWidth={2}
                        onMouseDown={(e) => startDragging(e, box.id, 'move')}
                      />
                      {isSelected && [
                        [x1, y1], [x2, y1], [x1, y2], [x2, y2]
                      ].map(([hx, hy], hidx) => (
                        <circle 
                          key={hidx}
                          cx={hx} cy={hy} 
                          r={6} 
                          fill="white" 
                          stroke={color} 
                          strokeWidth={2}
                          className="cursor-pointer"
                          style={{ cursor: hidx === 0 || hidx === 3 ? 'nwse-resize' : 'nesw-resize' }}
                          onMouseDown={(e) => startDragging(e, box.id, 'handle', hidx)}
                        />
                      ))}
                      {showLabels && (
                        <text 
                          x={rx} 
                          y={ry - 8} 
                          fontSize={14} 
                          fill={color}
                          fontWeight="bold"
                          className="select-none pointer-events-none"
                          style={{ textShadow: '0px 1px 2px rgba(255,255,255,0.8)' }}
                        >
                          {box.label} ({Math.round(box.score * 100)}%)
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center p-12 bg-white rounded-2xl border-2 border-dashed border-slate-200 shadow-sm max-w-sm">
                <Icons.ImageIcon size={64} className="text-slate-200 mx-auto mb-4" />
                <p className="text-sm text-slate-500 font-bold mb-2 uppercase tracking-wide">Image or Canvas Required</p>
                <p className="text-xs text-slate-400 mb-6">Visualization requires an image or defined dimensions.</p>
                
                <div className="space-y-4">
                  <button 
                    onClick={() => (containerRef.current?.parentElement?.parentElement?.querySelector('input[type="file"]') as HTMLInputElement)?.click()}
                    className="w-full px-6 py-2.5 bg-slate-900 text-white text-xs font-bold rounded-lg hover:bg-slate-800 transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                  >
                    <Icons.ImageIcon size={14} />
                    Upload Image
                  </button>
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-slate-100"></span></div>
                    <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400 bg-white px-2">OR</div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="text-left">
                       <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Width</label>
                       <input 
                        type="number" value={customWidth} 
                        onChange={e => setCustomWidth(parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm" 
                       />
                    </div>
                    <div className="text-left">
                       <label className="text-[9px] font-bold text-slate-500 uppercase mb-1 block">Height</label>
                       <input 
                        type="number" value={customHeight} 
                        onChange={e => setCustomHeight(parseInt(e.target.value) || 0)}
                        className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm" 
                       />
                    </div>
                  </div>
                  <button 
                    onClick={initializeBlank}
                    className="w-full px-6 py-2.5 bg-white border border-slate-200 text-slate-900 text-xs font-bold rounded-lg hover:bg-slate-50 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-sm"
                  >
                    <Square size={14} />
                    Start with Blank Canvas
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Control Panel */}
      <div className="w-full lg:w-80 shrink-0 flex flex-col gap-6 min-h-0">
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
          <div className="p-4 border-b border-slate-200 flex items-center justify-between bg-white">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Configuration</h3>
          </div>
          
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="space-y-4">
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

               <div className="border-t border-slate-100 pt-4 bg-white">
                 <h4 className="text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-3">Canvas Dimensions</h4>
                 <div className="grid grid-cols-2 gap-3 p-1 bg-white">
                   <div className="bg-white">
                     <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Width</label>
                     <input 
                       type="number" 
                       value={project.imageWidth}
                       onChange={e => onImageSet(project.imageUrl, parseInt(e.target.value) || 0, project.imageHeight)}
                       className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                     />
                   </div>
                   <div className="bg-white">
                     <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Height</label>
                     <input 
                       type="number" 
                       value={project.imageHeight}
                       onChange={e => onImageSet(project.imageUrl, project.imageWidth, parseInt(e.target.value) || 0)}
                       className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                     />
                   </div>
                 </div>
                 {project.imageUrl && (
                    <button 
                      onClick={() => onImageSet(undefined, project.imageWidth, project.imageHeight)}
                      className="mt-3 w-full py-1.5 border border-slate-200 text-red-600 text-[10px] font-bold rounded hover:bg-red-50 transition-colors uppercase shadow-sm bg-white"
                    >
                      Clear Image (Keep Canvas)
                    </button>
                 )}
               </div>
            </div>

            <div className="border-t border-slate-100 pt-4 bg-white">
              {selectedBoxId ? (
                (() => {
                  const box = project.boxes.find(b => b.id === selectedBoxId);
                  if (!box) return null;
                  return (
                    <div className="space-y-4 animate-in fade-in slide-in-from-right-2 duration-200 bg-white">
                      <div className="flex items-center justify-between">
                         <h4 className="text-[10px] font-bold text-slate-900 uppercase tracking-wider">Object Properties</h4>
                         <button 
                          onClick={() => deleteBox(selectedBoxId)}
                          className="text-red-500 hover:text-red-700 transition-colors p-1 bg-white rounded"
                          title="Delete object"
                        >
                          <Icons.Trash2 size={14} />
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-3 bg-white">
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Label</label>
                          <input 
                            type="text" 
                            value={box.label}
                            onChange={(e) => updateBox(box.id, { label: e.target.value })}
                            className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Class ID (cls_id)</label>
                          <input 
                            type="number" 
                            value={box.cls_id}
                            onChange={(e) => updateBox(box.id, { cls_id: parseInt(e.target.value) || 0 })}
                            className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                          />
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-3 bg-white">
                        <div className="bg-white">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">X1</label>
                          <input 
                            type="number" 
                            value={Math.round(box.coordinate[0])}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const coords = [...box.coordinate] as [number, number, number, number];
                              coords[0] = val;
                              updateBox(box.id, { coordinate: coords });
                            }}
                            className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                          />
                        </div>
                        <div className="bg-white">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Y1</label>
                          <input 
                            type="number" 
                            value={Math.round(box.coordinate[1])}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const coords = [...box.coordinate] as [number, number, number, number];
                              coords[1] = val;
                              updateBox(box.id, { coordinate: coords });
                            }}
                            className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 bg-white">
                        <div className="bg-white">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">X2</label>
                          <input 
                            type="number" 
                            value={Math.round(box.coordinate[2])}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const coords = [...box.coordinate] as [number, number, number, number];
                              coords[2] = val;
                              updateBox(box.id, { coordinate: coords });
                            }}
                            className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                          />
                        </div>
                        <div className="bg-white">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Y2</label>
                          <input 
                            type="number" 
                            value={Math.round(box.coordinate[3])}
                            onChange={(e) => {
                              const val = parseInt(e.target.value);
                              const coords = [...box.coordinate] as [number, number, number, number];
                              coords[3] = val;
                              updateBox(box.id, { coordinate: coords });
                            }}
                            className="w-full px-2 py-1.5 bg-white text-slate-900 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500 shadow-sm"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })()
              ) : (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-50 py-8 bg-white">
                  <Icons.Move size={32} className="text-slate-300 mb-2" />
                  <p className="text-[11px] text-slate-500 font-semibold px-4">Select an object on the canvas to edit its metadata</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-48 min-h-0">
           <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
            <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">Entity List</h3>
            <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-bold">{project.boxes.length}</span>
          </div>
          <div className="flex-1 overflow-y-auto bg-white">
            {project.boxes.length > 0 ? (
              project.boxes.map((box) => (
                <div 
                 key={box.id}
                 onClick={() => setSelectedBoxId(box.id)}
                 className={`flex items-center gap-3 px-4 py-2 cursor-pointer border-l-2 transition-colors ${selectedBoxId === box.id ? 'bg-slate-50 border-slate-900' : 'border-transparent hover:bg-slate-50'}`}
                >
                  <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: COLORS[box.cls_id % COLORS.length] }} />
                  <span className={`text-[11px] font-semibold flex-1 truncate ${selectedBoxId === box.id ? 'text-slate-900' : 'text-slate-700'}`}>{box.label}</span>
                  <span className="text-[10px] text-slate-400 tabular-nums font-medium">cls: {box.cls_id}</span>
                </div>
              ))
            ) : (
              <div className="h-full flex items-center justify-center text-[10px] text-slate-400 italic bg-white">No entities found</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AnnotationEditor;
