 import { useState } from 'react';
 import { Settings, Check, RotateCcw } from 'lucide-react';
 import { Button } from '@/components/ui/button';
 import { loadApiUrl, saveApiUrl } from '@/lib/storage';
 import { toast } from '@/hooks/use-toast';
 
 const DEFAULT_API_URL = 'https://api.haskoin.com/btc/address';
 
 export default function ApiSettings() {
   const [apiUrl, setApiUrl] = useState(loadApiUrl());
   const [isEditing, setIsEditing] = useState(false);
 
   const handleSave = () => {
     if (!apiUrl.trim()) {
       toast({
         title: "Invalid URL",
         description: "API URL cannot be empty.",
         variant: "destructive",
       });
       return;
     }
 
     saveApiUrl(apiUrl.trim());
     setIsEditing(false);
     toast({
       title: "API Updated",
       description: "Balance API endpoint has been updated.",
     });
   };
 
   const handleReset = () => {
     setApiUrl(DEFAULT_API_URL);
     saveApiUrl(DEFAULT_API_URL);
     setIsEditing(false);
     toast({
       title: "API Reset",
       description: "Restored default API endpoint.",
     });
   };
 
   return (
     <div className="space-y-4">
       <div className="flex items-center gap-3">
         <Settings className="w-6 h-6 text-primary" />
         <h2 className="text-xl font-display font-bold tracking-wider uppercase">API Settings</h2>
       </div>
 
       <div className="bg-card/30 border border-border rounded-lg p-4 space-y-3">
         <div>
           <label className="block text-sm text-muted-foreground mb-2 uppercase tracking-wider">
             Balance API Endpoint
           </label>
           <p className="text-xs text-muted-foreground mb-2">
             The API should return JSON with a "confirmed" field for the balance.
             Format: <code className="text-primary">{'{url}'}/{'{address}'}/balance</code>
           </p>
           <div className="flex gap-2">
             <input
               type="text"
               value={apiUrl}
               onChange={(e) => {
                 setApiUrl(e.target.value);
                 setIsEditing(true);
               }}
               placeholder="https://api.example.com/btc/address"
               className="flex-1 bg-input border border-border rounded px-3 py-2 text-foreground font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary"
             />
             {isEditing && (
               <Button onClick={handleSave} size="icon" variant="default">
                 <Check className="w-4 h-4" />
               </Button>
             )}
             <Button onClick={handleReset} size="icon" variant="outline" title="Reset to default">
               <RotateCcw className="w-4 h-4" />
             </Button>
           </div>
         </div>
 
         <div className="text-xs text-muted-foreground bg-secondary/30 rounded p-3">
           <p className="font-semibold text-foreground mb-1">Supported API Formats:</p>
           <ul className="list-disc list-inside space-y-1">
             <li><strong>Haskoin:</strong> https://api.haskoin.com/btc/address</li>
             <li><strong>Blockchain.info:</strong> https://blockchain.info/rawaddr (different response format)</li>
             <li><strong>Custom:</strong> Any API returning <code className="text-primary">{`{ "confirmed": number }`}</code></li>
           </ul>
         </div>
       </div>
     </div>
   );
 }