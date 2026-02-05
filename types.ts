
export interface Box {
  id: string;
  cls_id: number;
  label: string;
  score: number;
  coordinate: [number, number, number, number]; // [x1, y1, x2, y2]
}

export interface Project {
  id: string;
  input_path: string;
  page_index: number;
  boxes: Box[];
  imageUrl?: string;
  imageWidth: number;
  imageHeight: number;
}

export type LayoutFormat = '1x1' | '1x2' | '2x1' | '2x2' | '3x2' | '2x3' | 'custom';

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
  mergeQueue: (string | null)[]; // IDs of projects in the merge view slots
  layoutFormat: LayoutFormat;
  customRows: number;
  customCols: number;
  boxOpacity: number;
  showLabels: boolean;
}
