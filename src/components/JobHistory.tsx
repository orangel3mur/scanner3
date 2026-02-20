import { useState } from 'react';
import { History, CheckCircle, XCircle, Clock, Shuffle, ArrowRight, ArrowLeft, Trash2 } from 'lucide-react';
import { ScanJob } from '@/lib/types';
import { saveJobs } from '@/lib/storage';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';

interface JobHistoryProps {
  jobs: ScanJob[];
  onJobsChange?: (jobs: ScanJob[]) => void;
}

export default function JobHistory({ jobs, onJobsChange }: JobHistoryProps) {
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());

  const handleSelectAll = () => {
    if (selectedJobs.size === jobs.length) {
      setSelectedJobs(new Set());
    } else {
      setSelectedJobs(new Set(jobs.map(j => j.id)));
    }
  };

  const handleSelectJob = (id: string) => {
    const newSelected = new Set(selectedJobs);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedJobs(newSelected);
  };

  const handleDeleteSelected = () => {
    if (selectedJobs.size === 0) return;
    
    const updatedJobs = jobs.filter(j => !selectedJobs.has(j.id));
    saveJobs(updatedJobs);
    onJobsChange?.(updatedJobs);
    setSelectedJobs(new Set());
    
    toast({
      title: "Jobs Deleted",
      description: `Removed ${selectedJobs.size} job(s) from history.`,
    });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatDuration = (start: number, end: number | null) => {
    const ms = (end || Date.now()) - start;
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const getTypeIcon = (type: ScanJob['type']) => {
    switch (type) {
      case 'random':
        return <Shuffle className="w-4 h-4" />;
      case 'sequential-forward':
        return <ArrowRight className="w-4 h-4" />;
      case 'sequential-backward':
        return <ArrowLeft className="w-4 h-4" />;
    }
  };

  const getStatusIcon = (status: ScanJob['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-primary" />;
      case 'stopped':
        return <XCircle className="w-4 h-4 text-destructive" />;
      case 'running':
        return <Clock className="w-4 h-4 text-accent animate-pulse" />;
    }
  };

  const sortedJobs = [...jobs].sort((a, b) => b.startTime - a.startTime);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 text-primary" />
          <h2 className="text-xl font-display font-bold tracking-wider uppercase">Job History</h2>
          <span className="text-muted-foreground text-sm">({jobs.length} jobs)</span>
        </div>
        {selectedJobs.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete ({selectedJobs.size})
          </Button>
        )}
      </div>

      <div className="bg-card/30 border border-border rounded-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto scrollbar-terminal">
          {sortedJobs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Clock className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No scan jobs completed yet. Start a scan to see history.</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/50 sticky top-0">
                <tr>
                  <th className="p-3 w-10">
                    <Checkbox
                      checked={jobs.length > 0 && selectedJobs.size === jobs.length}
                      onCheckedChange={handleSelectAll}
                    />
                  </th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">Type</th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">Started</th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">Duration</th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">Keys</th>
                  <th className="text-left p-3 text-muted-foreground font-normal uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {sortedJobs.map((job) => (
                  <tr key={job.id} className={`border-t border-border/50 hover:bg-primary/5 transition-colors ${selectedJobs.has(job.id) ? 'bg-primary/10' : ''}`}>
                    <td className="p-3">
                      <Checkbox
                        checked={selectedJobs.has(job.id)}
                        onCheckedChange={() => handleSelectJob(job.id)}
                      />
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2 text-foreground">
                        {getTypeIcon(job.type)}
                        <span className="capitalize">{job.type.replace('-', ' ')}</span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {formatDate(job.startTime)}
                    </td>
                    <td className="p-3 text-foreground font-mono">
                      {formatDuration(job.startTime, job.endTime)}
                    </td>
                    <td className="p-3 text-foreground font-mono">
                      {job.keysScanned.toLocaleString()}
                    </td>
                    <td className="p-3">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(job.status)}
                        <span className={
                          job.status === 'completed' ? 'text-primary' :
                          job.status === 'stopped' ? 'text-destructive' :
                          'text-accent'
                        }>
                          {job.status}
                        </span>
                      </div>
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
