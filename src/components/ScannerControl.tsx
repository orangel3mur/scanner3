import { useState, useEffect, useMemo } from 'react';
import { Play, Square, Shuffle, ArrowRight, ArrowLeft, Loader2, Clock, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BitcoinRange, ScanJob, ScanProgress, PositiveHit } from '@/lib/types';
import { scanner } from '@/lib/scanner';
import { loadRandomScans, loadScanDuration, saveScanDuration } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

interface ScannerControlProps {
  ranges: BitcoinRange[];
  onJobUpdate: (job: ScanJob | null) => void;
  onProgress: (progress: ScanProgress | null) => void;
  onHit: (hit: PositiveHit) => void;
  onRangesUpdated?: () => void;
}

type ScanMode = 'random' | 'sequential-forward' | 'sequential-backward' | 'auto-switch';

export default function ScannerControl({ ranges, onJobUpdate, onProgress, onHit, onRangesUpdated }: ScannerControlProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [selectedMode, setSelectedMode] = useState<ScanMode>('random');
  const [selectedRange, setSelectedRange] = useState<string>('');
  const [progress, setProgress] = useState<ScanProgress | null>(null);
  const [currentJob, setCurrentJob] = useState<ScanJob | null>(null);
  const [scanDuration, setScanDuration] = useState<number>(loadScanDuration());

  const durationOptions = [
    { value: 1/60, label: '1 min' },
    { value: 5/60, label: '5 min' },
    { value: 10/60, label: '10 min' },
    { value: 0.25, label: '15 min' },
    { value: 0.5, label: '30 min' },
    { value: 1, label: '1 hr' },
    { value: 2, label: '2 hrs' },
    { value: 4, label: '4 hrs' },
    { value: 8, label: '8 hrs' },
    { value: 12, label: '12 hrs' },
    { value: 24, label: '24 hrs' },
    { value: 48, label: '48 hrs' },
  ];

  const handleDurationChange = (value: number) => {
    setScanDuration(value);
    saveScanDuration(value);
    toast({
      title: "Duration Updated",
      description: `Scan duration set to ${durationOptions.find(d => d.value === value)?.label}`,
    });
  };

  useEffect(() => {
    scanner.setCallbacks(
      (prog, hit) => {
        setProgress(prog);
        onProgress(prog);
        if (hit) {
          onHit(hit);
          toast({
            title: "🎯 POSITIVE HIT!",
            description: `Found ${hit.balance} sats at ${hit.address.slice(0, 20)}...`,
            variant: "default",
          });
        }
      },
      (job) => {
        setCurrentJob(job);
        onJobUpdate(job);
        setIsRunning(job?.status === 'running');

        if (job?.status === 'completed' || job?.status === 'stopped') {
          toast({
            title: "Scan Complete",
            description: `Scanned ${job.keysScanned.toLocaleString()} keys`,
          });
        }
      },
      () => {
        onRangesUpdated?.();
      },
      () => {
        if (ranges.length > 0) {
          const randomIndex = Math.floor(Math.random() * ranges.length);
          toast({
            title: "Switching Range",
            description: "Duration expired. Selecting new random range...",
          });
          return ranges[randomIndex];
        }
        return null;
      },
      (message?: string) => {
        toast({
          title: "⚠️ API Unavailable",
          description: message || "The balance API is unreachable. Scan paused — retrying with exponential backoff.",
          variant: "destructive",
        });
      },
      (error: string) => {
        toast({
          title: "❌ Invalid API Configuration",
          description: error,
          variant: "destructive",
        });
      }
    );
  }, [onJobUpdate, onProgress, onHit, onRangesUpdated, ranges]);

  const [isValidating, setIsValidating] = useState(false);

  const handleStart = async () => {
    if (ranges.length === 0) {
      toast({
        title: "No Ranges",
        description: "Please import or add ranges first.",
        variant: "destructive",
      });
      return;
    }

    // Validate API before scanning
    setIsValidating(true);
    const canScan = await scanner.validateBeforeScan();
    setIsValidating(false);
    if (!canScan) return;

    let targetRange: BitcoinRange | undefined;

    if (selectedMode === 'random' || selectedMode === 'auto-switch') {
      const randomIndex = Math.floor(Math.random() * ranges.length);
      targetRange = ranges[randomIndex];
    } else {
      if (!selectedRange) {
        toast({
          title: "Select Range",
          description: "Please select a range for sequential scanning.",
          variant: "destructive",
        });
        return;
      }
      targetRange = ranges.find(r => r.id === selectedRange);
    }

    if (!targetRange) {
      toast({
        title: "Error",
        description: "Could not find target range.",
        variant: "destructive",
      });
      return;
    }

    setIsRunning(true);

    if (selectedMode === 'random') {
      await scanner.startRandomScan(targetRange);
    } else if (selectedMode === 'auto-switch') {
      await scanner.startAutoSwitchScan(targetRange);
    } else {
      const direction = selectedMode === 'sequential-forward' ? 'forward' : 'backward';
      await scanner.startSequentialScan(targetRange, direction);
    }
  };

  const handleStop = async () => {
    await scanner.stop();
    setIsRunning(false);
    setProgress(null);
    onProgress(null);
  };

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((ms % (1000 * 60)) / 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className={`w-3 h-3 rounded-full ${isRunning ? 'bg-primary animate-pulse-glow' : 'bg-muted'}`} />
        <h2 className="text-xl font-display font-bold tracking-wider uppercase">Scanner Control</h2>
      </div>

      {/* Mode Selection */}
      <div className="grid grid-cols-4 gap-2">
        <Button
          variant={selectedMode === 'random' ? 'default' : 'outline'}
          onClick={() => setSelectedMode('random')}
          disabled={isRunning}
          className="flex-col h-auto py-3"
        >
          <Shuffle className="w-5 h-5 mb-1" />
          <span className="text-xs">Random</span>
        </Button>
        <Button
          variant={selectedMode === 'sequential-forward' ? 'default' : 'outline'}
          onClick={() => setSelectedMode('sequential-forward')}
          disabled={isRunning}
          className="flex-col h-auto py-3"
        >
          <ArrowRight className="w-5 h-5 mb-1" />
          <span className="text-xs">Forward</span>
        </Button>
        <Button
          variant={selectedMode === 'sequential-backward' ? 'default' : 'outline'}
          onClick={() => setSelectedMode('sequential-backward')}
          disabled={isRunning}
          className="flex-col h-auto py-3"
        >
          <ArrowLeft className="w-5 h-5 mb-1" />
          <span className="text-xs">Backward</span>
        </Button>
        <Button
          variant={selectedMode === 'auto-switch' ? 'default' : 'outline'}
          onClick={() => setSelectedMode('auto-switch')}
          disabled={isRunning}
          className="flex-col h-auto py-3"
        >
          <RefreshCw className="w-5 h-5 mb-1" />
          <span className="text-xs">Auto</span>
        </Button>
      </div>

      {/* Scan Duration Setting */}
      <div className="bg-secondary/30 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-2">
          <Clock className="w-4 h-4 text-primary" />
          <label className="text-sm text-muted-foreground uppercase tracking-wider">
            Scan Duration
          </label>
        </div>
        <div className="grid grid-cols-6 gap-1.5">
          {durationOptions.map((option) => (
            <Button
              key={option.value}
              variant={scanDuration === option.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => handleDurationChange(option.value)}
              disabled={isRunning}
              className="text-xs px-1"
            >
              {option.label}
            </Button>
          ))}
        </div>
      </div>
      {selectedMode !== 'random' && selectedMode !== 'auto-switch' && (
        <RangeSelector
          ranges={ranges}
          selectedRange={selectedRange}
          onSelect={setSelectedRange}
          disabled={isRunning}
        />
      )}

      {/* Start/Stop Controls */}
      <div className="flex gap-3">
        {!isRunning ? (
          <Button
            variant="default"
            size="lg"
            onClick={handleStart}
            className="flex-1"
            disabled={ranges.length === 0 || isValidating}
          >
            {isValidating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Validating API...
              </>
            ) : (
              <>
                <Play className="w-5 h-5 mr-2" />
                Start Scan
              </>
            )}
          </Button>
        ) : (
          <Button
            variant="destructive"
            size="lg"
            onClick={handleStop}
            className="flex-1"
          >
            <Square className="w-5 h-5 mr-2" />
            Stop Scan
          </Button>
        )}
      </div>

      {/* Progress Display */}
      {isRunning && progress && (
        <div className="bg-card/50 border border-primary/30 rounded-lg p-4 space-y-3 glow-border">
          <div className="flex items-center gap-2 text-primary">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm uppercase tracking-wider">
              {progress.apiPaused ? '⏸ Paused — Retrying API...' : 'Scanning...'}
            </span>
          </div>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Keys Scanned</span>
              <span className="font-mono text-foreground">{progress.keysScanned.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Speed</span>
              <span className="font-mono text-foreground">{progress.keysPerSecond.toFixed(2)} keys/sec</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Elapsed</span>
              <span className="font-mono text-foreground">{formatTime(progress.elapsedTime)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Remaining</span>
              <span className="font-mono text-foreground">{formatTime(progress.estimatedCompletion || 0)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Balance</span>
              <span className="font-mono text-foreground">{(progress.currentBalance ?? 0).toLocaleString()} sats</span>
            </div>
          </div>

          <div className="pt-2 border-t border-border/50 space-y-2">
            <div>
              <p className="text-xs text-muted-foreground mb-1">🔑 Private Key</p>
              <p className="hex-display text-primary text-xs break-all">{progress.currentKey}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">📬 Uncompressed Address</p>
              <p className="font-mono text-xs text-foreground break-all">{progress.uncompressedAddress || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">📬 Compressed Address</p>
              <p className="font-mono text-xs text-foreground break-all">{progress.compressedAddress || '—'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Mode Description */}
      <div className="text-xs text-muted-foreground bg-secondary/30 rounded p-3">
        {selectedMode === 'random' && (
          <p><strong className="text-foreground">Random Mode:</strong> Automatically selects a range and scans random keys within it for {durationOptions.find(d => d.value === scanDuration)?.label || `${scanDuration} hours`}.</p>
        )}
        {selectedMode === 'sequential-forward' && (
          <p><strong className="text-foreground">Forward Mode:</strong> Scans sequentially from the last forward position towards the end.</p>
        )}
        {selectedMode === 'sequential-backward' && (
          <p><strong className="text-foreground">Backward Mode:</strong> Scans sequentially from the last backward position towards the start.</p>
        )}
        {selectedMode === 'auto-switch' && (
          <p><strong className="text-foreground">Auto Mode:</strong> Alternates between backward and forward scans every 15 jobs, selecting random ranges continuously.</p>
        )}
      </div>
    </div>
  );
}

function RangeSelector({ ranges, selectedRange, onSelect, disabled }: {
  ranges: BitcoinRange[];
  selectedRange: string;
  onSelect: (id: string) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState('');

  const filteredRanges = useMemo(() => {
    if (!search.trim()) return ranges;
    const q = search.toLowerCase();
    return ranges.filter(r =>
      r.startHex.toLowerCase().includes(q) ||
      r.endHex.toLowerCase().includes(q)
    );
  }, [ranges, search]);

  return (
    <div>
      <label className="block text-sm text-muted-foreground mb-2 uppercase tracking-wider">
        Select Range
      </label>
      <div className="relative mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter ranges by hex..."
          disabled={disabled}
          className="w-full bg-input border border-border rounded px-3 py-2 pl-9 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
      </div>
      <select
        value={selectedRange}
        onChange={(e) => onSelect(e.target.value)}
        disabled={disabled}
        size={Math.min(8, filteredRanges.length + 1)}
        className="w-full bg-input border border-border rounded px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
      >
        <option value="">-- Select a range ({filteredRanges.length}/{ranges.length}) --</option>
        {filteredRanges.map((range) => {
          const status = range.backwardHex !== null && range.forwardHex !== null ? '⟳' :
            range.backwardHex !== null ? '←' : range.forwardHex !== null ? '→' : '○';
          return (
            <option key={range.id} value={range.id}>
              {status} {range.startHex.slice(0, 12)}... → {range.endHex.slice(0, 12)}...
            </option>
          );
        })}
      </select>
    </div>
  );
}
