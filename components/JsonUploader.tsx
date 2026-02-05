
import React, { useRef } from 'react';
import { Project, Box } from '../types';
import { Icons } from '../constants';

interface JsonUploaderProps {
  onUpload: (projects: Project[]) => void;
}

const JsonUploader: React.FC<JsonUploaderProps> = ({ onUpload }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    const newProjects: Project[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await file.text();
        const data = JSON.parse(text);

        // Map box data from the specific JSON format
        // Use a more robust ID generation
        const boxes: Box[] = (data.boxes || []).map((b: any, index: number) => ({
          id: `box-${Math.random().toString(36).substr(2, 9)}-${index}`,
          cls_id: b.cls_id,
          label: b.label,
          score: b.score,
          coordinate: b.coordinate
        }));

        newProjects.push({
          id: `proj-${Math.random().toString(36).substr(2, 9)}-${Date.now()}`,
          input_path: data.input_path || 'unknown_path.pdf',
          page_index: data.page_index || 0,
          boxes,
          imageWidth: 0,
          imageHeight: 0
        });
      } catch (err) {
        console.error("Error parsing JSON", err);
      }
    }

    onUpload(newProjects);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="w-full">
      <input 
        type="file" 
        multiple 
        accept=".json" 
        className="hidden" 
        ref={fileInputRef} 
        onChange={handleFileChange}
      />
      <button 
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-slate-900 text-white rounded-lg text-sm font-bold shadow-sm hover:shadow-md transition-all active:scale-[0.98]"
      >
        <Icons.Plus size={18} />
        Import JSON Data
      </button>
      <p className="text-[10px] text-center text-slate-400 mt-2 font-medium">Select one or more analysis JSON files</p>
    </div>
  );
};

export default JsonUploader;
