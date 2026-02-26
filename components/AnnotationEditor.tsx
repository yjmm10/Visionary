
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { Project, Box } from '../types';
import { Icons, COLORS } from '../constants';
import { ZoomIn, ZoomOut, Maximize, Eye, EyeOff, Hand, MousePointer2, RefreshCw, Square, PlusSquare, Download } from 'lucide-react';
import html2canvas from 'html2canvas';

interface AnnotationEditorProps {
  project: Project;
  onUpdate: (boxes: Box[]) => void;
  onImageSet: (url: string | undefined, w: number, h: number) => void;
  boxOpacity: number;
  setBoxOpacity: (o: number) => void;
  showLabels: boolean;
  setShowLabels: (s: boolean) => void;
  onRecordHistory?: () => void;
  boxClipboard?: Box | null;
  onCopyBox?: (box: Box) => void;
}

const AnnotationEditor: React.FC<AnnotationEditorProps> = ({ 
  project, 
  onUpdate, 
  onImageSet,
  boxOpacity,
  setBoxOpacity,
  showLabels,
  setShowLabels,
  onRecordHistory,
  boxClipboard,
  onCopyBox
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'select' | 'hand' | 'draw'>('select');
  const [isPanning, setIsPanning] = useState(false);
  
  // Drawing State
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number, y: number } | null>(null);
  const [currentDrawRect, setCurrentDrawRect] = useState<{ x1: number, y1: number, x2: number, y2: number } | null>(null);

  const [customWidth, setCustomWidth] = useState(project.imageWidth || 1224);
  const [customHeight, setCustomHeight] = useState(project.imageHeight || 1584);

  const [dragInfo, setDragInfo] = useState<{ 
    id: string, 
    type: 'move' | 'handle', 
    handle?: number, 
    startPos: { x: number, y: number }, 
    originalCoords: [number, number, number, number],
    aspectRatio?: number
  } | null>(null);

  const [panStart, setPanStart] = useState<{ x: number, y: number } | null>(null);
  
  // Snapping State
  const [snapLines, setSnapLines] = useState<{ type: 'vertical' | 'horizontal', position: number, start: number, end: number }[]>([]);

  const getSnappedCoordinates = (
    currentBox: Box, 
    allBoxes: Box[], 
    threshold: number = 5
  ): { nextCoords: [number, number, number, number], lines: typeof snapLines } => {
      const [x1, y1, x2, y2] = currentBox.coordinate;
      const w = x2 - x1;
      const h = y2 - y1;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;

      let nx1 = x1, nx2 = x2, ny1 = y1, ny2 = y2;
      const lines: typeof snapLines = [];

      // Helper to check snap
      const checkSnap = (val: number, type: 'vertical' | 'horizontal') => {
          let snappedVal = val;
          let snapped = false;
          let snapStart = 0, snapEnd = 0;

          for (const other of allBoxes) {
              if (other.id === currentBox.id) continue;
              const [ox1, oy1, ox2, oy2] = other.coordinate;
              const ocx = (ox1 + ox2) / 2;
              const ocy = (oy1 + oy2) / 2;

              const targets = type === 'vertical' 
                  ? [ox1, ox2, ocx] 
                  : [oy1, oy2, ocy];
              
              const otherStart = type === 'vertical' ? Math.min(oy1, oy2) : Math.min(ox1, ox2);
              const otherEnd = type === 'vertical' ? Math.max(oy1, oy2) : Math.max(ox1, ox2);

              for (const target of targets) {
                  if (Math.abs(val - target) < threshold) {
                      snappedVal = target;
                      snapped = true;
                      snapStart = otherStart;
                      snapEnd = otherEnd;
                      break;
                  }
              }
              if (snapped) break;
          }
          return { snappedVal, snapped, snapStart, snapEnd };
      };

      // X-Axis Snapping (Vertical Lines)
      const snapX1 = checkSnap(x1, 'vertical');
      const snapX2 = checkSnap(x2, 'vertical');
      const snapCX = checkSnap(cx, 'vertical');

      if (snapX1.snapped) {
          const diff = snapX1.snappedVal - x1;
          nx1 += diff; nx2 += diff;
          lines.push({ type: 'vertical', position: nx1, start: Math.min(y1, snapX1.snapStart), end: Math.max(y2, snapX1.snapEnd) });
      } else if (snapX2.snapped) {
          const diff = snapX2.snappedVal - x2;
          nx1 += diff; nx2 += diff;
          lines.push({ type: 'vertical', position: nx2, start: Math.min(y1, snapX2.snapStart), end: Math.max(y2, snapX2.snapEnd) });
      } else if (snapCX.snapped) {
          const diff = snapCX.snappedVal - cx;
          nx1 += diff; nx2 += diff;
          lines.push({ type: 'vertical', position: (nx1 + nx2) / 2, start: Math.min(y1, snapCX.snapStart), end: Math.max(y2, snapCX.snapEnd) });
      }

      // Y-Axis Snapping (Horizontal Lines)
      const snapY1 = checkSnap(y1, 'horizontal');
      const snapY2 = checkSnap(y2, 'horizontal');
      const snapCY = checkSnap(cy, 'horizontal');

      if (snapY1.snapped) {
          const diff = snapY1.snappedVal - y1;
          ny1 += diff; ny2 += diff;
          lines.push({ type: 'horizontal', position: ny1, start: Math.min(x1, snapY1.snapStart), end: Math.max(x2, snapY1.snapEnd) });
      } else if (snapY2.snapped) {
          const diff = snapY2.snappedVal - y2;
          ny1 += diff; ny2 += diff;
          lines.push({ type: 'horizontal', position: ny2, start: Math.min(x1, snapY2.snapStart), end: Math.max(x2, snapY2.snapEnd) });
      } else if (snapCY.snapped) {
          const diff = snapCY.snappedVal - cy;
          ny1 += diff; ny2 += diff;
          lines.push({ type: 'horizontal', position: (ny1 + ny2) / 2, start: Math.min(x1, snapCY.snapStart), end: Math.max(x2, snapCY.snapEnd) });
      }

      return { nextCoords: [nx1, ny1, nx2, ny2], lines };
  };

  const fitToView = useCallback(() => {
    if (containerRef.current && project.imageWidth > 0 && project.imageHeight > 0) {
      const cw = containerRef.current.clientWidth - 64;
      const ch = containerRef.current.clientHeight - 64;
      if (cw > 0 && ch > 0) {
        const scaleX = cw / project.imageWidth;
        const scaleY = ch / project.imageHeight;
        const newZoom = Math.min(scaleX, scaleY);
        setZoom(parseFloat(newZoom.toFixed(4)));
        setOffset({ x: 0, y: 0 });
      }
    }
  }, [project.imageWidth, project.imageHeight]);

  // Initial Fit to Screen when project loads
  useEffect(() => {
    // Small timeout ensures container is rendered and has dimensions
    const timer = setTimeout(() => {
      fitToView();
    }, 10);
    return () => clearTimeout(timer);
  }, [project.id, fitToView]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT') return;
      
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (e.code === 'Space' && tool !== 'hand') {
        e.preventDefault();
        setTool('hand');
      }
      if (e.key.toLowerCase() === 'v' && !isCmdOrCtrl) setTool('select');
      if (e.key.toLowerCase() === 'd' && !isCmdOrCtrl) setTool('draw');
      
      // Delete shortcut
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBoxId) {
         if (onRecordHistory) onRecordHistory();
         deleteBox(selectedBoxId);
      }

      // Keyboard Move with Arrow Keys
      if (selectedBoxId && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const box = project.boxes.find(b => b.id === selectedBoxId);
          if (box) {
              if (onRecordHistory) onRecordHistory();
              
              // Step size: Shift=10, Ctrl/Meta=0.1, Default=1
              const step = e.shiftKey ? 10 : (e.ctrlKey || e.metaKey ? 0.1 : 1);
              let dx = 0;
              let dy = 0;

              if (e.key === 'ArrowUp') dy = -step;
              if (e.key === 'ArrowDown') dy = step;
              if (e.key === 'ArrowLeft') dx = -step;
              if (e.key === 'ArrowRight') dx = step;

              let nextCoords: [number, number, number, number] = [
                  box.coordinate[0] + dx,
                  box.coordinate[1] + dy,
                  box.coordinate[2] + dx,
                  box.coordinate[3] + dy
              ];
              
              // Apply Snapping if not holding Alt (Alt disables snap)
              if (!e.altKey) {
                  const snapped = getSnappedCoordinates({ ...box, coordinate: nextCoords }, project.boxes, 5 / zoom);
                  
                  // Anti-Stick & Directional Snap Logic:
                  // 1. If snap opposes movement, reject it (Anti-Stick).
                  // 2. If we are moving ONLY horizontally (dy=0), REJECT vertical snaps.
                  // 3. If we are moving ONLY vertically (dx=0), REJECT horizontal snaps.
                  
                  const [sx1, sy1, sx2, sy2] = snapped.nextCoords;
                  const [rx1, ry1, rx2, ry2] = nextCoords;

                  // Check X axis snap
                  const snapDiffX = sx1 - rx1;
                  // Reject if:
                  // - We are NOT moving horizontally (dx=0) -> Don't snap X
                  // - Snap opposes movement (Anti-Stick)
                  if (dx === 0 || (snapDiffX !== 0 && (snapDiffX * dx < 0))) {
                      snapped.nextCoords[0] = rx1;
                      snapped.nextCoords[2] = rx2;
                      snapped.lines = snapped.lines.filter(l => l.type !== 'vertical');
                  }

                  // Check Y axis snap
                  const snapDiffY = sy1 - ry1;
                  // Reject if:
                  // - We are NOT moving vertically (dy=0) -> Don't snap Y
                  // - Snap opposes movement (Anti-Stick)
                  if (dy === 0 || (snapDiffY !== 0 && (snapDiffY * dy < 0))) {
                      snapped.nextCoords[1] = ry1;
                      snapped.nextCoords[3] = ry2;
                      snapped.lines = snapped.lines.filter(l => l.type !== 'horizontal');
                  }

                  nextCoords = snapped.nextCoords;
                  setSnapLines(snapped.lines);
                  
                  // Clear snap lines after a short delay
                  setTimeout(() => setSnapLines([]), 1000);
              }

              updateBox(box.id, { coordinate: nextCoords });
          }
      }

      // Box Copy - Handled in Capture phase to prevent App from seeing it
      if (isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        if (selectedBoxId && onCopyBox) {
          const box = project.boxes.find(b => b.id === selectedBoxId);
          if (box) {
            e.preventDefault();
            e.stopPropagation(); // Stop bubbling
            onCopyBox(box);
          }
        }
      }

      // Box Paste - Handled in Capture phase to prevent App from seeing it
      if (isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        if (boxClipboard) {
            e.preventDefault();
            e.stopPropagation(); // Stop bubbling
            
            if (onRecordHistory) onRecordHistory();

            const width = Math.abs(boxClipboard.coordinate[2] - boxClipboard.coordinate[0]);
            const height = Math.abs(boxClipboard.coordinate[3] - boxClipboard.coordinate[1]);
            const offsetAmt = 30; // 30px offset

            const newBox: Box = {
                ...boxClipboard,
                id: `box-copy-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                coordinate: [
                    boxClipboard.coordinate[0] + offsetAmt,
                    boxClipboard.coordinate[1] + offsetAmt,
                    boxClipboard.coordinate[2] + offsetAmt,
                    boxClipboard.coordinate[3] + offsetAmt
                ]
            };
            
            onUpdate([...project.boxes, newBox]);
            setSelectedBoxId(newBox.id);
        }
      }
    };
    
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && tool === 'hand') {
        setTool('select');
      }
    };

    // Use capture: true to intercept events before App.tsx handles them
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [tool, selectedBoxId, onRecordHistory, boxClipboard, onCopyBox, project.boxes]);

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

  const getCanvasCoords = (clientX: number, clientY: number) => {
    if (!canvasRef.current) return null;
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = rect.width / project.imageWidth;
    
    return {
        x: (clientX - rect.left) / scale,
        y: (clientY - rect.top) / scale
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        onImageSet(url, img.naturalWidth, img.naturalHeight);
        // We can trigger fitToView here effectively by updating props which triggers the effect, 
        // or just rely on imageWidth/Height change triggering the callback dependency and effect.
      };
      img.src = url;
    }
  };

  const initializeBlank = () => {
    onImageSet(undefined, customWidth, customHeight);
    // State update will trigger effect
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
    if (tool === 'hand' || tool === 'draw') return;
    
    e.stopPropagation();
    
    // Record History before starting modification
    if (onRecordHistory) onRecordHistory();

    const box = project.boxes.find(b => b.id === id);
    if (!box) return;
    
    const [x1, y1, x2, y2] = box.coordinate;
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const aspectRatio = height > 0 ? width / height : 1;

    setSelectedBoxId(id);
    setDragInfo({
      id,
      type,
      handle: handleIndex,
      startPos: { x: e.clientX, y: e.clientY },
      originalCoords: [...box.coordinate] as [number, number, number, number],
      aspectRatio
    });
  };

  const onMouseDown = (e: React.MouseEvent) => {
    if (tool === 'hand' || e.button === 1) {
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    if (tool === 'draw') {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (coords) {
            setIsDrawing(true);
            setDrawStart(coords);
            setCurrentDrawRect({ x1: coords.x, y1: coords.y, x2: coords.x, y2: coords.y });
            setSelectedBoxId(null);
        }
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

    if (isDrawing && drawStart) {
        const coords = getCanvasCoords(e.clientX, e.clientY);
        if (coords) {
            setCurrentDrawRect({
                x1: drawStart.x,
                y1: drawStart.y,
                x2: coords.x,
                y2: coords.y
            });
        }
        return;
    }

    if (!dragInfo) return;
    
    const visualScale = project.imageUrl ? getVisualScale() : zoom;
    const dx = (e.clientX - dragInfo.startPos.x) / visualScale;
    const dy = (e.clientY - dragInfo.startPos.y) / visualScale;

    const [x1, y1, x2, y2] = dragInfo.originalCoords;
    let nextCoords: [number, number, number, number] = [x1, y1, x2, y2];

    if (dragInfo.type === 'move') {
      let constrainedDx = dx;
      let constrainedDy = dy;

      // Shift key constrains movement to horizontal or vertical axis
      if (e.shiftKey) {
          // Determine dominant axis
          if (Math.abs(dx) > Math.abs(dy)) {
              constrainedDy = 0; // Lock Y, move X only
          } else {
              constrainedDx = 0; // Lock X, move Y only
          }
      }

      let rawNextCoords: [number, number, number, number] = [
          x1 + constrainedDx, 
          y1 + constrainedDy, 
          x2 + constrainedDx, 
          y2 + constrainedDy
      ];
      
      // Apply Snapping
      const snapped = getSnappedCoordinates(
          { ...project.boxes.find(b => b.id === dragInfo.id)!, coordinate: rawNextCoords }, 
          project.boxes, 
          5 / visualScale
      );
      
      // If Shift is held, we must RE-ENFORCE the constraint AFTER snapping
      // Snapping might try to pull us off-axis, which we don't want if Shift is held.
      if (e.shiftKey) {
          if (constrainedDy === 0) {
              // We are moving horizontally.
              // Force Y to remain at original Y (y1, y2)
              // We can allow X snapping, but Y must be reset.
              snapped.nextCoords[1] = y1;
              snapped.nextCoords[3] = y2;
              // Remove horizontal snap lines (since we are not snapping Y)
              snapped.lines = snapped.lines.filter(l => l.type !== 'horizontal');
          } else {
              // We are moving vertically.
              // Force X to remain at original X (x1, x2)
              snapped.nextCoords[0] = x1;
              snapped.nextCoords[2] = x2;
              // Remove vertical snap lines
              snapped.lines = snapped.lines.filter(l => l.type !== 'vertical');
          }
      }

      nextCoords = snapped.nextCoords;
      setSnapLines(snapped.lines);

    } else if (dragInfo.type === 'handle') {
      // Handles: 
      // 0=TL, 1=TR, 2=BL, 3=BR
      // 4=T, 5=R, 6=B, 7=L
      let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;
      
      // Basic Resize Logic
      // Corners
      if (dragInfo.handle === 0) { nx1 += dx; ny1 += dy; }
      if (dragInfo.handle === 1) { nx2 += dx; ny1 += dy; }
      if (dragInfo.handle === 2) { nx1 += dx; ny2 += dy; }
      if (dragInfo.handle === 3) { nx2 += dx; ny2 += dy; }
      
      // Edges (Single Dimension)
      if (dragInfo.handle === 4) { ny1 += dy; } // Top
      if (dragInfo.handle === 5) { nx2 += dx; } // Right
      if (dragInfo.handle === 6) { ny2 += dy; } // Bottom
      if (dragInfo.handle === 7) { nx1 += dx; } // Left

      // Aspect Ratio Constraint (Shift Key) - Only applies to corners for intuitive scaling
      if (e.shiftKey && dragInfo.aspectRatio && dragInfo.handle !== undefined && dragInfo.handle < 4) {
          const newW = Math.abs(nx2 - nx1);
          const newH = Math.abs(ny2 - ny1);
          
          if (dragInfo.handle === 0) { // Top-Left
             const constrainedH = newW / dragInfo.aspectRatio;
             ny1 = ny2 - constrainedH;
          } else if (dragInfo.handle === 1) { // Top-Right
             const constrainedH = newW / dragInfo.aspectRatio;
             ny1 = ny2 - constrainedH;
          } else if (dragInfo.handle === 2) { // Bottom-Left
             const constrainedH = newW / dragInfo.aspectRatio;
             ny2 = ny1 + constrainedH;
          } else if (dragInfo.handle === 3) { // Bottom-Right
             const constrainedH = newW / dragInfo.aspectRatio;
             ny2 = ny1 + constrainedH;
          }
      }

      nextCoords = [nx1, ny1, nx2, ny2];
    }

    updateBox(dragInfo.id, { coordinate: nextCoords });
  };

  const onMouseUp = () => {
    if (isDrawing && currentDrawRect) {
        if (onRecordHistory) onRecordHistory(); // Record before creating new box (technically on mouse down for draw would be better but this works for creation step)
        
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
            onUpdate([...project.boxes, newBox]);
            setSelectedBoxId(newBox.id);
        }
    }

    setDragInfo(null);
    setIsPanning(false);
    setPanStart(null);
    setIsDrawing(false);
    setDrawStart(null);
    setCurrentDrawRect(null);
    setSnapLines([]);
  };

  const resetView = () => {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
  };

  const handleSaveImage = async () => {
    if (!canvasRef.current) return;
    
    // Deselect to avoid capturing handles
    const prevSelected = selectedBoxId;
    setSelectedBoxId(null);
    
    // Wait for render cycle
    await new Promise(resolve => setTimeout(resolve, 50));

    try {
      const canvas = await html2canvas(canvasRef.current, {
        useCORS: true,
        scale: 2, // Better quality
        logging: false,
        backgroundColor: '#ffffff'
      });

      const link = document.createElement('a');
      
      // Determine filename
      let filename = 'annotation_output.png';
      if (project.input_path) {
          // Extract filename from path (e.g., "path/to/image.jpg" -> "image")
          const basename = project.input_path.split(/[/\\]/).pop() || 'image';
          // Remove extension
          const nameWithoutExt = basename.replace(/\.[^/.]+$/, "");
          filename = `${nameWithoutExt}_annotated.png`;
      } else {
          filename = `project_${project.id}.png`;
      }

      link.download = filename;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err) {
      console.error("Failed to save image:", err);
      alert("Failed to save image.");
    } finally {
        // Restore selection
        if (prevSelected) setSelectedBoxId(prevSelected);
    }
  };

  const hasCanvas = project.imageWidth > 0 && project.imageHeight > 0;
  
  let cursorClass = 'cursor-default';
  if (tool === 'hand') cursorClass = isPanning ? 'cursor-grabbing' : 'cursor-grab';
  else if (tool === 'draw') cursorClass = 'cursor-crosshair';
  else if (tool === 'select') cursorClass = 'cursor-default';

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
              <button 
                onClick={() => setTool('draw')}
                className={`p-1.5 rounded transition-all ${tool === 'draw' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                title="Draw Box Tool (D)"
              >
                <PlusSquare size={16} />
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
          <div className="flex items-center gap-2">
            <button
               onClick={handleSaveImage}
               className="flex items-center gap-2 px-3 py-1 bg-white hover:bg-slate-50 rounded cursor-pointer transition-colors border border-slate-200 shadow-sm text-slate-900"
               title="Save Image"
             >
               <Download size={14} className="text-slate-600" />
               <span className="text-[11px] font-semibold">Save</span>
             </button>
            <label className="flex items-center gap-2 px-3 py-1 bg-white hover:bg-slate-50 rounded cursor-pointer transition-colors border border-slate-200 shadow-sm">
              <Icons.ImageIcon size={14} className="text-slate-600" />
              <span className="text-[11px] font-semibold text-slate-900">Change Image</span>
              <input type="file" className="hidden" accept="image/*" onChange={handleFileChange} />
            </label>
          </div>
        </div>
        
        <div 
          ref={containerRef}
          onMouseDown={onMouseDown}
          className={`flex-1 relative overflow-hidden bg-slate-50 flex items-center justify-center ${cursorClass}`}
        >
          {hasCanvas ? (
            <div 
              ref={canvasRef}
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
                    <g key={box.id} className={`pointer-events-auto ${(tool === 'hand' || tool === 'draw') ? 'pointer-events-none' : 'cursor-pointer'}`}>
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
                      {isSelected && tool === 'select' && (() => {
                        const midX = (x1 + x2) / 2;
                        const midY = (y1 + y2) / 2;
                        const handles = [
                          // Corners
                          { x: x1, y: y1, i: 0, c: 'nwse-resize' },
                          { x: x2, y: y1, i: 1, c: 'nesw-resize' },
                          { x: x1, y: y2, i: 2, c: 'nesw-resize' },
                          { x: x2, y: y2, i: 3, c: 'nwse-resize' },
                          // Edges
                          { x: midX, y: y1, i: 4, c: 'ns-resize' }, // Top
                          { x: x2, y: midY, i: 5, c: 'ew-resize' }, // Right
                          { x: midX, y: y2, i: 6, c: 'ns-resize' }, // Bottom
                          { x: x1, y: midY, i: 7, c: 'ew-resize' }, // Left
                        ];
                        
                        return handles.map(h => (
                          <circle 
                            key={h.i}
                            cx={h.x} cy={h.y} 
                            r={6 / zoom}
                            fill="white" 
                            stroke={color} 
                            strokeWidth={2}
                            className="cursor-pointer"
                            style={{ cursor: h.c }}
                            onMouseDown={(e) => startDragging(e, box.id, 'handle', h.i)}
                          />
                        ));
                      })()}
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

                {/* Snap Lines */}
                {snapLines.map((line, i) => (
                    <line
                        key={i}
                        x1={line.type === 'vertical' ? line.position : line.start}
                        y1={line.type === 'horizontal' ? line.position : line.start}
                        x2={line.type === 'vertical' ? line.position : line.end}
                        y2={line.type === 'horizontal' ? line.position : line.end}
                        stroke="#ef4444"
                        strokeWidth={1 / zoom}
                        strokeDasharray="4 2"
                    />
                ))}

                {isDrawing && currentDrawRect && (
                    <rect
                        x={Math.min(currentDrawRect.x1, currentDrawRect.x2)}
                        y={Math.min(currentDrawRect.y1, currentDrawRect.y2)}
                        width={Math.abs(currentDrawRect.x2 - currentDrawRect.x1)}
                        height={Math.abs(currentDrawRect.y2 - currentDrawRect.y1)}
                        fill="rgba(37, 99, 235, 0.2)"
                        stroke="#2563eb"
                        strokeWidth={2}
                        strokeDasharray="4 2"
                    />
                )}
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
                          onClick={() => {
                              if(onRecordHistory) onRecordHistory();
                              deleteBox(selectedBoxId);
                          }}
                          className="text-red-500 hover:text-red-700 transition-colors p-1 bg-white rounded"
                          title="Delete object (Del/Backspace)"
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
                            onChange={(e) => {
                                if(onRecordHistory) onRecordHistory(); // This might trigger too often, ideally debounce or onBlur
                                updateBox(box.id, { label: e.target.value })
                            }}
                            className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                          />
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Class ID (cls_id)</label>
                          <input 
                            type="number" 
                            value={box.cls_id}
                            onChange={(e) => {
                                if(onRecordHistory) onRecordHistory();
                                updateBox(box.id, { cls_id: parseInt(e.target.value) || 0 })
                            }}
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
                              if(onRecordHistory) onRecordHistory();
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
                              if(onRecordHistory) onRecordHistory();
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
                              if(onRecordHistory) onRecordHistory();
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
                              if(onRecordHistory) onRecordHistory();
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
