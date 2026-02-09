
import React, { useState, useEffect, useCallback } from 'react';
import { Project, Box, AppState, Snapshot } from './types';
import { Icons } from './constants';
import Sidebar from './components/Sidebar';
import AnnotationEditor from './components/AnnotationEditor';
import MergeWorkspace from './components/MergeWorkspace';

const STORAGE_KEY = 'VISIONARY_EDITOR_STATE_V3';
const SNAPSHOTS_KEY = 'VISIONARY_SNAPSHOTS';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [mergeQueue, setMergeQueue] = useState<(string | null)[]>([]);
  
  // Layout State (Defaults to 3x3 now)
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  
  const [view, setView] = useState<'editor' | 'merge'>('editor');
  
  // Shared Visual State
  const [boxOpacity, setBoxOpacity] = useState(0.3);
  const [showLabels, setShowLabels] = useState(true);

  // Clipboard State for Project Copy/Paste
  const [clipboard, setClipboard] = useState<Project | null>(null);
  // Clipboard State for Box Copy/Paste
  const [boxClipboard, setBoxClipboard] = useState<Box | null>(null);

  // Snapshots State
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);

  // --- History State (Undo/Redo) ---
  const [history, setHistory] = useState<{ past: AppState[], future: AppState[] }>({
    past: [],
    future: []
  });

  // Persistence
  useEffect(() => {
    // Load Main State
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProjects(parsed.projects || []);
        setMergeQueue(parsed.mergeQueue || []);
        setRows(parsed.rows || 3);
        setCols(parsed.cols || 3);
        if (parsed.boxOpacity !== undefined) setBoxOpacity(parsed.boxOpacity);
        if (parsed.showLabels !== undefined) setShowLabels(parsed.showLabels);
        if (parsed.view) setView(parsed.view);
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }

    // Load Snapshots
    const savedSnapshots = localStorage.getItem(SNAPSHOTS_KEY);
    if (savedSnapshots) {
      try {
        setSnapshots(JSON.parse(savedSnapshots));
      } catch (e) {
        console.error("Failed to load snapshots", e);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const state = { projects, mergeQueue, rows, cols, boxOpacity, showLabels, view };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save main state to localStorage (likely quota exceeded).", e);
    }
  }, [projects, mergeQueue, rows, cols, boxOpacity, showLabels, view]);

  useEffect(() => {
    try {
      localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
    } catch (e) {
      console.warn("Failed to save snapshots to localStorage.", e);
    }
  }, [snapshots]);

  // --- Undo/Redo Logic ---
  const recordHistory = useCallback(() => {
    setHistory(prev => {
      const currentState: AppState = {
        projects: JSON.parse(JSON.stringify(projects)), // Deep copy
        activeProjectId,
        mergeQueue: [...mergeQueue],
        rows,
        cols,
        boxOpacity,
        showLabels,
        view
      };
      
      const newPast = [...prev.past, currentState];
      // Limit history size to 50 steps
      if (newPast.length > 50) newPast.shift();

      return {
        past: newPast,
        future: [] // Clear future on new action
      };
    });
  }, [projects, activeProjectId, mergeQueue, rows, cols, boxOpacity, showLabels, view]);

  const handleUndo = useCallback(() => {
    setHistory(prev => {
      if (prev.past.length === 0) return prev;

      const previous = prev.past[prev.past.length - 1];
      const newPast = prev.past.slice(0, -1);
      
      const current: AppState = { projects, activeProjectId, mergeQueue, rows, cols, boxOpacity, showLabels, view };

      // Restore State
      setProjects(previous.projects);
      if (previous.activeProjectId) setActiveProjectId(previous.activeProjectId);
      setMergeQueue(previous.mergeQueue);
      setRows(previous.rows);
      setCols(previous.cols);
      // We don't necessarily undo visual preferences like opacity/view, but we can if we want full state restore.
      // For editing flow, keeping current view is usually better, but let's follow the snapshot logic for consistency.
      
      return {
        past: newPast,
        future: [current, ...prev.future]
      };
    });
  }, [projects, activeProjectId, mergeQueue, rows, cols, boxOpacity, showLabels, view]);

  const handleRedo = useCallback(() => {
    setHistory(prev => {
      if (prev.future.length === 0) return prev;

      const next = prev.future[0];
      const newFuture = prev.future.slice(1);
      
      const current: AppState = { projects, activeProjectId, mergeQueue, rows, cols, boxOpacity, showLabels, view };

      // Restore State
      setProjects(next.projects);
      if (next.activeProjectId) setActiveProjectId(next.activeProjectId);
      setMergeQueue(next.mergeQueue);
      setRows(next.rows);
      setCols(next.cols);

      return {
        past: [...prev.past, current],
        future: newFuture
      };
    });
  }, [projects, activeProjectId, mergeQueue, rows, cols, boxOpacity, showLabels, view]);


  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // Undo: Cmd+Z
      if (isCmdOrCtrl && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      }

      // Redo: Cmd+Shift+Z or Ctrl+Y
      if ((isCmdOrCtrl && e.key.toLowerCase() === 'z' && e.shiftKey) || (isCmdOrCtrl && e.key.toLowerCase() === 'y')) {
        e.preventDefault();
        handleRedo();
      }

      // COPY: Cmd+C (Project Level)
      // Note: Child components (Editors) will stopPropagation if they handle Box Copy
      if (isCmdOrCtrl && e.key.toLowerCase() === 'c') {
        if (activeProjectId) {
          const projectToCopy = projects.find(p => p.id === activeProjectId);
          if (projectToCopy) {
            setClipboard(JSON.parse(JSON.stringify(projectToCopy)));
          }
        }
      }

      // PASTE: Cmd+V (Project Level)
      // Note: Child components will stopPropagation if they handle Box Paste
      if (isCmdOrCtrl && e.key.toLowerCase() === 'v') {
        if (clipboard) {
          e.preventDefault();
          recordHistory(); // Save state before paste
          
          const newId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          const newBoxes = clipboard.boxes.map((box, idx) => ({
            ...box,
            id: `box-${newId}-${idx}-${Math.random().toString(36).substr(2, 5)}`
          }));

          let newPath = clipboard.input_path;
          const parts = newPath.split('.');
          if (parts.length > 1) {
            const ext = parts.pop();
            newPath = `${parts.join('.')} (Copy).${ext}`;
          } else {
            newPath = `${newPath} (Copy)`;
          }

          const newProject: Project = {
            ...clipboard,
            id: newId,
            input_path: newPath,
            boxes: newBoxes,
          };

          setProjects(prev => [...prev, newProject]);
          setActiveProjectId(newId); 
          
          setMergeQueue(prev => {
            const totalSlots = rows * cols;
            const next = [...prev];
            while (next.length < totalSlots) next.push(null);

            const emptyIdx = next.indexOf(null);
            if (emptyIdx !== -1) {
              next[emptyIdx] = newId;
            }
            return next;
          });
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeProjectId, clipboard, projects, rows, cols, recordHistory, handleUndo, handleRedo]);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const handleUpload = (newProjects: Project[]) => {
    recordHistory();
    setProjects(prev => [...prev, ...newProjects]);
    if (!activeProjectId && newProjects.length > 0) {
      setActiveProjectId(newProjects[0].id);
    }
    setMergeQueue(prev => {
      const totalSlots = rows * cols;
      const next = [...prev];
      while (next.length < totalSlots) next.push(null);
      let pIdx = 0;
      for (let i = 0; i < totalSlots && pIdx < newProjects.length; i++) {
        if (next[i] === null) {
          next[i] = newProjects[pIdx].id;
          pIdx++;
        }
      }
      return next;
    });
  };

  const updateProjectBoxes = (boxes: Box[]) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, boxes } : p));
  };

  const updateProjectBoxesById = (projectId: string, boxes: Box[]) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, boxes } : p));
  };

  const setImageForProject = (url: string | undefined, w: number, h: number) => {
    if (!activeProjectId) return;
    recordHistory();
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, imageUrl: url, imageWidth: w, imageHeight: h } : p));
  };

  const deleteProject = (id: string) => {
    recordHistory();
    setProjects(prev => prev.filter(p => p.id !== id));
    setMergeQueue(prev => prev.map(mid => mid === id ? null : mid));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const renameProject = (id: string, newName: string) => {
    recordHistory();
    setProjects(prev => prev.map(p => p.id === id ? { ...p, input_path: newName } : p));
  };

  const toggleInMerge = (id: string) => {
    recordHistory();
    if (mergeQueue.includes(id)) {
      setMergeQueue(prev => prev.map(mid => mid === id ? null : mid));
    } else {
      const firstEmpty = mergeQueue.indexOf(null);
      if (firstEmpty !== -1) {
        setMergeQueue(prev => {
          const next = [...prev];
          next[firstEmpty] = id;
          return next;
        });
      } else {
        setMergeQueue(prev => [...prev, id]);
      }
    }
  };

  const handleReorderMerge = (newIds: (string | null)[]) => {
    recordHistory();
    setMergeQueue(newIds);
  };

  const navigateToEditor = (id: string) => {
    setActiveProjectId(id);
    setView('editor');
  };

  // --- Snapshot Handlers ---
  const handleExportSnapshot = () => {
    const snapshot = {
      version: 3,
      timestamp: Date.now(),
      state: { projects, activeProjectId, mergeQueue, rows, cols, boxOpacity, showLabels, view }
    };
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `visionary-snapshot-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportSnapshot = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        recordHistory();
        const json = JSON.parse(e.target?.result as string);
        const data = json.state || json;
        restoreState(data);
        alert("Snapshot restored successfully!");
      } catch (err) {
        console.error("Failed to parse snapshot", err);
        alert("Error: Invalid snapshot file.");
      }
    };
    reader.readAsText(file);
  };

  // --- Quick Snapshots (Local Cache) ---
  const createQuickSnapshot = (name: string) => {
    if (name) {
      try {
        const currentState = { projects, activeProjectId, mergeQueue, rows, cols, boxOpacity, showLabels, view };
        const deepCopiedState = JSON.parse(JSON.stringify(currentState));

        const newSnapshot: Snapshot = {
          id: Date.now().toString(),
          name,
          timestamp: Date.now(),
          state: deepCopiedState
        };
        
        const potentialNewSnapshots = [newSnapshot, ...snapshots];
        const stringified = JSON.stringify(potentialNewSnapshots);
        
        try {
            localStorage.setItem('TEST_QUOTA', stringified);
            localStorage.removeItem('TEST_QUOTA');
            setSnapshots(potentialNewSnapshots);
        } catch (e) {
            alert("Cannot save snapshot: Local storage quota exceeded. Try deleting old snapshots or exporting data to a file.");
        }
      } catch (e) {
        console.error("Snapshot creation failed", e);
      }
    }
  };

  const restoreQuickSnapshot = (snapshot: Snapshot) => {
    try {
        recordHistory();
        const stateToRestore = JSON.parse(JSON.stringify(snapshot.state));
        restoreState(stateToRestore);
    } catch(e) {
        console.error("Failed to restore snapshot", e);
    }
  };

  const deleteQuickSnapshot = (id: string) => {
    setSnapshots(prev => prev.filter(s => s.id !== id));
  };

  const restoreState = (data: any) => {
    if (data.projects) setProjects(data.projects);
    if (data.activeProjectId !== undefined) setActiveProjectId(data.activeProjectId);
    if (data.mergeQueue) setMergeQueue(data.mergeQueue);
    if (data.rows) setRows(data.rows);
    if (data.cols) setCols(data.cols);
    if (data.boxOpacity !== undefined) setBoxOpacity(data.boxOpacity);
    if (data.showLabels !== undefined) setShowLabels(data.showLabels);
    if (data.view) setView(data.view);
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden">
      <Sidebar 
        projects={projects} 
        activeId={activeProjectId} 
        onSelect={setActiveProjectId} 
        onDelete={deleteProject}
        onRename={renameProject}
        onUpload={handleUpload}
        view={view}
        setView={setView}
        onExportSnapshot={handleExportSnapshot}
        onImportSnapshot={handleImportSnapshot}
        snapshots={snapshots}
        onCreateSnapshot={createQuickSnapshot}
        onRestoreSnapshot={restoreQuickSnapshot}
        onDeleteSnapshot={deleteQuickSnapshot}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={history.past.length > 0}
        canRedo={history.future.length > 0}
      />

      <main className="flex-1 flex flex-col relative overflow-hidden">
        <header className="h-14 border-b border-slate-200 bg-white flex items-center justify-between px-6 shrink-0 z-10">
          <div className="flex items-center gap-4">
            <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">
              {view === 'editor' ? 'Object Editor' : 'Consolidation Workspace'}
            </h2>
            {view === 'editor' && activeProject && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 border border-blue-100 rounded text-[10px] font-bold text-blue-600">
                <Icons.FileText size={12} />
                <span className="truncate max-w-[200px]" title={activeProject.input_path}>{activeProject.input_path.split('/').pop()}</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {view === 'editor' && activeProjectId && (
              <button 
                onClick={() => toggleInMerge(activeProjectId)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all ${mergeQueue.includes(activeProjectId) ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {mergeQueue.includes(activeProjectId) ? <Icons.Check size={12} /> : <Icons.Plus size={12} />}
                {mergeQueue.includes(activeProjectId) ? 'Added to Merge' : 'Add to Merge'}
              </button>
            )}
            <div className="w-px h-4 bg-slate-200 mx-2" />
            <button className="p-2 text-slate-400 hover:text-slate-600 transition-colors">
              <Icons.Settings size={18} />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-hidden p-6">
          {view === 'editor' ? (
            activeProject ? (
              <AnnotationEditor 
                project={activeProject} 
                onUpdate={updateProjectBoxes}
                onImageSet={setImageForProject}
                boxOpacity={boxOpacity}
                setBoxOpacity={setBoxOpacity}
                showLabels={showLabels}
                setShowLabels={setShowLabels}
                onRecordHistory={recordHistory}
                boxClipboard={boxClipboard}
                onCopyBox={setBoxClipboard}
              />
            ) : (
              <div className="h-full flex flex-col items-center justify-center bg-white border border-slate-200 rounded-2xl shadow-sm text-center p-12">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                  <Icons.FileText size={32} className="text-slate-200" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-2">No Project Selected</h3>
                <p className="text-sm text-slate-400 max-w-xs mx-auto">Import JSON analysis results from the sidebar or select a recent file to start editing.</p>
              </div>
            )
          ) : (
            <MergeWorkspace 
              projects={projects}
              mergeQueue={mergeQueue}
              rows={rows}
              cols={cols}
              setRows={setRows}
              setCols={setCols}
              onReorder={handleReorderMerge}
              onDoubleClick={navigateToEditor}
              onProjectUpdate={updateProjectBoxesById}
              boxOpacity={boxOpacity}
              setBoxOpacity={setBoxOpacity}
              showLabels={showLabels}
              setShowLabels={setShowLabels}
              onRecordHistory={recordHistory}
              boxClipboard={boxClipboard}
              onCopyBox={setBoxClipboard}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
