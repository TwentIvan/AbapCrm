import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { User } from "@shared/schema";

interface AccountFormProps {
  user?: User | null;
  onSuccess?: () => void;
}

export default function AccountForm({ user, onSuccess }: AccountFormProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [formData, setFormData] = useState({
    firstName: user?.firstName || "",
    lastName: user?.lastName || "",
    email: user?.email || "",
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("PUT", `/api/users/${user?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/user"] });
      toast({
        title: "Successo",
        description: "Impostazioni account aggiornate",
      });
      onSuccess?.();
    },
    onError: () => {
      toast({
        title: "Errore",
        description: "Impossibile aggiornare le impostazioni",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserMutation.mutate(formData);
  };

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="firstName">Nome</Label>
        <Input
          id="firstName"
          value={formData.firstName}
          onChange={(e) => handleChange("firstName", e.target.value)}
          data-testid="input-first-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="lastName">Cognome</Label>
        <Input
          id="lastName"
          value={formData.lastName}
          onChange={(e) => handleChange("lastName", e.target.value)}
          data-testid="input-last-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          value={formData.email}
          onChange={(e) => handleChange("email", e.target.value)}
          data-testid="input-email"
        />
      </div>

      <div className="flex justify-end space-x-2 pt-4">
        <Button
          type="submit"
          data-testid="button-save"
          disabled={updateUserMutation.isPending}
        >
          {updateUserMutation.isPending ? "Salvataggio..." : "Salva"}
        </Button>
      </div>
    </form>
  );
}