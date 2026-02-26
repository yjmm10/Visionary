
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { Project, Snapshot } from '../types';
import { Icons } from '../constants';
import JsonUploader from './JsonUploader';
import { ChevronDown, ChevronRight, Folder, Edit2, History, RotateCcw, RotateCw, X, Check } from 'lucide-react';

interface SidebarProps {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, newName: string) => void;
  onUpload: (ps: Project[]) => void;
  view: 'editor' | 'merge';
  setView: (v: 'editor' | 'merge') => void;
  onExportSnapshot: () => void;
  onImportSnapshot: (file: File) => void;
  
  snapshots: Snapshot[];
  onCreateSnapshot: (name: string) => void;
  onRestoreSnapshot: (s: Snapshot) => void;
  onDeleteSnapshot: (id: string) => void;
  
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ 
  projects, 
  activeId, 
  onSelect, 
  onDelete, 
  onRename,
  onUpload, 
  view, 
  setView,
  onExportSnapshot,
  onImportSnapshot,
  snapshots,
  onCreateSnapshot,
  onRestoreSnapshot,
  onDeleteSnapshot,
  onUndo,
  onRedo,
  canUndo,
  canRedo
}) => {
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  
  // Snapshot Creation State
  const [showSnapshots, setShowSnapshots] = useState(false);
  const [isCreatingSnapshot, setIsCreatingSnapshot] = useState(false);
  const [newSnapshotName, setNewSnapshotName] = useState('');

  const snapshotInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newSnapshotInputRef = useRef<HTMLInputElement>(null);

  // Focus input when editing starts
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
    }
  }, [editingId]);

  useEffect(() => {
    if (isCreatingSnapshot && newSnapshotInputRef.current) {
        newSnapshotInputRef.current.focus();
        newSnapshotInputRef.current.select();
    }
  }, [isCreatingSnapshot]);

  // Group projects by parent folder
  const groupedProjects = useMemo(() => {
    const groups: Record<string, Project[]> = {};
    projects.forEach(p => {
      const parts = p.input_path.replace(/\\/g, '/').split('/');
      const folder = parts.length > 1 ? parts[parts.length - 2] : 'Uncategorized';
      if (!groups[folder]) groups[folder] = [];
      groups[folder].push(p);
    });
    return groups;
  }, [projects]);

  const sortedFolders = useMemo(() => {
    return Object.keys(groupedProjects).sort();
  }, [groupedProjects]);

  const toggleGroup = (folder: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(folder)) {
        next.delete(folder);
      } else {
        next.add(folder);
      }
      return next;
    });
  };

  const handleStartRename = (e: React.MouseEvent, p: Project) => {
    e.stopPropagation();
    setEditingId(p.id);
    setEditName(p.input_path);
  };

  const handleFinishRename = () => {
    if (editingId && editName.trim()) {
      onRename(editingId, editName.trim());
    }
    setEditingId(null);
  };

  const handleKeyDownRename = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFinishRename();
    if (e.key === 'Escape') setEditingId(null);
    e.stopPropagation(); // Prevent triggering other shortcuts
  };

  const handleKeyDownItem = (e: React.KeyboardEvent, id: string) => {
    if (editingId) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      onDelete(id);
    }
    if (e.key === 'Enter') {
        onSelect(id);
        setView('editor');
    }
  };

  const handleSnapshotFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportSnapshot(file);
      e.target.value = '';
    }
  };

  const handleStartCreateSnapshot = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNewSnapshotName(`Snapshot ${new Date().toLocaleTimeString()}`);
    setIsCreatingSnapshot(true);
    setShowSnapshots(true);
  };

  const handleConfirmCreateSnapshot = () => {
      if (newSnapshotName.trim()) {
          onCreateSnapshot(newSnapshotName.trim());
          setIsCreatingSnapshot(false);
      }
  };

  const handleCancelCreateSnapshot = () => {
      setIsCreatingSnapshot(false);
  };

  return (
    <aside className="w-72 border-r border-slate-200 bg-white flex flex-col h-full shrink-0 z-20 shadow-xl">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded border-2 border-slate-900 flex items-center justify-center">
                    <Icons.Layers size={18} className="text-slate-900" />
                </div>
                <h1 className="text-lg font-bold tracking-tight text-slate-900">Visionary</h1>
            </div>
            
            {/* Undo/Redo Buttons */}
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
                <button 
                 onClick={onUndo}
                 disabled={!canUndo}
                 className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                 title="Undo (Ctrl+Z)"
                >
                    <RotateCcw size={14} />
                </button>
                <button 
                 onClick={onRedo}
                 disabled={!canRedo}
                 className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded transition-all disabled:opacity-30 disabled:hover:bg-transparent"
                 title="Redo (Ctrl+Shift+Z)"
                >
                    <RotateCw size={14} />
                </button>
            </div>
        </div>

        <nav className="flex flex-col gap-1">
          <button 
            onClick={() => setView('editor')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${view === 'editor' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Icons.Grid size={18} />
            Box Editor
          </button>
          <button 
            onClick={() => setView('merge')}
            className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-semibold transition-all ${view === 'merge' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}
          >
            <Icons.LayoutGrid size={18} />
            Merge Layout
          </button>
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-4 px-2">
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Project Files</h3>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">{projects.length}</span>
          </div>
          
          <div className="space-y-1">
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-slate-400 italic">No files imported yet</p>
              </div>
            ) : (
              sortedFolders.map(folder => {
                const groupFiles = groupedProjects[folder];
                const isCollapsed = collapsedGroups.has(folder);

                return (
                  <div key={folder} className="mb-2">
                    <div 
                      onClick={() => toggleGroup(folder)}
                      className="flex items-center gap-2 px-2 py-1.5 cursor-pointer hover:bg-slate-50 rounded text-slate-600 transition-colors group select-none"
                    >
                      {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                      <Folder size={14} className="text-blue-500 fill-blue-50" />
                      <span className="text-xs font-bold truncate flex-1" title={folder}>{folder}</span>
                      <span className="text-[9px] font-bold text-slate-400 group-hover:text-slate-600">{groupFiles.length}</span>
                    </div>

                    {!isCollapsed && (
                      <div className="ml-2 pl-2 border-l border-slate-100 space-y-0.5 mt-1">
                        {groupFiles.map(p => (
                          <div 
                            key={p.id}
                            tabIndex={0} // Make focusable for delete shortcut
                            onKeyDown={(e) => handleKeyDownItem(e, p.id)}
                            onClick={() => {
                              onSelect(p.id);
                            }}
                            onDoubleClick={() => {
                              setView('editor');
                              onSelect(p.id);
                            }}
                            draggable
                            onDragStart={(e) => {
                                e.dataTransfer.setData('application/x-project-id', p.id);
                                e.dataTransfer.effectAllowed = 'copy';
                            }}
                            className={`group relative flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer border transition-all duration-200 outline-none focus:ring-2 focus:ring-blue-200 ${activeId === p.id ? 'bg-blue-50 border-blue-100 shadow-sm' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
                          >
                            <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${activeId === p.id ? 'bg-blue-500' : 'bg-slate-300'}`} />
                            <div className="flex-1 overflow-hidden min-w-0">
                                {editingId === p.id ? (
                                    <input 
                                        ref={editInputRef}
                                        type="text"
                                        value={editName}
                                        onChange={(e) => setEditName(e.target.value)}
                                        onBlur={handleFinishRename}
                                        onKeyDown={handleKeyDownRename}
                                        onClick={(e) => e.stopPropagation()}
                                        className="w-full text-xs px-1 py-0.5 bg-white text-black border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                                    />
                                ) : (
                                    <>
                                        <p className={`text-xs font-medium truncate ${activeId === p.id ? 'text-blue-900' : 'text-slate-600'}`}>
                                            {p.input_path.split('/').pop()}
                                        </p>
                                        <div className="flex items-center gap-1.5 opacity-60">
                                            <span className="text-[9px] text-slate-500">Page {p.page_index + 1}</span>
                                            <span className="w-0.5 h-0.5 bg-slate-400 rounded-full" />
                                            <span className="text-[9px] text-slate-500">{p.boxes.length} items</span>
                                        </div>
                                    </>
                                )}
                            </div>
                            
                            {!editingId && (
                                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button 
                                        onClick={(e) => handleStartRename(e, p)}
                                        className="p-1 hover:bg-slate-200 text-slate-400 hover:text-slate-700 rounded mr-1"
                                        title="Rename"
                                    >
                                        <Edit2 size={12} />
                                    </button>
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onDelete(p.id);
                                        }}
                                        className="p-1 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded"
                                        title="Delete (Del Key)"
                                    >
                                        <Icons.Trash2 size={12} />
                                    </button>
                                </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Snapshots Panel */}
        <div className="bg-slate-50 rounded-lg p-3 border border-slate-100">
           <div className="flex items-center justify-between mb-2">
             <div 
                className="flex items-center gap-2 cursor-pointer hover:text-slate-900 text-slate-500"
                onClick={() => setShowSnapshots(!showSnapshots)}
             >
                <History size={14} />
                <h3 className="text-[10px] font-bold uppercase tracking-widest">Snapshots</h3>
                <span className="text-[9px] px-1.5 py-0.5 bg-white border border-slate-200 rounded font-bold">{snapshots.length}</span>
             </div>
             <button 
                onClick={handleStartCreateSnapshot}
                className="text-[9px] font-bold bg-slate-900 text-white px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                title="Save current state to local cache"
             >
                + Save
             </button>
           </div>
           
           {showSnapshots && (
               <div className="space-y-1 max-h-40 overflow-y-auto mt-2 pr-1 custom-scrollbar">
                   {isCreatingSnapshot && (
                       <div className="p-2 bg-white rounded border border-blue-200 shadow-sm mb-2">
                           <input 
                               ref={newSnapshotInputRef}
                               type="text"
                               value={newSnapshotName}
                               onChange={(e) => setNewSnapshotName(e.target.value)}
                               onKeyDown={(e) => {
                                   if (e.key === 'Enter') handleConfirmCreateSnapshot();
                                   if (e.key === 'Escape') handleCancelCreateSnapshot();
                               }}
                               className="w-full text-xs px-2 py-1 mb-2 bg-white text-black border border-slate-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                               placeholder="Snapshot Name"
                           />
                           <div className="flex gap-2 justify-end">
                               <button 
                                onClick={handleCancelCreateSnapshot}
                                className="px-2 py-1 text-[10px] text-slate-500 hover:bg-slate-100 rounded"
                               >
                                   Cancel
                               </button>
                               <button 
                                onClick={handleConfirmCreateSnapshot}
                                className="px-2 py-1 text-[10px] bg-blue-500 text-white rounded hover:bg-blue-600"
                               >
                                   Save
                               </button>
                           </div>
                       </div>
                   )}
                   
                   {snapshots.length === 0 && !isCreatingSnapshot ? (
                       <p className="text-[10px] text-slate-400 italic text-center py-2">No quick snapshots saved.</p>
                   ) : (
                       snapshots.map(s => (
                           <div key={s.id} className="flex items-center justify-between group bg-white p-2 rounded border border-slate-200 hover:border-blue-300 transition-colors">
                               <div className="flex flex-col min-w-0 flex-1 cursor-pointer" onClick={() => onRestoreSnapshot(s)}>
                                   <span className="text-[10px] font-bold text-slate-700 truncate" title={s.name}>{s.name}</span>
                                   <span className="text-[9px] text-slate-400">{new Date(s.timestamp).toLocaleTimeString()}</span>
                               </div>
                               <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                   <button 
                                    onClick={() => onRestoreSnapshot(s)}
                                    className="p-1 text-blue-500 hover:bg-blue-50 rounded" title="Restore"
                                   >
                                       <RotateCcw size={12} />
                                   </button>
                                   <button 
                                    onClick={() => onDeleteSnapshot(s.id)}
                                    className="p-1 text-red-500 hover:bg-red-50 rounded" title="Delete"
                                   >
                                       <Icons.Trash2 size={12} />
                                   </button>
                               </div>
                           </div>
                       ))
                   )}
               </div>
           )}
        </div>
      </div>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50 space-y-4">
        <div>
          <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">File Operations</h3>
          <div className="grid grid-cols-2 gap-2">
            <button 
              onClick={onExportSnapshot}
              className="flex items-center justify-center gap-2 px-2 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
              title="Download state as file"
            >
              <Icons.Save size={14} />
              Export
            </button>
            <button 
              onClick={() => snapshotInputRef.current?.click()}
              className="flex items-center justify-center gap-2 px-2 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-xs font-bold hover:bg-slate-50 transition-all shadow-sm"
              title="Import state from file"
            >
              <Icons.Upload size={14} />
              Import
            </button>
            <input 
              type="file" 
              accept=".json" 
              ref={snapshotInputRef} 
              className="hidden" 
              onChange={handleSnapshotFile}
            />
          </div>
        </div>

        <div className="w-full h-px bg-slate-200" />
        
        <JsonUploader onUpload={onUpload} />
      </div>
    </aside>
  );
};

export default Sidebar;
