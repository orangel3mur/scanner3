import { BitcoinRange, ScanJob, PositiveHit, ScanProgress } from './types';
import { privateKeyToAddress, getBalance, hexToInt, intToHex, generateRandomKeyInRange, validateApiUrl } from './bitcoin';
import { saveJobs, saveHits, loadJobs, loadHits, saveRandomScans, loadRandomScans, loadScanDuration } from './storage';
import { loadRangesAsync, updateRangeAsync } from './rangeDb';
import { workerDelay } from './worker-timer';

const API_DELAY_MS = 100;
const API_HEALTH_CHECK_INTERVAL = 50;
const MAX_API_RETRIES = 30;

function getScanDurationMs(): number {
  return loadScanDuration() * 60 * 60 * 1000;
}

export type ScanCallback = (progress: ScanProgress, hit?: PositiveHit) => void;
export type JobCallback = (job: ScanJob) => void;
export type RangesUpdatedCallback = () => void;
export type SelectNewRangeCallback = () => BitcoinRange | null;
export type ApiUnavailableCallback = (message?: string) => void;
export type ApiValidationFailedCallback = (error: string) => void;

class ScannerEngine {
  private isRunning = false;
  private shouldStop = false;
  private currentJob: ScanJob | null = null;
  private progressCallback: ScanCallback | null = null;
  private jobCallback: JobCallback | null = null;
  private rangesUpdatedCallback: RangesUpdatedCallback | null = null;
  private selectNewRangeCallback: SelectNewRangeCallback | null = null;
  private apiUnavailableCallback: ApiUnavailableCallback | null = null;
  private apiValidationFailedCallback: ApiValidationFailedCallback | null = null;
  private keysScanned = 0;
  private startTime = 0;
  private apiNotifiedUnavailable = false;
  private lastApiUnavailableToastTime = 0;
  private currentCompressedAddr = '';
  private currentUncompressedAddr = '';
  private currentBalance = 0;
  private static readonly API_TOAST_COOLDOWN_MS = 60_000;

  setCallbacks(
    progress: ScanCallback,
    job: JobCallback,
    rangesUpdated?: RangesUpdatedCallback,
    selectNewRange?: SelectNewRangeCallback,
    apiUnavailable?: ApiUnavailableCallback,
    apiValidationFailed?: ApiValidationFailedCallback
  ): void {
    this.progressCallback = progress;
    this.jobCallback = job;
    this.rangesUpdatedCallback = rangesUpdated || null;
    this.selectNewRangeCallback = selectNewRange || null;
    this.apiUnavailableCallback = apiUnavailable || null;
    this.apiValidationFailedCallback = apiValidationFailed || null;
  }

  isScanning(): boolean {
    return this.isRunning;
  }

  getCurrentJob(): ScanJob | null {
    return this.currentJob;
  }




  async stop(): Promise<void> {
    this.shouldStop = true;
    while (this.isRunning) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  async validateBeforeScan(): Promise<boolean> {
    const { loadApiUrl } = await import('./storage');
    const apiUrl = loadApiUrl();
    const result = await validateApiUrl(apiUrl);
    if (!result.valid) {
      this.apiValidationFailedCallback?.(result.error || 'Invalid API URL');
      return false;
    }
    return true;
  }

  async startRandomScan(range: BitcoinRange): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.shouldStop = false;
    this.apiNotifiedUnavailable = false;

    let currentRange: BitcoinRange | null = range;

    while (!this.shouldStop && currentRange) {
      await this.scanRandomRange(currentRange);

      if (this.shouldStop) break;

      currentRange = this.selectNewRangeCallback?.() || null;

      if (currentRange) {
        await workerDelay(500);
      }
    }

    this.isRunning = false;
  }

  private async scanRandomRange(range: BitcoinRange): Promise<void> {
    this.keysScanned = 0;
    this.startTime = Date.now();

    const job: ScanJob = {
      id: crypto.randomUUID(),
      rangeId: range.id,
      type: 'random',
      startTime: Date.now(),
      endTime: null,
      status: 'running',
      keysScanned: 0,
      currentPosition: range.startHex,
      range: { start: range.startHex, end: range.endHex },
    };

    this.currentJob = job;
    this.jobCallback?.(job);

    const randomScans = loadRandomScans();
    if (!randomScans.includes(range.id)) {
      randomScans.push(range.id);
      saveRandomScans(randomScans);
    }

    try {
      while (!this.shouldStop && (Date.now() - this.startTime) < getScanDurationMs()) {
        const randomKey = generateRandomKeyInRange(range.startHex, range.endHex);

        // Generate both addresses first
        const uncompressedAddr = await privateKeyToAddress(randomKey, false);
        const compressedAddr = await privateKeyToAddress(randomKey, true);
        this.currentUncompressedAddr = uncompressedAddr || '';
        this.currentCompressedAddr = compressedAddr || '';
        this.currentBalance = 0;

        // Check balances with retry on API errors
        for (const [compressed, address] of [[false, uncompressedAddr], [true, compressedAddr]] as [boolean, string | null][]) {
          if (!address) continue;

          const balance = await this.fetchBalanceWithRetry(address);
          if (balance === null) {
            // shouldStop was set during retry exhaustion
            break;
          }

          this.currentBalance = balance;
          this.progressCallback?.(this.getProgress(randomKey));

          if (balance > 0) {
            const hit: PositiveHit = {
              id: crypto.randomUUID(),
              privateKey: randomKey,
              address,
              balance,
              compressed,
              foundAt: Date.now(),
              jobId: job.id,
              rangeId: range.id,
            };

            const hits = loadHits();
            hits.push(hit);
            saveHits(hits);

            this.progressCallback?.(this.getProgress(randomKey), hit);
          }
        }

        if (this.shouldStop) break;

        this.keysScanned++;
        job.keysScanned = this.keysScanned;
        job.currentPosition = randomKey;

        this.progressCallback?.(this.getProgress(randomKey));

        await workerDelay(API_DELAY_MS);
      }
    } finally {
      job.endTime = Date.now();
      job.status = this.shouldStop ? 'stopped' : 'completed';

      const jobs = loadJobs();
      jobs.push(job);
      saveJobs(jobs);

      this.currentJob = null;
      this.jobCallback?.(job);
      this.rangesUpdatedCallback?.();
    }
  }

  async startSequentialScan(
    range: BitcoinRange,
    direction: 'forward' | 'backward'
  ): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.shouldStop = false;
    this.apiNotifiedUnavailable = false;

    let currentRange: BitcoinRange | null = range;

    while (!this.shouldStop && currentRange) {
      this.keysScanned = 0;
      this.startTime = Date.now();

      await this.scanRangeForDuration(currentRange, direction);

      if (this.shouldStop) break;

      currentRange = this.selectNewRangeCallback?.() || null;

      if (currentRange) {
        await workerDelay(500);
      }
    }

    this.isRunning = false;
  }

  async startAutoSwitchScan(range: BitcoinRange): Promise<void> {
    if (this.isRunning) return;

    this.isRunning = true;
    this.shouldStop = false;
    this.apiNotifiedUnavailable = false;

    let currentRange: BitcoinRange | null = range;
    let direction: 'forward' | 'backward' = 'backward';
    let jobsInCurrentDirection = 0;

    while (!this.shouldStop && currentRange) {
      this.keysScanned = 0;
      this.startTime = Date.now();

      await this.scanRangeForDuration(currentRange, direction);

      if (this.shouldStop) break;

      jobsInCurrentDirection++;

      if (jobsInCurrentDirection >= 15) {
        direction = direction === 'backward' ? 'forward' : 'backward';
        jobsInCurrentDirection = 0;
      }

      currentRange = this.selectNewRangeCallback?.() || null;

      if (currentRange) {
        await workerDelay(500);
      }
    }

    this.isRunning = false;
  }

  // Fetch balance with exponential backoff retry (like Python script)
  private async fetchBalanceWithRetry(address: string): Promise<number | null> {
    for (let attempt = 1; attempt <= MAX_API_RETRIES; attempt++) {
      if (this.shouldStop) return null;
      try {
        const balance = await getBalance(address);
        this.apiNotifiedUnavailable = false;
        return balance;
      } catch (err) {
        console.warn(`[${attempt}/${MAX_API_RETRIES}] API error for ${address}:`, err);

        // Notify UI about pause
        const now = Date.now();
        if (!this.apiNotifiedUnavailable && (now - this.lastApiUnavailableToastTime) > ScannerEngine.API_TOAST_COOLDOWN_MS) {
          this.apiNotifiedUnavailable = true;
          this.lastApiUnavailableToastTime = now;
          this.apiUnavailableCallback?.();
        }

        // Show paused state in progress
        this.progressCallback?.({ ...this.getProgress(address), apiPaused: true });

        const wait = Math.min(2 ** attempt, 30) * 1000;
        await workerDelay(wait);
      }
    }
    // Exhausted retries — stop scanning
    this.shouldStop = true;
    this.apiUnavailableCallback?.(`Failed to reach API after ${MAX_API_RETRIES} attempts. Scan stopped.`);
    return null;
  }

  private async scanRangeForDuration(
    range: BitcoinRange,
    direction: 'forward' | 'backward'
  ): Promise<{ hitFound: boolean }> {
    let currentHex: string;
    const step = direction === 'forward' ? BigInt(1) : BigInt(-1);

    if (direction === 'forward') {
      currentHex = range.forwardHex || range.endHex;
    } else {
      currentHex = range.backwardHex || range.startHex;
    }

    const job: ScanJob = {
      id: crypto.randomUUID(),
      rangeId: range.id,
      type: direction === 'forward' ? 'sequential-forward' : 'sequential-backward',
      startTime: Date.now(),
      endTime: null,
      status: 'running',
      keysScanned: 0,
      currentPosition: currentHex,
      range: { start: range.startHex, end: range.endHex },
    };

    this.currentJob = job;
    this.jobCallback?.(job);

    let currentInt = hexToInt(currentHex);
    let hitFound = false;
    let lastScannedHex = currentHex;

    try {
      while (!this.shouldStop && !hitFound && (Date.now() - this.startTime) < getScanDurationMs()) {
        const hexKey = intToHex(currentInt);
        lastScannedHex = hexKey;

        const uncompressedAddr = await privateKeyToAddress(hexKey, false);
        const compressedAddr = await privateKeyToAddress(hexKey, true);
        this.currentUncompressedAddr = uncompressedAddr || '';
        this.currentCompressedAddr = compressedAddr || '';
        this.currentBalance = 0;

        for (const [compressed, address] of [[false, uncompressedAddr], [true, compressedAddr]] as [boolean, string | null][]) {
          if (!address) continue;

          const balance = await this.fetchBalanceWithRetry(address);
          if (balance === null) break;

          this.currentBalance = balance;
          this.progressCallback?.(this.getProgress(hexKey));

          if (balance > 0) {
            const hit: PositiveHit = {
              id: crypto.randomUUID(),
              privateKey: hexKey,
              address,
              balance,
              compressed,
              foundAt: Date.now(),
              jobId: job.id,
              rangeId: range.id,
            };

            const hits = loadHits();
            hits.push(hit);
            saveHits(hits);

            this.progressCallback?.(this.getProgress(hexKey), hit);
            hitFound = true;
            break;
          }
        }

        if (hitFound || this.shouldStop) break;

        this.keysScanned++;
        job.keysScanned = this.keysScanned;
        job.currentPosition = hexKey;

        this.progressCallback?.(this.getProgress(hexKey));

        currentInt += step;
        await workerDelay(API_DELAY_MS);
      }
    } finally {
      if (direction === 'forward') {
        await updateRangeAsync(range.id, { forwardHex: lastScannedHex });
      } else {
        await updateRangeAsync(range.id, { backwardHex: lastScannedHex });
      }

      job.endTime = Date.now();
      job.status = this.shouldStop ? 'stopped' : 'completed';

      const jobs = loadJobs();
      jobs.push(job);
      saveJobs(jobs);

      this.currentJob = null;
      this.jobCallback?.(job);
      this.rangesUpdatedCallback?.();
    }

    return { hitFound };
  }

  private getProgress(currentKey: string): ScanProgress {
    const elapsed = Date.now() - this.startTime;
    const keysPerSecond = this.keysScanned / (elapsed / 1000) || 0;

    return {
      keysScanned: this.keysScanned,
      currentKey,
      keysPerSecond,
      elapsedTime: elapsed,
      estimatedCompletion: getScanDurationMs() - elapsed,
      compressedAddress: this.currentCompressedAddr,
      uncompressedAddress: this.currentUncompressedAddr,
      currentBalance: this.currentBalance,
    };
  }
}

export const scanner = new ScannerEngine();
