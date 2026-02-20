export interface BitcoinRange {
  id: string;
  startHex: string;
  endHex: string;
  backwardHex: string | null; // null means not scanned
  forwardHex: string | null;  // null means not scanned
  status: 'pending' | 'in-progress' | 'completed';
  originalLine: string;
}

export interface ScanJob {
  id: string;
  rangeId: string;
  type: 'random' | 'sequential-forward' | 'sequential-backward';
  startTime: number;
  endTime: number | null;
  status: 'running' | 'completed' | 'stopped';
  keysScanned: number;
  currentPosition: string;
  range: {
    start: string;
    end: string;
  };
}

export interface PositiveHit {
  id: string;
  privateKey: string;
  address: string;
  balance: number;
  compressed: boolean;
  foundAt: number;
  jobId: string;
  rangeId: string;
}

export interface ScannerState {
  ranges: BitcoinRange[];
  jobs: ScanJob[];
  hits: PositiveHit[];
  activeJob: ScanJob | null;
  currentKey: string;
  keysPerSecond: number;
  totalKeysScanned: number;
}

export interface ScanProgress {
  keysScanned: number;
  currentKey: string;
  keysPerSecond: number;
  elapsedTime: number;
  estimatedCompletion: number | null;
  compressedAddress?: string;
  uncompressedAddress?: string;
  currentBalance?: number;
  apiPaused?: boolean;
}
