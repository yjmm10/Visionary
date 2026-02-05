
import React, { useState, useEffect } from 'react';
import { Project, LayoutFormat, Box } from './types';
import { Icons, LAYOUT_CONFIGS } from './constants';
import Sidebar from './components/Sidebar';
import AnnotationEditor from './components/AnnotationEditor';
import MergeWorkspace from './components/MergeWorkspace';

const STORAGE_KEY = 'VISIONARY_EDITOR_STATE_V3';

const App: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [mergeQueue, setMergeQueue] = useState<(string | null)[]>([]);
  const [layoutFormat, setLayoutFormat] = useState<LayoutFormat>('2x2');
  const [customRows, setCustomRows] = useState(2);
  const [customCols, setCustomCols] = useState(2);
  const [view, setView] = useState<'editor' | 'merge'>('editor');
  
  // Shared Visual State
  const [boxOpacity, setBoxOpacity] = useState(0.3);
  const [showLabels, setShowLabels] = useState(true);

  // Clipboard State for Project Copy/Paste
  const [clipboard, setClipboard] = useState<Project | null>(null);

  // Persistence
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setProjects(parsed.projects || []);
        setMergeQueue(parsed.mergeQueue || []);
        setLayoutFormat(parsed.layoutFormat || '2x2');
        setCustomRows(parsed.customRows || 2);
        setCustomCols(parsed.customCols || 2);
        if (parsed.boxOpacity !== undefined) setBoxOpacity(parsed.boxOpacity);
        if (parsed.showLabels !== undefined) setShowLabels(parsed.showLabels);
      } catch (e) {
        console.error("Failed to load state", e);
      }
    }
  }, []);

  useEffect(() => {
    const state = { projects, mergeQueue, layoutFormat, customRows, customCols, boxOpacity, showLabels };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [projects, mergeQueue, layoutFormat, customRows, customCols, boxOpacity, showLabels]);

  // Global Keyboard Shortcuts for Copy/Paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is typing in an input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }

      const isCmdOrCtrl = e.metaKey || e.ctrlKey;

      // COPY: Cmd+C
      if (isCmdOrCtrl && e.key === 'c') {
        if (activeProjectId) {
          const projectToCopy = projects.find(p => p.id === activeProjectId);
          if (projectToCopy) {
            // Create a deep copy for the clipboard to snapshot the current state
            setClipboard(JSON.parse(JSON.stringify(projectToCopy)));
          }
        }
      }

      // PASTE: Cmd+V
      if (isCmdOrCtrl && e.key === 'v') {
        if (clipboard) {
          e.preventDefault(); // Prevent double pasting if focus is somewhere weird
          
          const newId = `proj-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
          
          // Generate new IDs for all boxes to prevent conflicts
          const newBoxes = clipboard.boxes.map((box, idx) => ({
            ...box,
            id: `box-${newId}-${idx}-${Math.random().toString(36).substr(2, 5)}`
          }));

          // Logic to append "(Copy)" to the name nicely
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
            // Keep image data (URL/width/height)
          };

          setProjects(prev => [...prev, newProject]);
          setActiveProjectId(newId); // Switch focus to the new copy
          
          // Auto-add copy to merge queue if space exists
          setMergeQueue(prev => {
            const config = layoutFormat === 'custom' 
              ? { rows: customRows, cols: customCols } 
              : LAYOUT_CONFIGS[layoutFormat];
            const totalSlots = config.rows * config.cols;

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
  }, [activeProjectId, clipboard, projects, layoutFormat, customRows, customCols]);

  const activeProject = projects.find(p => p.id === activeProjectId);

  const handleUpload = (newProjects: Project[]) => {
    setProjects(prev => [...prev, ...newProjects]);
    if (!activeProjectId && newProjects.length > 0) {
      setActiveProjectId(newProjects[0].id);
    }

    // Auto-add newly uploaded projects to available slots in Merge Queue
    setMergeQueue(prev => {
      const config = layoutFormat === 'custom' 
        ? { rows: customRows, cols: customCols } 
        : LAYOUT_CONFIGS[layoutFormat];
      const totalSlots = config.rows * config.cols;

      const next = [...prev];
      // Ensure array is at least totalSlots long (in case it hasn't been initialized by MergeWorkspace yet)
      while (next.length < totalSlots) next.push(null);

      let pIdx = 0;
      // Fill empty slots with new project IDs
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

  const setImageForProject = (url: string | undefined, w: number, h: number) => {
    if (!activeProjectId) return;
    setProjects(prev => prev.map(p => p.id === activeProjectId ? { ...p, imageUrl: url, imageWidth: w, imageHeight: h } : p));
  };

  const deleteProject = (id: string) => {
    setProjects(prev => prev.filter(p => p.id !== id));
    setMergeQueue(prev => prev.map(mid => mid === id ? null : mid));
    if (activeProjectId === id) setActiveProjectId(null);
  };

  const toggleInMerge = (id: string) => {
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
    setMergeQueue(newIds);
  };

  const navigateToEditor = (id: string) => {
    setActiveProjectId(id);
    setView('editor');
  };

  return (
    <div className="flex h-screen w-full bg-slate-50 text-slate-900 overflow-hidden">
      <Sidebar 
        projects={projects} 
        activeId={activeProjectId} 
        onSelect={setActiveProjectId} 
        onDelete={deleteProject}
        onUpload={handleUpload}
        view={view}
        setView={setView}
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
                {activeProject.input_path.split('/').pop()}
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
              layout={layoutFormat}
              customRows={customRows}
              customCols={customCols}
              setLayout={setLayoutFormat}
              setCustomRows={setCustomRows}
              setCustomCols={setCustomCols}
              onReorder={handleReorderMerge}
              onDoubleClick={navigateToEditor}
              boxOpacity={boxOpacity}
              showLabels={showLabels}
            />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
