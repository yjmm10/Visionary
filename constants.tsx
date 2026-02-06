
import React from 'react';
import { 
  FileText, 
  LayoutGrid, 
  Settings, 
  Layers, 
  Image as ImageIcon, 
  Trash2, 
  Plus, 
  Download, 
  Move, 
  Grid,
  Copy,
  Check,
  Save,
  Upload
} from 'lucide-react';

export const COLORS = [
  '#2563eb', // Blue
  '#dc2626', // Red
  '#16a34a', // Green
  '#9333ea', // Purple
  '#ea580c', // Orange
  '#0891b2', // Cyan
];

export const LAYOUT_CONFIGS: Record<string, { rows: number; cols: number }> = {
  '1x1': { rows: 1, cols: 1 },
  '1x2': { rows: 1, cols: 2 },
  '2x1': { rows: 2, cols: 1 },
  '2x2': { rows: 2, cols: 2 },
  '3x2': { rows: 3, cols: 2 },
  '2x3': { rows: 2, cols: 3 },
  'custom': { rows: 2, cols: 2 }
};

export const Icons = {
  FileText,
  LayoutGrid,
  Settings,
  Layers,
  ImageIcon,
  Trash2,
  Plus,
  Download,
  Move,
  Grid,
  Copy,
  Check,
  Save,
  Upload
};
