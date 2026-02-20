import { useEffect, useState } from 'react';
import { Activity, Zap, Target, Clock, TrendingUp, Database } from 'lucide-react';
import { loadJobs, loadHits } from '@/lib/storage';
import { loadRangesAsync } from '@/lib/rangeDb';
import { ScanJob, PositiveHit, BitcoinRange } from '@/lib/types';

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subtext?: string;
  variant?: 'default' | 'accent' | 'success';
}

function StatCard({ icon, label, value, subtext, variant = 'default' }: StatCardProps) {
  const variantStyles = {
    default: 'border-primary/30',
    accent: 'border-accent/50',
    success: 'border-primary',
  };

  return (
    <div className={`bg-card/50 backdrop-blur border ${variantStyles[variant]} rounded-lg p-4 glow-border`}>
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded ${variant === 'accent' ? 'bg-accent/20 text-accent' : 'bg-primary/20 text-primary'}`}>
          {icon}
        </div>
        <span className="text-muted-foreground text-sm uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-display font-bold ${variant === 'accent' ? 'text-accent' : 'text-foreground'} glow-text`}>
        {value}
      </p>
      {subtext && <p className="text-xs text-muted-foreground mt-1">{subtext}</p>}
    </div>
  );
}

export default function Dashboard() {
  const [jobs, setJobs] = useState<ScanJob[]>([]);
  const [hits, setHits] = useState<PositiveHit[]>([]);
  const [ranges, setRanges] = useState<BitcoinRange[]>([]);

  useEffect(() => {
    const loadData = () => {
      setJobs(loadJobs());
      setHits(loadHits());
      loadRangesAsync().then(setRanges);
    };
    
    loadData();
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, []);

  const totalKeysScanned = jobs.reduce((sum, job) => sum + job.keysScanned, 0);
  const totalHits = hits.length;
  const totalBalance = hits.reduce((sum, hit) => sum + hit.balance, 0);
  const completedJobs = jobs.filter(j => j.status === 'completed').length;
  const randomJobs = jobs.filter(j => j.type === 'random').length;
  const sequentialJobs = jobs.filter(j => j.type.startsWith('sequential')).length;
  const totalScanTime = jobs.reduce((sum, job) => {
    const end = job.endTime || Date.now();
    return sum + (end - job.startTime);
  }, 0);

  const formatTime = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <Activity className="w-6 h-6 text-primary animate-pulse" />
        <h2 className="text-xl font-display font-bold tracking-wider uppercase">System Overview</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard
          icon={<Zap className="w-5 h-5" />}
          label="Keys Scanned"
          value={totalKeysScanned.toLocaleString()}
        />
        <StatCard
          icon={<Target className="w-5 h-5" />}
          label="Positive Hits"
          value={totalHits}
          variant={totalHits > 0 ? 'accent' : 'default'}
        />
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Total Balance"
          value={`${totalBalance.toLocaleString()} sats`}
          variant="accent"
        />
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Scan Time"
          value={formatTime(totalScanTime)}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="Jobs Done"
          value={completedJobs}
          subtext={`${randomJobs} random / ${sequentialJobs} seq`}
        />
        <StatCard
          icon={<Database className="w-5 h-5" />}
          label="Ranges"
          value={ranges.length}
        />
      </div>

      {/* Recent Hits */}
      {hits.length > 0 && (
        <div className="bg-card/50 backdrop-blur border border-accent/50 rounded-lg p-4 glow-border">
          <h3 className="text-accent font-display font-bold mb-4 flex items-center gap-2">
            <Target className="w-5 h-5" />
            RECENT HITS
          </h3>
          <div className="space-y-2 max-h-40 overflow-y-auto scrollbar-terminal">
            {hits.slice(-5).reverse().map(hit => (
              <div key={hit.id} className="flex justify-between items-center text-sm bg-accent/10 rounded p-2">
                <span className="hex-display text-accent">{hit.address.slice(0, 16)}...</span>
                <span className="text-accent font-bold">{hit.balance.toLocaleString()} sats</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
