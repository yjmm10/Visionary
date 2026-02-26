
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

export interface GridSpan {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface AppState {
  projects: Project[];
  activeProjectId: string | null;
  mergeQueue: (string | null)[]; // IDs of projects in the merge view slots
  rows: number;
  cols: number;
  layout: GridSpan[];
  boxOpacity: number;
  showLabels: boolean;
  view?: 'editor' | 'merge';
}

export interface Snapshot {
  id: string;
  name: string;
  timestamp: number;
  state: AppState;
}
