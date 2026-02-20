import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Dashboard from '@/components/Dashboard';
import ScannerControl from '@/components/ScannerControl';
import RangeManager from '@/components/RangeManager';
import JobHistory from '@/components/JobHistory';
import HitsViewer from '@/components/HitsViewer';
import ApiSettings from '@/components/ApiSettings';
import { BitcoinRange, ScanJob, ScanProgress, PositiveHit } from '@/lib/types';
import { loadJobs, loadHits } from '@/lib/storage';
import { loadRangesAsync } from '@/lib/rangeDb';

export default function Index() {
  const [ranges, setRanges] = useState<BitcoinRange[]>([]);
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [hits, setHits] = useState<PositiveHit[]>([]);
  const [currentJob, setCurrentJob] = useState<ScanJob | null>(null);
  const [progress, setProgress] = useState<ScanProgress | null>(null);

  useEffect(() => {
    loadRangesAsync().then(setRanges);
    setJobs(loadJobs());
    setHits(loadHits());
  }, []);

  const handleJobUpdate = (job: ScanJob | null) => {
    setCurrentJob(job);
    if (job?.status !== 'running') {
      setJobs(loadJobs());
    }
  };

  const handleHit = (hit: PositiveHit) => {
    setHits(prev => [...prev, hit]);
  };

  const handleRangesUpdated = () => {
    // Reload ranges from storage when scanner updates them
    loadRangesAsync().then(setRanges);
  };

  const isScanning = currentJob?.status === 'running';

  return (
    <div className="min-h-screen bg-background matrix-bg">
      <Header isScanning={isScanning} />
      
      <main className="container mx-auto px-6 py-8 space-y-8">
        {/* Dashboard */}
        <section>
          <Dashboard />
        </section>

        {/* Main Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Scanner Control - Left Column */}
          <div className="lg:col-span-1">
            <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-6 glow-border sticky top-24">
              <ScannerControl
                ranges={ranges}
                onJobUpdate={handleJobUpdate}
                onProgress={setProgress}
                onHit={handleHit}
                onRangesUpdated={handleRangesUpdated}
              />
            </div>
          </div>

          {/* Content - Right Columns */}
          <div className="lg:col-span-2 space-y-6">
            {/* Range Manager */}
            <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-6">
              <RangeManager
                ranges={ranges}
                onRangesChange={setRanges}
                isScanning={isScanning}
              />
            </div>

            {/* Hits Viewer */}
            <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-6">
              <HitsViewer
                hits={hits}
                onHitsChange={setHits}
              />
            </div>

            {/* Job History */}
            <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-6">
              <JobHistory jobs={jobs} onJobsChange={setJobs} />
            </div>

            {/* API Settings */}
            <div className="bg-card/50 backdrop-blur border border-border rounded-lg p-6">
              <ApiSettings />
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border/50 py-6 mt-12">
        <div className="container mx-auto px-6 text-center">
          <p className="text-xs text-muted-foreground uppercase tracking-widest">
            BTC Scanner • All data stored locally • Use responsibly
          </p>
        </div>
      </footer>
    </div>
  );
}
