import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BitcoinRange } from '@/lib/types';

// Mock worker-timer to use regular setTimeout (no Web Worker in test env)
vi.mock('@/lib/worker-timer', () => ({
  workerDelay: vi.fn((ms: number) => new Promise(resolve => setTimeout(resolve, ms))),
  terminateWorkerTimer: vi.fn(),
}));

// Mock storage module
vi.mock('@/lib/storage', () => ({
  loadRanges: vi.fn(() => []),
  saveRanges: vi.fn(),
  loadJobs: vi.fn(() => []),
  saveJobs: vi.fn(),
  loadHits: vi.fn(() => []),
  saveHits: vi.fn(),
  loadRandomScans: vi.fn(() => []),
  saveRandomScans: vi.fn(),
  loadScanDuration: vi.fn(() => 1), // 1 hour
  loadApiUrl: vi.fn(() => 'https://api.haskoin.com/btc/address'),
}));

// Mock bitcoin module - make getBalance and privateKeyToAddress fast no-ops
vi.mock('@/lib/bitcoin', async () => {
  const actual = await vi.importActual('@/lib/bitcoin') as any;
  return {
    ...actual,
    privateKeyToAddress: vi.fn(async () => '1FakeAddress'),
    getBalance: vi.fn(async () => 0),
  };
});

import { scanner } from '@/lib/scanner';
import { saveRanges, loadRanges, saveJobs, loadJobs, loadScanDuration } from '@/lib/storage';
import { hexToInt, intToHex } from '@/lib/bitcoin';

function makeRange(overrides: Partial<BitcoinRange> = {}): BitcoinRange {
  return {
    id: 'test-range-1',
    startHex: '0000000000000000000000000000000000000000000000000000000000000100', // larger (100 = 256)
    endHex:   '0000000000000000000000000000000000000000000000000000000000000001', // smaller (1)
    backwardHex: null,
    forwardHex: null,
    status: 'pending',
    originalLine: '100-1*',
    ...overrides,
  };
}

describe('Scanner resume positions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Set duration to very short for testing (1/60 hour = 1 minute)
    vi.mocked(loadScanDuration).mockReturnValue(1 / 3600); // 1 second
    vi.mocked(loadRanges).mockReturnValue([]);
    vi.mocked(loadJobs).mockReturnValue([]);
  });

  it('forward scan starts from endHex (smaller) when no forwardHex', async () => {
    const range = makeRange({ forwardHex: null });
    const savedRanges: BitcoinRange[][] = [];
    vi.mocked(saveRanges).mockImplementation((r) => { savedRanges.push([...r]); });
    vi.mocked(loadRanges).mockReturnValue([{ ...range }]);

    scanner.setCallbacks(() => {}, () => {});
    await scanner.startSequentialScan(range, 'forward');

    // Should have saved ranges with forwardHex updated
    expect(savedRanges.length).toBeGreaterThan(0);
    const lastSave = savedRanges[savedRanges.length - 1];
    const updatedRange = lastSave.find(r => r.id === range.id);
    expect(updatedRange).toBeDefined();
    expect(updatedRange!.forwardHex).toBeDefined();
    
    // forwardHex should be >= endHex (started from endHex and incremented)
    const forwardInt = hexToInt(updatedRange!.forwardHex!);
    const endInt = hexToInt(range.endHex);
    expect(forwardInt >= endInt).toBe(true);
  });

  it('forward scan resumes from saved forwardHex position', async () => {
    const resumePos = '0000000000000000000000000000000000000000000000000000000000000050';
    const range = makeRange({ forwardHex: resumePos });
    const savedRanges: BitcoinRange[][] = [];
    vi.mocked(saveRanges).mockImplementation((r) => { savedRanges.push([...r]); });
    vi.mocked(loadRanges).mockReturnValue([{ ...range }]);

    scanner.setCallbacks(() => {}, () => {});
    await scanner.startSequentialScan(range, 'forward');

    const lastSave = savedRanges[savedRanges.length - 1];
    const updatedRange = lastSave.find(r => r.id === range.id);
    expect(updatedRange).toBeDefined();
    
    // Should have advanced past the resume position
    const forwardInt = hexToInt(updatedRange!.forwardHex!);
    const resumeInt = hexToInt(resumePos);
    expect(forwardInt >= resumeInt).toBe(true);
  });

  it('backward scan starts from startHex (larger) when no backwardHex', async () => {
    const range = makeRange({ backwardHex: null });
    const savedRanges: BitcoinRange[][] = [];
    vi.mocked(saveRanges).mockImplementation((r) => { savedRanges.push([...r]); });
    vi.mocked(loadRanges).mockReturnValue([{ ...range }]);

    scanner.setCallbacks(() => {}, () => {});
    await scanner.startSequentialScan(range, 'backward');

    const lastSave = savedRanges[savedRanges.length - 1];
    const updatedRange = lastSave.find(r => r.id === range.id);
    expect(updatedRange).toBeDefined();
    expect(updatedRange!.backwardHex).toBeDefined();
    
    // backwardHex should be <= startHex (started from startHex and decremented)
    const backwardInt = hexToInt(updatedRange!.backwardHex!);
    const startInt = hexToInt(range.startHex);
    expect(backwardInt <= startInt).toBe(true);
  });

  it('backward scan resumes from saved backwardHex position', async () => {
    const resumePos = '00000000000000000000000000000000000000000000000000000000000000c0';
    const range = makeRange({ backwardHex: resumePos });
    const savedRanges: BitcoinRange[][] = [];
    vi.mocked(saveRanges).mockImplementation((r) => { savedRanges.push([...r]); });
    vi.mocked(loadRanges).mockReturnValue([{ ...range }]);

    scanner.setCallbacks(() => {}, () => {});
    await scanner.startSequentialScan(range, 'backward');

    const lastSave = savedRanges[savedRanges.length - 1];
    const updatedRange = lastSave.find(r => r.id === range.id);
    expect(updatedRange).toBeDefined();
    
    // Should have decremented past the resume position
    const backwardInt = hexToInt(updatedRange!.backwardHex!);
    const resumeInt = hexToInt(resumePos);
    expect(backwardInt <= resumeInt).toBe(true);
  });

  it('auto-switch scan alternates directions and resumes correctly', async () => {
    const range = makeRange({ backwardHex: null, forwardHex: null });
    const savedRanges: BitcoinRange[][] = [];
    vi.mocked(saveRanges).mockImplementation((r) => { savedRanges.push([...r]); });
    vi.mocked(loadRanges).mockImplementation(() => {
      // Return latest saved state or initial
      if (savedRanges.length > 0) return [...savedRanges[savedRanges.length - 1]];
      return [{ ...range }];
    });

    // For auto-switch, it needs a selectNewRange callback that returns null to stop after 1 job
    scanner.setCallbacks(() => {}, () => {}, undefined, () => null);
    await scanner.startAutoSwitchScan(range);

    // Should have saved at least one range update
    expect(savedRanges.length).toBeGreaterThan(0);
    const lastSave = savedRanges[savedRanges.length - 1];
    const updatedRange = lastSave.find(r => r.id === range.id);
    expect(updatedRange).toBeDefined();
    
    // Auto starts with backward, so backwardHex should be set
    expect(updatedRange!.backwardHex).toBeDefined();
  });
});
