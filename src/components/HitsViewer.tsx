import { Target, Copy, Download, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PositiveHit } from '@/lib/types';
import { exportToJson, saveHits } from '@/lib/storage';
import { toast } from '@/hooks/use-toast';

interface HitsViewerProps {
  hits: PositiveHit[];
  onHitsChange: (hits: PositiveHit[]) => void;
}

export default function HitsViewer({ hits, onHitsChange }: HitsViewerProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  const handleExport = () => {
    exportToJson(hits, 'positive_hits.json');
    toast({
      title: "Export Complete",
      description: "Hits exported to positive_hits.json",
    });
  };

  const handleDelete = (id: string) => {
    const updatedHits = hits.filter(h => h.id !== id);
    saveHits(updatedHits);
    onHitsChange(updatedHits);
    toast({
      title: "Hit Deleted",
      description: "Hit record has been removed.",
    });
  };

  const totalBalance = hits.reduce((sum, hit) => sum + hit.balance, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Target className="w-6 h-6 text-accent" />
          <h2 className="text-xl font-display font-bold tracking-wider uppercase text-accent">Positive Hits</h2>
          <span className="text-muted-foreground text-sm">({hits.length} found)</span>
        </div>
        <Button variant="accent" size="sm" onClick={handleExport} disabled={hits.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Export JSON
        </Button>
      </div>

      {hits.length > 0 && (
        <div className="bg-accent/10 border border-accent/30 rounded-lg p-4">
          <p className="text-accent text-lg font-display font-bold">
            Total Balance: {totalBalance.toLocaleString()} satoshis
          </p>
          <p className="text-muted-foreground text-sm">
            ≈ {(totalBalance / 100000000).toFixed(8)} BTC
          </p>
        </div>
      )}

      <div className="bg-card/30 border border-border rounded-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto scrollbar-terminal">
          {hits.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No positive hits found yet. Keep scanning!</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {hits.map((hit) => (
                <div key={hit.id} className="p-4 hover:bg-accent/5 transition-colors">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-accent font-display font-bold text-lg">
                        {hit.balance.toLocaleString()} sats
                      </span>
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded ${
                        hit.compressed ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                      }`}>
                        {hit.compressed ? 'COMPRESSED' : 'UNCOMPRESSED'}
                      </span>
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(hit.id)}
                        className="hover:bg-destructive/20 hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Private Key</p>
                      <div className="flex items-center gap-2">
                        <code className="hex-display text-foreground bg-secondary/50 px-2 py-1 rounded text-xs flex-1 break-all">
                          {hit.privateKey}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(hit.privateKey)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Address</p>
                      <div className="flex items-center gap-2">
                        <code className="hex-display text-primary bg-secondary/50 px-2 py-1 rounded text-xs flex-1 break-all">
                          {hit.address}
                        </code>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => copyToClipboard(hit.address)}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                    
                    <p className="text-xs text-muted-foreground">
                      Found: {formatDate(hit.foundAt)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
