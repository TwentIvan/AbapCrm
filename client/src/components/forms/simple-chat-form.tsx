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
          data-testid="textarea-chat-content"
        />
        <p className="text-xs text-muted-foreground">
          Incolla il contenuto copiato dalla chat. Il sistema estrarrà automaticamente mittente, destinatario e messaggio.
        </p>
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
