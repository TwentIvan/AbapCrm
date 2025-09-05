import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building } from "lucide-react";
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

  const getThemeColor = (theme: string) => {
    const themeColors: { [key: string]: string } = {
      blue: "hsl(221.2, 83.2%, 53.3%)",
      green: "hsl(142.1, 76.2%, 36.3%)",
      purple: "hsl(262.1, 83.3%, 57.8%)",
      orange: "hsl(24.6, 95%, 53.1%)",
      red: "hsl(0, 72.2%, 50.6%)",
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
        toast({
          title: "Successo",
          description: "Organizzazione aggiornata con successo",
        });
      } else {
        // Create new organization
        await apiRequest("POST", "/api/organizations", formData);
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

  const handleChange = (field: string, value: string | boolean) => {
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
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300 bg-blue-500" />
                  Blu
                </div>
              </SelectItem>
              <SelectItem value="green">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300 bg-green-500" />
                  Verde
                </div>
              </SelectItem>
              <SelectItem value="purple">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300 bg-purple-500" />
                  Viola
                </div>
              </SelectItem>
              <SelectItem value="orange">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300 bg-orange-500" />
                  Arancione
                </div>
              </SelectItem>
              <SelectItem value="red">
                <div className="flex items-center">
                  <div className="w-4 h-4 rounded-full mr-2 border border-gray-300 bg-red-500" />
                  Rosso
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Partner - Se non è Personal può avere partner associato */}
        <div>
          <Label htmlFor="partnerId">Partner Associato</Label>
          <Input
            id="partnerId"
            value={formData.partnerId || ""}
            onChange={(e) => handleChange("partnerId", e.target.value || null)}
            placeholder="ID del partner (opzionale)"
            data-testid="input-organization-partner"
          />
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