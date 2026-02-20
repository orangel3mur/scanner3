import { BitcoinRange, ScanJob, PositiveHit } from './types';

const STORAGE_KEYS = {
  RANGES: 'btc_scanner_ranges',
  JOBS: 'btc_scanner_jobs',
  HITS: 'btc_scanner_hits',
  RANDOM_SCANS: 'btc_scanner_random_scans',
  SCAN_DURATION: 'btc_scanner_duration',
  API_URL: 'btc_scanner_api_url',
};

const DEFAULT_SCAN_DURATION_HOURS = 1;
const DEFAULT_API_URL = 'https://api.haskoin.com/btc/address';

export function loadApiUrl(): string {
  return localStorage.getItem(STORAGE_KEYS.API_URL) || DEFAULT_API_URL;
}

export function saveApiUrl(url: string): void {
  localStorage.setItem(STORAGE_KEYS.API_URL, url);
}

export function loadScanDuration(): number {
  const stored = localStorage.getItem(STORAGE_KEYS.SCAN_DURATION);
  return stored ? parseFloat(stored) : DEFAULT_SCAN_DURATION_HOURS;
}

export function saveScanDuration(hours: number): void {
  localStorage.setItem(STORAGE_KEYS.SCAN_DURATION, hours.toString());
}

export function loadRanges(): BitcoinRange[] {
  const stored = localStorage.getItem(STORAGE_KEYS.RANGES);
  return stored ? JSON.parse(stored) : [];
}

export function saveRanges(ranges: BitcoinRange[]): void {
  localStorage.setItem(STORAGE_KEYS.RANGES, JSON.stringify(ranges));
}

export function loadJobs(): ScanJob[] {
  const stored = localStorage.getItem(STORAGE_KEYS.JOBS);
  return stored ? JSON.parse(stored) : [];
}

export function saveJobs(jobs: ScanJob[]): void {
  localStorage.setItem(STORAGE_KEYS.JOBS, JSON.stringify(jobs));
}

export function loadHits(): PositiveHit[] {
  const stored = localStorage.getItem(STORAGE_KEYS.HITS);
  return stored ? JSON.parse(stored) : [];
}

export function saveHits(hits: PositiveHit[]): void {
  localStorage.setItem(STORAGE_KEYS.HITS, JSON.stringify(hits));
}

export function loadRandomScans(): string[] {
  const stored = localStorage.getItem(STORAGE_KEYS.RANDOM_SCANS);
  return stored ? JSON.parse(stored) : [];
}

export function saveRandomScans(scans: string[]): void {
  localStorage.setItem(STORAGE_KEYS.RANDOM_SCANS, JSON.stringify(scans));
}

function isValidHex(str: string): boolean {
  if (!str || str.length === 0) return false;
  return /^[0-9a-fA-F]+$/.test(str);
}

export function parseRangesFile(content: string): BitcoinRange[] {
  const lines = content.trim().split('\n').filter(line => line.trim());
  const ranges: BitcoinRange[] = [];
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    const endsWithAsterisk = trimmedLine.endsWith('*');
    const endsWithHyphen = trimmedLine.endsWith('-') && !endsWithAsterisk;
    
    // Remove trailing * or - for parsing
    const cleanLine = trimmedLine.replace(/[\*\-]$/, '');
    const parts = cleanLine.split('-');
    
    if (parts.length >= 2) {
      const startHex = parts[0].trim().toLowerCase();
      const endHex = parts[1].trim().toLowerCase();
      
      // Validate both hex values are present and valid
      if (!isValidHex(startHex) || !isValidHex(endHex)) {
        console.warn(`Skipping invalid range line: "${trimmedLine}" - invalid hex values`);
        continue;
      }
      
      // Determine scan status from the format:
      // - Suffix `-`: both backward and forward scanned (backwardHex=startHex, forwardHex=endHex)
      // - Suffix `*`: forward not scanned. If startHex ends with '000', range is truly
      //   pending (never scanned). Otherwise, startHex IS the backward progress position.
      const isTrulyPending = endsWithAsterisk && startHex.endsWith('000') && endHex.endsWith('000');
      
      ranges.push({
        id: crypto.randomUUID(),
        startHex,
        endHex,
        backwardHex: isTrulyPending ? null : startHex,
        forwardHex: endsWithHyphen ? endHex : null,
        status: 'pending',
        originalLine: trimmedLine,
      });
    } else {
      console.warn(`Skipping invalid range line: "${trimmedLine}" - missing hex values`);
    }
  }
  
  return ranges;
}

export function rangesToFileContent(ranges: BitcoinRange[]): string {
  // Only export ranges that have been scanned (backwardHex or forwardHex is set)
  const scannedRanges = ranges.filter(range => 
    range.backwardHex !== null || range.forwardHex !== null
  );
  
  return scannedRanges.map(range => {
    // First hex = backwardHex (if scanned) or startHex (if not)
    const firstHex = range.backwardHex ?? range.startHex;
    // Second hex = forwardHex (if scanned) or endHex (if not)
    const secondHex = range.forwardHex ?? range.endHex;
    // Marker: * if forward not started, - if forward has been scanned
    const marker = range.forwardHex !== null ? '-' : '*';
    
    return `${firstHex}-${secondHex}${marker}`;
  }).join('\n');
}

export function exportToJson<T>(data: T, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function allRangesToFileContent(ranges: BitcoinRange[]): string {
  return ranges.map(range => {
    const firstHex = range.backwardHex ?? range.startHex;
    const secondHex = range.forwardHex ?? range.endHex;
    const marker = range.forwardHex !== null ? '-' : '*';
    return `${firstHex}-${secondHex}${marker}`;
  }).join('\n');
}

export function exportRangesFile(ranges: BitcoinRange[], exportAll: boolean = false): void {
  const content = exportAll ? allRangesToFileContent(ranges) : rangesToFileContent(ranges);
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ranges.txt';
  a.click();
  URL.revokeObjectURL(url);
}
