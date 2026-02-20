import { useState, useRef } from 'react';
import { Upload, Download, Plus, Trash2, AlertCircle, Check, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { BitcoinRange } from '@/lib/types';
import { parseRangesFile, exportRangesFile } from '@/lib/storage';
import { loadRangesAsync, saveRangesAsync, appendRangesBatched, deleteRangesAsync } from '@/lib/rangeDb';
import { toast } from '@/hooks/use-toast';
import { Checkbox } from '@/components/ui/checkbox';

interface RangeManagerProps {
  ranges: BitcoinRange[];
  onRangesChange: (ranges: BitcoinRange[]) => void;
  isScanning?: boolean;
}

export default function RangeManager({ ranges, onRangesChange, isScanning = false }: RangeManagerProps) {
  const [newRange, setNewRange] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedRanges, setSelectedRanges] = useState<Set<string>>(new Set());

  const handleSelectAll = () => {
    if (selectedRanges.size === ranges.length) {
      setSelectedRanges(new Set());
    } else {
      setSelectedRanges(new Set(ranges.map(r => r.id)));
    }
  };

  const handleSelectRange = (id: string) => {
    const newSelected = new Set(selectedRanges);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedRanges(newSelected);
  };

  const handleDeleteSelected = async () => {
    if (selectedRanges.size === 0) return;
    
    const updatedRanges = ranges.filter(r => !selectedRanges.has(r.id));
    await deleteRangesAsync(selectedRanges);
    onRangesChange(updatedRanges);
    setSelectedRanges(new Set());
    
    toast({
      title: "Ranges Deleted",
      description: `Removed ${selectedRanges.size} range(s).`,
    });
  };

  const [importProgress, setImportProgress] = useState<{ current: number; total: number; phase: string } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportProgress({ current: 0, total: 1, phase: 'Reading file...' });
    await new Promise(resolve => setTimeout(resolve, 50));

    const content = await file.text();
    const lines = content.trim().split('\n').filter(line => line.trim());
    const totalLines = lines.length;
    const PARSE_BATCH = 500;

    const existingKeys = new Set(ranges.map(r => `${r.startHex}|${r.endHex}`));
    let allNewRanges: BitcoinRange[] = [];
    let duplicateCount = 0;

    // Phase 1: Parse lines in batches
    setImportProgress({ current: 0, total: totalLines, phase: 'Parsing ranges...' });
    await new Promise(resolve => setTimeout(resolve, 30));

    for (let i = 0; i < totalLines; i += PARSE_BATCH) {
      const batchLines = lines.slice(i, i + PARSE_BATCH).join('\n');
      const batchRanges = parseRangesFile(batchLines);

      for (const r of batchRanges) {
        const key = `${r.startHex}|${r.endHex}`;
        if (existingKeys.has(key)) {
          duplicateCount++;
        } else {
          existingKeys.add(key);
          allNewRanges.push(r);
        }
      }

      const processed = Math.min(i + PARSE_BATCH, totalLines);
      setImportProgress({ current: processed, total: totalLines, phase: `Parsing... ${processed.toLocaleString()} / ${totalLines.toLocaleString()} lines` });
      await new Promise(resolve => setTimeout(resolve, 30));
    }

    // Phase 2: Save to IndexedDB in batches with real progress
    const totalToSave = allNewRanges.length;
    setImportProgress({ current: 0, total: totalToSave, phase: `Saving 0 / ${totalToSave.toLocaleString()} ranges...` });
    await new Promise(resolve => setTimeout(resolve, 30));

    await appendRangesBatched(allNewRanges, 500, (done) => {
      setImportProgress({ current: done, total: totalToSave, phase: `Saving ${done.toLocaleString()} / ${totalToSave.toLocaleString()} ranges...` });
    });

    onRangesChange([...ranges, ...allNewRanges]);
    setImportProgress(null);

    if (duplicateCount > 0) {
      toast({
        title: "Duplicate Ranges Detected",
        description: `${duplicateCount} duplicates skipped. Added ${allNewRanges.length} new ranges.`,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Ranges Imported",
        description: `Added ${allNewRanges.length} new ranges.`,
      });
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddRange = async () => {
    if (!newRange.trim()) return;
    
    const newRanges = parseRangesFile(newRange);
    if (newRanges.length === 0) {
      toast({
        title: "Invalid Format",
        description: "Please use format: start_hex-end_hex",
        variant: "destructive",
      });
      return;
    }
    
    const existingKeys = new Set(ranges.map(r => `${r.startHex}|${r.endHex}`));
    const duplicates = newRanges.filter(r => existingKeys.has(`${r.startHex}|${r.endHex}`));
    
    if (duplicates.length > 0) {
      toast({
        title: "Duplicate Range",
        description: "This range already exists.",
        variant: "destructive",
      });
      return;
    }
    
    const updatedRanges = [...ranges, ...newRanges];
    await saveRangesAsync(updatedRanges);
    onRangesChange(updatedRanges);
    setNewRange('');
    setShowAddForm(false);
    
    toast({
      title: "Range Added",
      description: "New range has been added successfully.",
    });
  };

  const handleDeleteRange = async (id: string) => {
    const updatedRanges = ranges.filter(r => r.id !== id);
    await deleteRangesAsync(new Set([id]));
    onRangesChange(updatedRanges);
    
    toast({
      title: "Range Deleted",
      description: "Range has been removed.",
    });
  };

  const workedOnCount = ranges.filter(r => r.backwardHex !== null || r.forwardHex !== null).length;

  const handleExport = (exportAll: boolean) => {
    exportRangesFile(ranges, exportAll);
    setShowExportOptions(false);
    toast({
      title: "Export Complete",
      description: exportAll
        ? `All ${ranges.length} ranges exported to ranges.txt`
        : `${workedOnCount} worked-on ranges exported to ranges.txt`,
    });
  };

  const getStatusBadge = (range: BitcoinRange) => {
    const hasBackward = range.backwardHex !== null;
    const hasForward = range.forwardHex !== null;
    
    if (!hasBackward && !hasForward) {
      return <span className="px-2 py-0.5 text-xs rounded bg-muted text-muted-foreground">PENDING</span>;
    } else if (hasBackward && hasForward) {
      return <span className="px-2 py-0.5 text-xs rounded bg-primary/20 text-primary">BOTH SCANNED</span>;
    } else if (hasForward) {
      return <span className="px-2 py-0.5 text-xs rounded bg-accent/20 text-accent">FWD SCANNED</span>;
    } else {
      return <span className="px-2 py-0.5 text-xs rounded bg-accent/20 text-accent">BWD SCANNED</span>;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <FileText className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-display font-bold tracking-wider uppercase">Range Manager</h2>
          <span className="text-muted-foreground text-sm">({ranges.length} ranges)</span>
        </div>
        <div className="flex gap-2">
          {selectedRanges.size > 0 && (
            <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete ({selectedRanges.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={isScanning}>
            <Upload className="w-4 h-4 mr-2" />
            Import
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowExportOptions(!showExportOptions)} disabled={ranges.length === 0 || isScanning}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="terminal" size="sm" onClick={() => setShowAddForm(!showAddForm)} disabled={isScanning}>
            <Plus className="w-4 h-4 mr-2" />
            Add
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>
      </div>

      {showAddForm && (
        <div className="bg-card/50 border border-primary/30 rounded-lg p-4 glow-border">
          <label className="block text-sm text-muted-foreground mb-2">
            Add Range (format: start_hex-end_hex* or start_hex-end_hex-)
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={newRange}
              onChange={(e) => setNewRange(e.target.value)}
              placeholder="e.g., f9c25da6...-f9c25da6...*"
              className="flex-1 bg-input border border-border rounded px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <Button onClick={handleAddRange}>
              <Check className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {showExportOptions && (
        <div className="bg-card/50 border border-primary/30 rounded-lg p-4 glow-border">
          <p className="text-sm text-muted-foreground mb-3 uppercase tracking-wider">Export Options</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => handleExport(false)} disabled={workedOnCount === 0}>
              <Download className="w-4 h-4 mr-2" />
              Worked On ({workedOnCount})
            </Button>
            <Button variant="outline" size="sm" onClick={() => handleExport(true)}>
              <Download className="w-4 h-4 mr-2" />
              All Ranges ({ranges.length})
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setShowExportOptions(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {importProgress && (
        <div className="bg-card/50 border border-primary/30 rounded-lg p-4 glow-border">
          <p className="text-sm text-muted-foreground mb-2 uppercase tracking-wider">
            {importProgress.phase}
          </p>
          <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
            <div
              className="bg-primary h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((importProgress.current / importProgress.total) * 100)}%` }}
            />
          </div>
        </div>
      )}

      <div className="bg-card/30 border border-border rounded-lg overflow-hidden">
        <div className="max-h-80 overflow-y-auto scrollbar-terminal">
          {ranges.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No ranges loaded. Import a ranges.txt file or add ranges manually.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 sticky top-0">
                <tr>
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={ranges.length > 0 && selectedRanges.size === ranges.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">Start</th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">End</th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">Status</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {ranges.map((range) => (
                  <tr key={range.id} className={`border-t border-border/50 hover:bg-primary/5 transition-colors ${selectedRanges.has(range.id) ? 'bg-primary/10' : ''}`}>
                    <td className="p-3">
                      <Checkbox
                        checked={selectedRanges.has(range.id)}
                        onCheckedChange={() => handleSelectRange(range.id)}
                      />
                    </td>
                    <td className="p-3">
                      <span className="hex-display text-foreground">{range.startHex.slice(0, 16)}...</span>
                    </td>
                    <td className="p-3">
                      <span className="hex-display text-foreground">{range.endHex.slice(0, 16)}...</span>
                    </td>
                    <td className="p-3">{getStatusBadge(range)}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDeleteRange(range.id)}
                        className="hover:bg-destructive/20 hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
