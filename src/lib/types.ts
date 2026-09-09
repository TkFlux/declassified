export type Agency =
  | 'NARA'
  | 'NDC'
  | 'FBI'
  | 'CIA'
  | 'STATE'
  | 'NSA'
  | 'OTHER';

export type DownloadKind = 'file' | 'page' | 'none';

export interface RecordRow {
  id: string;
  title: string;
  summary: string;
  agency: Agency;
  source: string;
  source_url: string;
  download_url: string | null;
  thumbnail_url: string | null;
  published_at: string | null;
  collected_at: string;
  raw_meta: string | null;
}

export interface DraftRow {
  id: number;
  record_id: string;
  text: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
  updated_at: string;
}

export interface RecordFilters {
  q?: string;
  agency?: string;
  download?: 'available' | 'page-only' | 'all';
  limit?: number;
  offset?: number;
}

export interface CrawlSourceResult {
  source: string;
  fetched: number;
  upserted: number;
  errors: string[];
}
