import { Bitcoin, Shield, Terminal } from 'lucide-react';

interface HeaderProps {
  isScanning: boolean;
}

export default function Header({ isScanning }: HeaderProps) {
  return (
    <header className="border-b border-border/50 bg-card/30 backdrop-blur-sm sticky top-0 z-50">
      <div className="container mx-auto px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="relative">
              <Bitcoin className={`w-10 h-10 text-accent ${isScanning ? 'animate-pulse' : ''}`} />
              <div className={`absolute -top-1 -right-1 w-3 h-3 rounded-full ${
                isScanning ? 'bg-primary animate-pulse-glow' : 'bg-muted'
              }`} />
            </div>
            <div>
              <h1 className="font-display text-2xl font-bold tracking-wider text-foreground glow-text">
                BTC SCANNER
              </h1>
              <p className="text-xs text-muted-foreground uppercase tracking-widest">
                Private Key Range Scanner v1.0
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Terminal className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Terminal Mode</span>
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <Shield className="w-4 h-4" />
              <span className="text-xs uppercase tracking-wider">Local Only</span>
            </div>
            <div className={`flex items-center gap-2 ${isScanning ? 'text-primary' : 'text-muted-foreground'}`}>
              <div className={`w-2 h-2 rounded-full ${isScanning ? 'bg-primary animate-pulse' : 'bg-muted'}`} />
              <span className="text-xs uppercase tracking-wider">
                {isScanning ? 'SCANNING' : 'IDLE'}
              </span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Scan line animation */}
      {isScanning && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div className="scan-line absolute inset-0" />
        </div>
      )}
    </header>
  );
}
