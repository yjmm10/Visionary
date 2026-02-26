
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
  onRecordHistory?: () => void;
  boxClipboard?: Box | null;
  onCopyBox?: (box: Box) => void;
  onDuplicateProject?: (projectId: string) => string | null;
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
  setShowLabels,
  onRecordHistory,
  boxClipboard,
  onCopyBox,
  onDuplicateProject
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  
  // Transform State
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [tool, setTool] = useState<'select' | 'hand' | 'draw'>('select');
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState<{ x: number, y: number } | null>(null);

  // Snapping State
  const [snapLines, setSnapLines] = useState<{ type: 'vertical' | 'horizontal', position: number, start: number, end: number }[]>([]);

  // Helper to get absolute coordinates of a box in the merged canvas
  const getAbsoluteBoxCoords = (projectId: string, box: Box) => {
      const index = mergeQueue.indexOf(projectId);
      if (index === -1) return null;

      const row = Math.floor(index / cols);
      const col = index % cols;
      
      const projectData = projects.find(p => p.id === projectId);
      if (!projectData) return null;

      // Calculate scale and offset within the cell
      const scale = Math.min(gridMetrics.baseW / projectData.imageWidth, gridMetrics.baseH / projectData.imageHeight);
      const drawnW = projectData.imageWidth * scale;
      const drawnH = projectData.imageHeight * scale;
      const offX = (gridMetrics.baseW - drawnW) / 2;
      const offY = (gridMetrics.baseH - drawnH) / 2;

      // Cell origin
      const cellX = col * gridMetrics.baseW;
      const cellY = row * gridMetrics.baseH;

      // Box coords in image space
      const [bx1, by1, bx2, by2] = box.coordinate;

      // Transform to absolute canvas space
      const absX1 = cellX + offX + bx1 * scale;
      const absY1 = cellY + offY + by1 * scale;
      const absX2 = cellX + offX + bx2 * scale;
      const absY2 = cellY + offY + by2 * scale;

      return { x1: absX1, y1: absY1, x2: absX2, y2: absY2, cx: (absX1 + absX2) / 2, cy: (absY1 + absY2) / 2 };
  };

  // Helper to convert absolute canvas coords back to image local coords
  const getLocalBoxCoords = (projectId: string, absCoords: { x1: number, y1: number, x2: number, y2: number }) => {
      const index = mergeQueue.indexOf(projectId);
      if (index === -1) return null;

      const row = Math.floor(index / cols);
      const col = index % cols;

      const projectData = projects.find(p => p.id === projectId);
      if (!projectData) return null;

      const scale = Math.min(gridMetrics.baseW / projectData.imageWidth, gridMetrics.baseH / projectData.imageHeight);
      const drawnW = projectData.imageWidth * scale;
      const drawnH = projectData.imageHeight * scale;
      const offX = (gridMetrics.baseW - drawnW) / 2;
      const offY = (gridMetrics.baseH - drawnH) / 2;

      const cellX = col * gridMetrics.baseW;
      const cellY = row * gridMetrics.baseH;

      const lx1 = (absCoords.x1 - cellX - offX) / scale;
      const ly1 = (absCoords.y1 - cellY - offY) / scale;
      const lx2 = (absCoords.x2 - cellX - offX) / scale;
      const ly2 = (absCoords.y2 - cellY - offY) / scale;

      return [lx1, ly1, lx2, ly2] as [number, number, number, number];
  };

  const getSnappedCoordinates = (
    currentProjectId: string,
    currentBoxId: string,
    currentAbsCoords: { x1: number, y1: number, x2: number, y2: number },
    threshold: number = 5
  ) => {
      let nx1 = currentAbsCoords.x1;
      let nx2 = currentAbsCoords.x2;
      let ny1 = currentAbsCoords.y1;
      let ny2 = currentAbsCoords.y2;
      
      const w = nx2 - nx1;
      const h = ny2 - ny1;
      const cx = (nx1 + nx2) / 2;
      const cy = (ny1 + ny2) / 2;

      const lines: typeof snapLines = [];

      // Collect all other boxes in absolute coords
      const otherBoxes: { x1: number, y1: number, x2: number, y2: number, cx: number, cy: number }[] = [];
      
      mergeQueue.forEach(pid => {
          if (!pid) return;
          const p = projects.find(proj => proj.id === pid);
          if (!p) return;
          p.boxes.forEach(b => {
              if (pid === currentProjectId && b.id === currentBoxId) return;
              const abs = getAbsoluteBoxCoords(pid, b);
              if (abs) otherBoxes.push(abs);
          });
      });

      // Helper to check snap
      const checkSnap = (val: number, type: 'vertical' | 'horizontal') => {
          let snappedVal = val;
          let snapped = false;
          let snapStart = 0, snapEnd = 0;

          for (const other of otherBoxes) {
              const targets = type === 'vertical' 
                  ? [other.x1, other.x2, other.cx] 
                  : [other.y1, other.y2, other.cy];
              
              const otherStart = type === 'vertical' ? Math.min(other.y1, other.y2) : Math.min(other.x1, other.x2);
              const otherEnd = type === 'vertical' ? Math.max(other.y1, other.y2) : Math.max(other.x1, other.x2);

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
      const snapX1 = checkSnap(nx1, 'vertical');
      const snapX2 = checkSnap(nx2, 'vertical');
      const snapCX = checkSnap(cx, 'vertical');

      if (snapX1.snapped) {
          const diff = snapX1.snappedVal - nx1;
          nx1 += diff; nx2 += diff;
          lines.push({ type: 'vertical', position: nx1, start: Math.min(ny1, snapX1.snapStart), end: Math.max(ny2, snapX1.snapEnd) });
      } else if (snapX2.snapped) {
          const diff = snapX2.snappedVal - nx2;
          nx1 += diff; nx2 += diff;
          lines.push({ type: 'vertical', position: nx2, start: Math.min(ny1, snapX2.snapStart), end: Math.max(ny2, snapX2.snapEnd) });
      } else if (snapCX.snapped) {
          const diff = snapCX.snappedVal - cx;
          nx1 += diff; nx2 += diff;
          lines.push({ type: 'vertical', position: (nx1 + nx2) / 2, start: Math.min(ny1, snapCX.snapStart), end: Math.max(ny2, snapCX.snapEnd) });
      }

      // Y-Axis Snapping (Horizontal Lines)
      const snapY1 = checkSnap(ny1, 'horizontal');
      const snapY2 = checkSnap(ny2, 'horizontal');
      const snapCY = checkSnap(cy, 'horizontal');

      if (snapY1.snapped) {
          const diff = snapY1.snappedVal - ny1;
          ny1 += diff; ny2 += diff;
          lines.push({ type: 'horizontal', position: ny1, start: Math.min(nx1, snapY1.snapStart), end: Math.max(nx2, snapY1.snapEnd) });
      } else if (snapY2.snapped) {
          const diff = snapY2.snappedVal - ny2;
          ny1 += diff; ny2 += diff;
          lines.push({ type: 'horizontal', position: ny2, start: Math.min(nx1, snapY2.snapStart), end: Math.max(nx2, snapY2.snapEnd) });
      } else if (snapCY.snapped) {
          const diff = snapCY.snappedVal - cy;
          ny1 += diff; ny2 += diff;
          lines.push({ type: 'horizontal', position: (ny1 + ny2) / 2, start: Math.min(nx1, snapCY.snapStart), end: Math.max(nx2, snapCY.snapEnd) });
      }

      return { nextAbsCoords: { x1: nx1, y1: ny1, x2: nx2, y2: ny2 }, lines };
  };

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
    aspectRatio?: number;
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
      
      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      if (e.code === 'Space' && tool !== 'hand') {
        e.preventDefault();
        setTool('hand');
      }
      if (e.key.toLowerCase() === 'v' && !isCmdOrCtrl) setTool('select');
      if (e.key.toLowerCase() === 'd' && !isCmdOrCtrl) setTool('draw');
      
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedBox) {
        if(onRecordHistory) onRecordHistory();
        deleteSelectedBox();
      }

      // Keyboard Move with Arrow Keys
      if (selectedBox && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          const { projectId, boxId } = selectedBox;
          const project = projects.find(p => p.id === projectId);
          if (project) {
              const box = project.boxes.find(b => b.id === boxId);
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

                  // We need to work in absolute coords for snapping across images
                  const absCoords = getAbsoluteBoxCoords(projectId, box);
                  if (absCoords) {
                      // Apply movement in absolute space (approximate since scale varies per image)
                      // Ideally we convert dx/dy to absolute space first.
                      // Let's get scale for this project
                      const scale = Math.min(gridMetrics.baseW / project.imageWidth, gridMetrics.baseH / project.imageHeight);
                      const absDx = dx * scale;
                      const absDy = dy * scale;

                      let nextAbsCoords = {
                          x1: absCoords.x1 + absDx,
                          y1: absCoords.y1 + absDy,
                          x2: absCoords.x2 + absDx,
                          y2: absCoords.y2 + absDy
                      };

                      // Apply Snapping if not holding Alt
                      if (!e.altKey) {
                          const snapped = getSnappedCoordinates(projectId, boxId, nextAbsCoords, 5 / zoom);
                          
                          // Anti-Stick & Directional Snap Logic
                          const sx1 = snapped.nextAbsCoords.x1;
                          const sy1 = snapped.nextAbsCoords.y1;
                          const rx1 = nextAbsCoords.x1;
                          const ry1 = nextAbsCoords.y1;

                          const snapDiffX = sx1 - rx1;
                          // Reject if:
                          // - We are NOT moving horizontally (dx=0) -> Don't snap X
                          // - Snap opposes movement (Anti-Stick)
                          if (dx === 0 || (snapDiffX !== 0 && (snapDiffX * dx < 0))) { 
                              snapped.nextAbsCoords.x1 = rx1;
                              snapped.nextAbsCoords.x2 = nextAbsCoords.x2;
                              snapped.lines = snapped.lines.filter(l => l.type !== 'vertical');
                          }

                          const snapDiffY = sy1 - ry1;
                          // Reject if:
                          // - We are NOT moving vertically (dy=0) -> Don't snap Y
                          // - Snap opposes movement (Anti-Stick)
                          if (dy === 0 || (snapDiffY !== 0 && (snapDiffY * dy < 0))) {
                              snapped.nextAbsCoords.y1 = ry1;
                              snapped.nextAbsCoords.y2 = nextAbsCoords.y2;
                              snapped.lines = snapped.lines.filter(l => l.type !== 'horizontal');
                          }

                          nextAbsCoords = snapped.nextAbsCoords;
                          setSnapLines(snapped.lines);
                          setTimeout(() => setSnapLines([]), 1000);
                      }

                      // Convert back to local
                      const nextLocalCoords = getLocalBoxCoords(projectId, nextAbsCoords);
                      if (nextLocalCoords) {
                          updateBox(projectId, boxId, { coordinate: nextLocalCoords });
                      }
                  }
              }
          }
      }

      // Box Copy - Capture Phase
      if (isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        if (selectedBox && onCopyBox) {
            const project = projects.find(p => p.id === selectedBox.projectId);
            if (project) {
                const box = project.boxes.find(b => b.id === selectedBox.boxId);
                if (box) {
                    e.preventDefault();
                    e.stopPropagation(); // Stop propagation to App
                    onCopyBox(box);
                }
            }
        }
      }

      // Box Paste - Capture Phase
      if (isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        if (boxClipboard && selectedBox) {
             e.preventDefault();
             e.stopPropagation(); // Stop propagation to App
             if (onRecordHistory) onRecordHistory();

             const width = Math.abs(boxClipboard.coordinate[2] - boxClipboard.coordinate[0]);
             const height = Math.abs(boxClipboard.coordinate[3] - boxClipboard.coordinate[1]);
             const margin = 10;

             const newBox: Box = {
                ...boxClipboard,
                id: `box-copy-${Date.now()}-${Math.random().toString(36).substr(2,5)}`,
                coordinate: [
                    boxClipboard.coordinate[0], // Keep X alignment
                    boxClipboard.coordinate[3] + margin, // Place below (Y2 + margin)
                    boxClipboard.coordinate[2], // Keep Width (X2)
                    boxClipboard.coordinate[3] + margin + height // Y2 + margin + height
                ]
            };

            const project = projects.find(p => p.id === selectedBox.projectId);
            if (project) {
                 onProjectUpdate(project.id, [...project.boxes, newBox]);
                 setSelectedBox({ projectId: project.id, boxId: newBox.id });
            }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && tool === 'hand') {
        setTool('select');
      }
    };
    
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    window.addEventListener('keyup', handleKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', handleKeyDown, { capture: true });
      window.removeEventListener('keyup', handleKeyUp, { capture: true });
    };
  }, [tool, selectedBox, onRecordHistory, boxClipboard, onCopyBox, projects]);

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
    // Only reorder if the total slots have changed significantly or if we need to fill empty slots
    // We want to PRESERVE the existing layout as much as possible when resizing.
    
    if (mergeQueue.length !== totalSlots) {
      const newQueue = [...mergeQueue];
      
      if (newQueue.length < totalSlots) {
        // Growing: Just append nulls
        while (newQueue.length < totalSlots) newQueue.push(null);
      } else {
        // Shrinking: We must be careful.
        // If we reduce cols, items at the end of rows might get shifted or cut.
        // The simplest approach for "shrinking" is just slicing, which effectively "cuts off" the bottom/right.
        // However, if we change columns, the 1D array mapping changes the visual position of items.
        // To keep items "visually" in place when changing columns is hard with a 1D array without inserting gaps.
        // But the user request specifically says "when increasing rows/cols, keep original position".
        // Slicing handles the "keep original position" for the remaining items in the 1D array, 
        // BUT changing 'cols' changes the visual row wrapping.
        
        // If we want to strictly preserve visual position (row, col) when changing grid dimensions:
        // We need to map old (r,c) to new index.
        
        // Let's detect if this is a resize operation by comparing with previous props (not available easily in effect)
        // But we can infer.
        
        // Actually, the standard behavior of a 1D array flow is that increasing columns pulls items up.
        // The user wants "expand right/down".
        // This implies that if I have [A, B] in a 2x1 grid (A at 0,0; B at 0,1)
        // And I change to 3x1, it should be [A, B, null]. This is default array behavior.
        // BUT if I have [A, B] in a 1x2 grid (A at 0,0; B at 1,0)
        // And I change to 2x2.
        // Old: Row 0: [A], Row 1: [B]. Array: [A, B]
        // New: Row 0: [A, ?], Row 1: [?, ?].
        // If we just keep [A, B], New Layout is: Row 0: [A, B]. B moved from (1,0) to (0,1).
        // The user wants B to stay at (1,0).
        // So New Array needs to be: [A, null, B, null].
        
        // We need to reconstruct the queue based on visual coordinates.
      }
      
      // We need a way to know the OLD cols/rows to do this mapping.
      // Since we don't have them in this effect, we might need a ref to track previous dimensions.
    }
  }, [totalSlots, mergeQueue.length, onReorder]);

  // Ref to track previous dimensions for smart resizing
  const prevDims = useRef({ rows, cols });

  // Local state for inputs to prevent jitter and allow "commit" action
  const [localRows, setLocalRows] = useState(rows);
  const [localCols, setLocalCols] = useState(cols);

  // Sync local state when props change externally (e.g. undo/redo)
  useEffect(() => {
      setLocalRows(rows);
      setLocalCols(cols);
      prevDims.current = { rows, cols };
  }, [rows, cols]);

  const handleGridResize = (newRows: number, newCols: number) => {
      const oldRows = prevDims.current.rows;
      const oldCols = prevDims.current.cols;
      
      if (oldRows !== newRows || oldCols !== newCols) {
          // Dimensions changed. Re-map the queue to preserve visual positions.
          const newQueue = new Array(newRows * newCols).fill(null);
          
          // Map old items to new positions
          for (let r = 0; r < oldRows; r++) {
              for (let c = 0; c < oldCols; c++) {
                  const oldIdx = r * oldCols + c;
                  if (oldIdx < mergeQueue.length) {
                      const item = mergeQueue[oldIdx];
                      // If this position exists in new grid, place it there
                      if (r < newRows && c < newCols) {
                          const newIdx = r * newCols + c;
                          newQueue[newIdx] = item;
                      }
                  }
              }
          }
          
          // Batch updates
          if (onRecordHistory) onRecordHistory();
          setRows(newRows);
          setCols(newCols);
          onReorder(newQueue);
          
          prevDims.current = { rows: newRows, cols: newCols };
      }
  };

  const handleRowsCommit = () => {
      const val = Math.max(1, localRows);
      if (val !== rows) {
          handleGridResize(val, cols);
      } else {
          setLocalRows(rows); // Reset invalid input
      }
  };

  const handleColsCommit = () => {
      const val = Math.max(1, localCols);
      if (val !== cols) {
          handleGridResize(rows, val);
      } else {
          setLocalCols(cols); // Reset invalid input
      }
  };
  
  useEffect(() => {
      // This effect now ONLY handles initialization or external queue updates NOT caused by resize
      // We check if the queue length matches the EXPECTED size based on props.
      // If it doesn't match, and we didn't just trigger a resize (handled in handleGridResize),
      // then we should pad/slice.
      
      const expectedSize = rows * cols;
      if (mergeQueue.length !== expectedSize) {
          // Check if this mismatch is due to a pending resize we just handled?
          // Actually, if we use handleGridResize, we update everything at once.
          // But React updates are async.
          
          // Simple check: If the queue is just the wrong size (e.g. from undo/redo or initial load), fix it.
          // But we must NOT do the complex remapping here, just simple padding/slicing.
          
          const newQueue = [...mergeQueue];
          if (newQueue.length < expectedSize) {
              while (newQueue.length < expectedSize) newQueue.push(null);
          } else if (newQueue.length > expectedSize) {
              newQueue.length = expectedSize;
          }
          onReorder(newQueue);
      }
  }, [rows, cols, mergeQueue.length, onReorder]);

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
    
    // Save history before modifying
    if(onRecordHistory) onRecordHistory();

    const project = projects.find(p => p.id === projectId);
    if (!project) return;
    const box = project.boxes.find(b => b.id === boxId);
    if (!box) return;

    const [x1, y1, x2, y2] = box.coordinate;
    const width = Math.abs(x2 - x1);
    const height = Math.abs(y2 - y1);
    const aspectRatio = height > 0 ? width / height : 1;

    setSelectedBox({ projectId, boxId });
    setBoxDrag({
        projectId,
        boxId,
        type,
        handleIndex,
        startPos: { x: e.clientX, y: e.clientY },
        originalCoords: [...box.coordinate] as [number, number, number, number],
        aspectRatio
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
            let constrainedDx = dx;
            let constrainedDy = dy;

            // Shift key constrains movement to horizontal or vertical axis
            if (e.shiftKey) {
                if (Math.abs(dx) > Math.abs(dy)) {
                    constrainedDy = 0;
                } else {
                    constrainedDx = 0;
                }
            }

            const rawNextCoords: [number, number, number, number] = [
                x1 + constrainedDx, 
                y1 + constrainedDy, 
                x2 + constrainedDx, 
                y2 + constrainedDy
            ];
            
            // Convert to absolute for snapping
            const absCoords = getAbsoluteBoxCoords(boxDrag.projectId, { ...project.boxes.find(b => b.id === boxDrag.boxId)!, coordinate: rawNextCoords });
            
            if (absCoords) {
                const snapped = getSnappedCoordinates(boxDrag.projectId, boxDrag.boxId, absCoords, 5 / zoom);
                
                // Re-enforce Shift constraint after snapping
                if (e.shiftKey) {
                    // We need to check constraints in LOCAL space or ensure absolute snap respects it.
                    // Easier to just reset the non-moving axis in the final result.
                    // But wait, snapped returns absolute coords.
                    
                    // Let's convert the original constrained coords to absolute to see where we SHOULD be on the locked axis
                    const idealAbs = getAbsoluteBoxCoords(boxDrag.projectId, { ...project.boxes.find(b => b.id === boxDrag.boxId)!, coordinate: rawNextCoords });
                    
                    if (idealAbs) {
                        if (constrainedDy === 0) {
                            // Moving Horizontally. Lock Y.
                            snapped.nextAbsCoords.y1 = idealAbs.y1;
                            snapped.nextAbsCoords.y2 = idealAbs.y2;
                            snapped.lines = snapped.lines.filter(l => l.type !== 'horizontal');
                        } else {
                            // Moving Vertically. Lock X.
                            snapped.nextAbsCoords.x1 = idealAbs.x1;
                            snapped.nextAbsCoords.x2 = idealAbs.x2;
                            snapped.lines = snapped.lines.filter(l => l.type !== 'vertical');
                        }
                    }
                }

                setSnapLines(snapped.lines);
                
                // Convert back to local
                const local = getLocalBoxCoords(boxDrag.projectId, snapped.nextAbsCoords);
                if (local) nextCoords = local;
            } else {
                nextCoords = rawNextCoords;
            }

        } else if (boxDrag.type === 'handle') {
            let nx1 = x1, ny1 = y1, nx2 = x2, ny2 = y2;

            if (boxDrag.handleIndex === 0) { nx1 += dx; ny1 += dy; }
            if (boxDrag.handleIndex === 1) { nx2 += dx; ny1 += dy; }
            if (boxDrag.handleIndex === 2) { nx1 += dx; ny2 += dy; }
            if (boxDrag.handleIndex === 3) { nx2 += dx; ny2 += dy; }

            // Edges
            if (boxDrag.handleIndex === 4) { ny1 += dy; } // Top
            if (boxDrag.handleIndex === 5) { nx2 += dx; } // Right
            if (boxDrag.handleIndex === 6) { ny2 += dy; } // Bottom
            if (boxDrag.handleIndex === 7) { nx1 += dx; } // Left

            // Aspect Ratio Constraint (Shift Key) - Only corners for simplicity
            if (e.shiftKey && boxDrag.aspectRatio && boxDrag.handleIndex !== undefined && boxDrag.handleIndex < 4) {
                const newW = Math.abs(nx2 - nx1);
                const constrainedH = newW / boxDrag.aspectRatio;

                if (boxDrag.handleIndex === 0) { // Top-Left
                   ny1 = ny2 - constrainedH;
                } else if (boxDrag.handleIndex === 1) { // Top-Right
                   ny1 = ny2 - constrainedH;
                } else if (boxDrag.handleIndex === 2) { // Bottom-Left
                   ny2 = ny1 + constrainedH;
                } else if (boxDrag.handleIndex === 3) { // Bottom-Right
                   ny2 = ny1 + constrainedH;
                }
            }

            nextCoords = [nx1, ny1, nx2, ny2];
        }

        updateBox(boxDrag.projectId, boxDrag.boxId, { coordinate: nextCoords });
    }
  };

  const onMouseUp = () => {
    if (isDrawing && drawStart && currentDrawRect) {
         if(onRecordHistory) onRecordHistory();
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
    setSnapLines([]);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    if (tool === 'hand' || tool === 'draw' || boxDrag) {
        e.preventDefault();
        return;
    }
    setDraggingIndex(index);
    
    // Allow copy effect if Alt is pressed
    if (e.altKey) {
        e.dataTransfer.effectAllowed = 'copy';
    } else {
        e.dataTransfer.effectAllowed = 'move';
    }

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
    
    // Update drop effect based on key state during drag over
    if (e.altKey) {
        e.dataTransfer.dropEffect = 'copy';
    } else {
        e.dataTransfer.dropEffect = 'move';
    }
    
    if (dragOverIndex !== index) setDragOverIndex(index);
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    setDragOverIndex(null);
    if (tool === 'hand' || tool === 'draw' || boxDrag) return;

    // Handle Project File Drop (from Sidebar)
    const droppedProjectId = e.dataTransfer.getData('application/x-project-id');
    if (droppedProjectId) {
        if(onRecordHistory) onRecordHistory();
        const nextQueue = [...mergeQueue];
        nextQueue[targetIndex] = droppedProjectId;
        onReorder(nextQueue);
        return;
    }

    if (draggingIndex === null) return;

    // Handle internal drag (Move or Copy)
    if (onRecordHistory) onRecordHistory();
    const nextQueue = [...mergeQueue];
    const sourceProjectId = nextQueue[draggingIndex];

    if (e.altKey && onDuplicateProject && sourceProjectId) {
        // COPY MODE: Duplicate project and place in target
        const newProjectId = onDuplicateProject(sourceProjectId);
        if (newProjectId) {
            nextQueue[targetIndex] = newProjectId;
            // Note: We do NOT clear the source slot in copy mode
        }
    } else {
        // MOVE MODE: Swap items
        if (draggingIndex === targetIndex) {
            setDraggingIndex(null);
            return;
        }
        const temp = nextQueue[draggingIndex];
        nextQueue[draggingIndex] = nextQueue[targetIndex];
        nextQueue[targetIndex] = temp;
    }

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
                      type="number" min="1"
                      value={localRows} 
                      onChange={(e) => setLocalRows(parseInt(e.target.value) || 0)}
                      onBlur={handleRowsCommit}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                          }
                      }}
                      className="w-8 bg-transparent text-sm font-bold text-slate-900 outline-none text-center"
                      />
                  </div>
                  <div className="h-4 w-px bg-slate-200" />
                  <div className="flex items-center gap-1 px-1">
                      <label className="text-[9px] font-bold text-slate-500 uppercase">Cols</label>
                      <input 
                      type="number" min="1"
                      value={localCols} 
                      onChange={(e) => setLocalCols(parseInt(e.target.value) || 0)}
                      onBlur={handleColsCommit}
                      onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                          }
                      }}
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
                                    {isSelected && tool === 'select' && !copying && (() => {
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
                                          r={project.imageWidth / 100} // Dynamic radius based on image size
                                          fill="white" 
                                          stroke={color} 
                                          strokeWidth={project.imageWidth / 300}
                                          className="cursor-pointer"
                                          style={{ cursor: h.c }}
                                          onMouseDown={(e) => handleBoxMouseDown(e, project.id, box.id, 'handle', h.i)}
                                        />
                                      ));
                                    })()}
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

                {/* Global Snap Lines Overlay */}
                <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-50">
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
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-80 shrink-0 flex flex-col gap-6 min-h-0">
          
          {/* Panel 1: Configuration */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col flex-1 min-h-0">
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
                              onClick={() => {
                                  if(onRecordHistory) onRecordHistory();
                                  deleteSelectedBox();
                              }}
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
                                          onChange={(e) => {
                                              if(onRecordHistory) onRecordHistory();
                                              updateBox(selectedBox.projectId, box.id, { label: e.target.value })
                                          }}
                                          className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                                          />
                                      </div>
                                      <div className="col-span-2">
                                          <label className="text-[10px] font-bold text-slate-500 uppercase block mb-1.5">Class ID</label>
                                          <input 
                                          type="number" 
                                          value={box.cls_id}
                                          onChange={(e) => {
                                              if(onRecordHistory) onRecordHistory();
                                              updateBox(selectedBox.projectId, box.id, { cls_id: parseInt(e.target.value) || 0 })
                                          }}
                                          className="w-full px-3 py-2 bg-white text-slate-900 border border-slate-300 rounded-md text-sm focus:ring-1 focus:ring-blue-500 outline-none shadow-sm"
                                          />
                                      </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-3 bg-white">
                                      <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">X1</label><input type="number" value={Math.round(box.coordinate[0])} onChange={(e) => { if(onRecordHistory) onRecordHistory(); const c=[...box.coordinate] as any; c[0]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                      <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Y1</label><input type="number" value={Math.round(box.coordinate[1])} onChange={(e) => { if(onRecordHistory) onRecordHistory(); const c=[...box.coordinate] as any; c[1]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                      <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">X2</label><input type="number" value={Math.round(box.coordinate[2])} onChange={(e) => { if(onRecordHistory) onRecordHistory(); const c=[...box.coordinate] as any; c[2]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
                                      <div><label className="text-[9px] font-bold text-slate-500 uppercase block mb-1">Y2</label><input type="number" value={Math.round(box.coordinate[3])} onChange={(e) => { if(onRecordHistory) onRecordHistory(); const c=[...box.coordinate] as any; c[3]=parseInt(e.target.value); updateBox(selectedBox.projectId, box.id, {coordinate: c})}} className="w-full px-2 py-1.5 border border-slate-300 rounded text-xs outline-none focus:ring-1 focus:ring-blue-500"/></div>
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
            </div>
          </div>

          {/* Panel 2: Entity List */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm flex flex-col h-48 min-h-0">
            <div className="p-3 border-b border-slate-200 flex items-center justify-between bg-white">
                <h3 className="text-[10px] font-bold text-slate-900 uppercase tracking-widest">
                    {selectedProject ? 'Entity List (Current)' : 'Entity List'}
                </h3>
                <span className="text-[10px] bg-slate-900 text-white px-1.5 py-0.5 rounded font-bold">
                    {selectedProject ? selectedProject.boxes.length : '-'}
                </span>
            </div>
            <div className="flex-1 overflow-y-auto bg-slate-50">
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
