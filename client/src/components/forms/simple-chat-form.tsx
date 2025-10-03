import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { SiWhatsapp, SiGooglemeet } from "react-icons/si";
import { MessageSquare } from "lucide-react";

interface SimpleChatFormProps {
  onSuccess?: () => void;
  defaultType?: "chat" | "sms" | "other";
}

type ChatPlatform = "teams" | "whatsapp" | "googlemeet";

const platformIcons = {
  teams: MessageSquare,
  whatsapp: SiWhatsapp,
  googlemeet: SiGooglemeet,
};

const platformLabels = {
  teams: "Teams",
  whatsapp: "WhatsApp",
  googlemeet: "Google Meet",
};

const platformColors = {
  teams: "text-[#505AC9] hover:bg-[#505AC9]/10",
  whatsapp: "text-[#25D366] hover:bg-[#25D366]/10",
  googlemeet: "text-[#00897B] hover:bg-[#00897B]/10",
};

export default function SimpleChatForm({ onSuccess, defaultType = "chat" }: SimpleChatFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [platform, setPlatform] = useState<ChatPlatform>("teams");
  const [pastedImages, setPastedImages] = useState<Array<{ file: File; url: string }>>([]);

  const createMutation = useMutation({
    mutationFn: (data: { content: string; platform: ChatPlatform; type: string }) => 
      apiRequest("POST", "/api/messages/chat", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
      toast({
        title: "Messaggio aggiunto",
        description: "Il messaggio è stato normalizzato e salvato con successo.",
      });
      setContent("");
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast({
        title: "Errore",
        description: error.message || "Errore durante l'aggiunta del messaggio.",
        variant: "destructive",
      });
    },
  });

  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    console.log("🎨 [PASTE] Event triggered!");
    
    const items = e.clipboardData?.items;
    console.log("🎨 [PASTE] ClipboardData items:", items ? items.length : 'none');
    
    if (!items) {
      console.log("🎨 [PASTE] No clipboard items found");
      return;
    }

    const imageFiles: Array<{ file: File; url: string }> = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`🎨 [PASTE] Item ${i}: type="${item.type}", kind="${item.kind}"`);
      
      // Check if item is an image
      if (item.type.indexOf('image') !== -1) {
        console.log(`🎨 [PASTE] Found image! Type: ${item.type}`);
        const file = item.getAsFile();
        if (file) {
          const url = URL.createObjectURL(file);
          imageFiles.push({ file, url });
          console.log(`🎨 [PASTE] Image added: ${file.name}, size: ${file.size} bytes`);
        } else {
          console.log("🎨 [PASTE] getAsFile() returned null");
        }
      }
    }

    console.log(`🎨 [PASTE] Total images captured: ${imageFiles.length}`);

    if (imageFiles.length > 0) {
      setPastedImages(prev => [...prev, ...imageFiles]);
      toast({
        title: `${imageFiles.length} immagini catturate`,
        description: "Le immagini saranno incluse nel messaggio.",
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!content.trim()) {
      toast({
        title: "Contenuto mancante",
        description: "Incolla il contenuto della chat prima di continuare.",
        variant: "destructive",
      });
      return;
    }

    // TODO: Upload images and include them in the message
    createMutation.mutate({ 
      content: content.trim(), 
      platform,
      type: defaultType 
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6" data-testid="form-simple-chat">
      {/* Platform Selection */}
      <div className="space-y-3">
        <Label>Piattaforma</Label>
        <div className="flex gap-2">
          {(Object.keys(platformIcons) as ChatPlatform[]).map((p) => {
            const Icon = platformIcons[p];
            const isSelected = platform === p;
            
            return (
              <button
                key={p}
                type="button"
                onClick={() => setPlatform(p)}
                className={`
                  flex items-center gap-2 px-4 py-3 rounded-lg border-2 transition-all
                  ${isSelected 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-primary/50'
                  }
                  ${platformColors[p]}
                `}
                data-testid={`button-platform-${p}`}
              >
                <Icon className="h-5 w-5" />
                <span className="font-medium text-sm">{platformLabels[p]}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Content Textarea */}
      <div className="space-y-3">
        <Label htmlFor="chat-content">Contenuto Chat</Label>
        <Textarea
          id="chat-content"
          placeholder="Incolla qui il contenuto della chat... Il sistema lo normalizzerà automaticamente."
          className="min-h-[300px] font-mono text-sm"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          onPaste={handlePaste}
          data-testid="textarea-chat-content"
        />
        <p className="text-xs text-muted-foreground">
          Incolla il contenuto copiato dalla chat. Il sistema estrarrà automaticamente mittente, destinatario e messaggio.
        </p>
        
        {/* Pasted Images Preview */}
        {pastedImages.length > 0 && (
          <div className="space-y-2">
            <Label className="text-green-600 dark:text-green-400">
              ✓ {pastedImages.length} immagine{pastedImages.length > 1 ? 'i' : ''} catturata{pastedImages.length > 1 ? 'e' : ''} dalla clipboard
            </Label>
            <div className="grid grid-cols-4 gap-2">
              {pastedImages.map((img, idx) => (
                <div key={idx} className="relative group">
                  <img 
                    src={img.url} 
                    alt={`Pasted ${idx + 1}`} 
                    className="w-full h-24 object-cover rounded border border-green-500"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      URL.revokeObjectURL(img.url);
                      setPastedImages(prev => prev.filter((_, i) => i !== idx));
                    }}
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex items-center justify-end">
        <Button
          type="submit"
          disabled={createMutation.isPending || !content.trim()}
          data-testid="button-add-chat"
        >
          {createMutation.isPending ? "Normalizzazione..." : "Aggiungi Chat"}
        </Button>
      </div>
    </form>
  );
}
