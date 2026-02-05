
import React from 'react';
import { Project } from '../types';
import { Icons } from '../constants';
import JsonUploader from './JsonUploader';

interface SidebarProps {
  projects: Project[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onUpload: (ps: Project[]) => void;
  view: 'editor' | 'merge';
  setView: (v: 'editor' | 'merge') => void;
}

const Sidebar: React.FC<SidebarProps> = ({ projects, activeId, onSelect, onDelete, onUpload, view, setView }) => {
  return (
    <aside className="w-72 border-r border-slate-200 bg-white flex flex-col h-full shrink-0">
      <div className="p-6 border-b border-slate-100">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-8 h-8 rounded border-2 border-slate-900 flex items-center justify-center">
            <Icons.Layers size={18} className="text-slate-900" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-slate-900">Visionary</h1>
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
            <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Recent Files</h3>
            <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded font-bold">{projects.length}</span>
          </div>
          
          <div className="space-y-1">
            {projects.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-slate-400 italic">No files imported yet</p>
              </div>
            ) : (
              projects.map(p => (
                <div 
                  key={p.id}
                  onClick={() => {
                    setView('editor');
                    onSelect(p.id);
                  }}
                  className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-md cursor-pointer border transition-all duration-200 ${activeId === p.id ? 'bg-white border-slate-900 shadow-sm' : 'bg-transparent border-transparent hover:bg-slate-50'}`}
                >
                  <div className={`w-2 h-2 rounded-full ${activeId === p.id ? 'bg-blue-500 animate-pulse' : 'bg-slate-300'}`} />
                  <div className="flex-1 overflow-hidden">
                    <p className={`text-xs font-semibold truncate ${activeId === p.id ? 'text-slate-900' : 'text-slate-600'}`}>
                      {p.input_path.split('/').pop()}
                    </p>
                    <p className="text-[10px] text-slate-400 font-medium">Page {p.page_index + 1} • {p.boxes.length} objects</p>
                  </div>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(p.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                  >
                    <Icons.Trash2 size={14} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="p-6 border-t border-slate-100 bg-slate-50/50">
        <JsonUploader onUpload={onUpload} />
      </div>
    </aside>
  );
};

export default Sidebar;
