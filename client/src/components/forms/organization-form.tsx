import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { Building } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useOrganization } from "@/contexts/organization-context";
import { useStandardCrud } from "@/lib/cache-manager";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface OrganizationFormProps {
  organization?: {
    id: string;
    name: string;
    isActive: boolean;
    theme: string;
    partnerId?: string | null;
  } | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function OrganizationForm({ organization, onSuccess, onCancel }: OrganizationFormProps) {
  const [formData, setFormData] = useState({
    name: organization?.name || "",
    isActive: organization?.isActive ?? true,
    theme: organization?.theme || "blue",
    partnerId: organization?.partnerId || null,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();
  const { currentOrganizationId } = useOrganization();
  const { onCreateSuccess, onUpdateSuccess } = useStandardCrud("organizations");

  // Load available partners for selection
  const { data: partners = [] } = useQuery<any[]>({
    queryKey: ["/api/partners"],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!currentOrganizationId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  const getThemeColor = (theme: string) => {
    const themeColors: { [key: string]: string } = {
      blue: "hsl(221.2, 83.2%, 53.3%)",
      green: "hsl(142.1, 76.2%, 36.3%)",
      purple: "hsl(262.1, 83.3%, 57.8%)",
      orange: "hsl(24.6, 95%, 53.1%)",
      red: "hsl(0, 72.2%, 50.6%)",
      pink: "hsl(330, 81%, 60%)",
      yellow: "hsl(45, 93%, 55%)",
      teal: "hsl(178, 68%, 42%)",
      indigo: "hsl(239, 84%, 67%)",
      gray: "hsl(220, 13%, 46%)",
    };
    return themeColors[theme] || themeColors.blue;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      if (organization) {
        // Update existing organization
        await apiRequest("PUT", `/api/organizations/${organization.id}`, formData);
        await onUpdateSuccess();
        toast({
          title: "Successo",
          description: "Organizzazione aggiornata con successo",
        });
      } else {
        // Create new organization
        await apiRequest("POST", "/api/organizations", formData);
        await onCreateSuccess();
        toast({
          title: "Successo",
          description: "Organizzazione creata con successo",
        });
      }

      onSuccess();
    } catch (error) {
      toast({
        title: "Errore",
        description: "Si è verificato un errore durante il salvataggio",
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleChange = (field: string, value: string | boolean | null) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const isPersonalOrg = organization?.name === "Personal";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-1 gap-4">
        {/* Nome */}
        <div>
          <Label htmlFor="name">Nome Organizzazione *</Label>
          <div className="relative">
            <Building className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleChange("name", e.target.value)}
              placeholder="Nome dell'organizzazione"
              className="pl-10"
              required
              disabled={isPersonalOrg}
              data-testid="input-organization-name"
            />
          </div>
          {isPersonalOrg && (
            <p className="text-sm text-muted-foreground mt-1">
              Il nome dell'organizzazione Personal non può essere modificato
            </p>
          )}
        </div>

        {/* Tema */}
        <div>
          <Label htmlFor="theme">Tema Colore</Label>
          <Select value={formData.theme} onValueChange={(value) => handleChange("theme", value)}>
            <SelectTrigger data-testid="select-organization-theme">
              <div className="flex items-center">
                <div 
                  className="w-4 h-4 rounded-full mr-2 border border-gray-300"
                  style={{ backgroundColor: getThemeColor(formData.theme) }}
                />
                <SelectValue placeholder="Seleziona tema" />
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="blue">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("blue") }} />
                  Blu
                </div>
              </SelectItem>
              <SelectItem value="green">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("green") }} />
                  Verde
                </div>
              </SelectItem>
              <SelectItem value="purple">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("purple") }} />
                  Viola
                </div>
              </SelectItem>
              <SelectItem value="orange">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("orange") }} />
                  Arancione
                </div>
              </SelectItem>
              <SelectItem value="red">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("red") }} />
                  Rosso
                </div>
              </SelectItem>
              <SelectItem value="pink">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("pink") }} />
                  Rosa
                </div>
              </SelectItem>
              <SelectItem value="yellow">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("yellow") }} />
                  Giallo
                </div>
              </SelectItem>
              <SelectItem value="teal">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("teal") }} />
                  Teal
                </div>
              </SelectItem>
              <SelectItem value="indigo">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("indigo") }} />
                  Indaco
                </div>
              </SelectItem>
              <SelectItem value="gray">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300" style={{ backgroundColor: getThemeColor("gray") }} />
                  Grigio
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Partner - Se non è Personal può avere partner associato */}
        <div>
          <Label htmlFor="partnerId">Partner Associato</Label>
          <Select value={formData.partnerId || "none"} onValueChange={(value) => handleChange("partnerId", value === "none" ? null : value)}>
            <SelectTrigger data-testid="select-organization-partner">
              <SelectValue placeholder="Seleziona partner (opzionale)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                <span className="text-muted-foreground">Nessun partner</span>
              </SelectItem>
              {partners.map((partner: any) => (
                <SelectItem key={partner.id} value={partner.id}>
                  <div className="flex items-center">
                    <div className="w-4 h-4 rounded-full mr-2 bg-blue-500 flex items-center justify-center text-white text-xs">
                      {partner.name?.charAt(0)?.toUpperCase() || "P"}
                    </div>
                    <span>{partner.name} {partner.surname ? `${partner.surname}` : ""}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-sm text-muted-foreground mt-1">
            Partner associato a questa organizzazione (anagrafica contatto)
          </p>
        </div>

        {/* Stato Attivo - Solo se non è Personal */}
        {!isPersonalOrg && (
          <div className="flex items-center justify-between">
            <Label htmlFor="isActive">Organizzazione Attiva</Label>
            <Switch
              id="isActive"
              checked={formData.isActive}
              onCheckedChange={(checked) => handleChange("isActive", checked)}
              data-testid="switch-organization-active"
            />
          </div>
        )}
      </div>

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel">
          Annulla
        </Button>
        <Button type="submit" disabled={isSubmitting} data-testid="button-save">
          {isSubmitting ? "Salvataggio..." : organization ? "Aggiorna" : "Crea"}
        </Button>
      </div>
    </form>
  );
}