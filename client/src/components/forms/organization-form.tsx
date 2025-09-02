import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Building, Globe, MapPin, Hash, CreditCard } from "lucide-react";

interface OrganizationFormProps {
  organization?: {
    id: string;
    name: string;
    description?: string;
    logoUrl?: string;
    website?: string;
    fiscalCode?: string;
    vatNumber?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    country?: string;
    isActive: boolean;
  } | null;
  onSuccess: () => void;
  onCancel: () => void;
}

export default function OrganizationForm({ organization, onSuccess, onCancel }: OrganizationFormProps) {
  const [formData, setFormData] = useState({
    name: organization?.name || "",
    description: organization?.description || "",
    logoUrl: organization?.logoUrl || "",
    website: organization?.website || "",
    fiscalCode: organization?.fiscalCode || "",
    vatNumber: organization?.vatNumber || "",
    address: organization?.address || "",
    city: organization?.city || "",
    postalCode: organization?.postalCode || "",
    country: organization?.country || "IT",
    isActive: organization?.isActive ?? true,
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const { toast } = useToast();

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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {/* Nome */}
        <div className="col-span-2">
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
              data-testid="input-organization-name"
            />
          </div>
        </div>

        {/* Descrizione */}
        <div className="col-span-2">
          <Label htmlFor="description">Descrizione</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => handleChange("description", e.target.value)}
            placeholder="Descrizione dell'organizzazione"
            rows={3}
            data-testid="input-organization-description"
          />
        </div>

        {/* Logo URL */}
        <div className="col-span-2">
          <Label htmlFor="logoUrl">URL Logo</Label>
          <Input
            id="logoUrl"
            type="url"
            value={formData.logoUrl}
            onChange={(e) => handleChange("logoUrl", e.target.value)}
            placeholder="https://esempio.com/logo.png"
            data-testid="input-organization-logo"
          />
        </div>

        {/* Website */}
        <div className="col-span-2">
          <Label htmlFor="website">Sito Web</Label>
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="website"
              type="url"
              value={formData.website}
              onChange={(e) => handleChange("website", e.target.value)}
              placeholder="https://www.esempio.com"
              className="pl-10"
              data-testid="input-organization-website"
            />
          </div>
        </div>

        {/* Codice Fiscale */}
        <div>
          <Label htmlFor="fiscalCode">Codice Fiscale</Label>
          <div className="relative">
            <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="fiscalCode"
              value={formData.fiscalCode}
              onChange={(e) => handleChange("fiscalCode", e.target.value)}
              placeholder="ABCDEF12G34H567I"
              className="pl-10"
              data-testid="input-organization-fiscal-code"
            />
          </div>
        </div>

        {/* Partita IVA */}
        <div>
          <Label htmlFor="vatNumber">Partita IVA</Label>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="vatNumber"
              value={formData.vatNumber}
              onChange={(e) => handleChange("vatNumber", e.target.value)}
              placeholder="12345678901"
              className="pl-10"
              data-testid="input-organization-vat-number"
            />
          </div>
        </div>

        {/* Indirizzo */}
        <div className="col-span-2">
          <Label htmlFor="address">Indirizzo</Label>
          <div className="relative">
            <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="address"
              value={formData.address}
              onChange={(e) => handleChange("address", e.target.value)}
              placeholder="Via Roma 123"
              className="pl-10"
              data-testid="input-organization-address"
            />
          </div>
        </div>

        {/* Città */}
        <div>
          <Label htmlFor="city">Città</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => handleChange("city", e.target.value)}
            placeholder="Milano"
            data-testid="input-organization-city"
          />
        </div>

        {/* CAP */}
        <div>
          <Label htmlFor="postalCode">CAP</Label>
          <Input
            id="postalCode"
            value={formData.postalCode}
            onChange={(e) => handleChange("postalCode", e.target.value)}
            placeholder="20121"
            data-testid="input-organization-postal-code"
          />
        </div>

        {/* Paese */}
        <div>
          <Label htmlFor="country">Paese</Label>
          <Input
            id="country"
            value={formData.country}
            onChange={(e) => handleChange("country", e.target.value)}
            placeholder="IT"
            data-testid="input-organization-country"
          />
        </div>

        {/* Stato Attivo */}
        <div className="col-span-2 flex items-center space-x-2">
          <Switch
            id="isActive"
            checked={formData.isActive}
            onCheckedChange={(checked) => handleChange("isActive", checked)}
            data-testid="switch-organization-active"
          />
          <Label htmlFor="isActive">Organizzazione attiva</Label>
        </div>
      </div>

      <div className="flex justify-end space-x-3">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          data-testid="button-cancel"
        >
          Annulla
        </Button>
        <Button
          type="submit"
          disabled={isSubmitting || !formData.name}
          data-testid="button-save"
        >
          {isSubmitting ? "Salvando..." : (organization ? "Aggiorna" : "Crea")}
        </Button>
      </div>
    </form>
  );
}