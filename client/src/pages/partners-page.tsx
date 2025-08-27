import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Sidebar from "@/components/layout/sidebar";
import Header from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building, Mail, Phone, MapPin, MoreHorizontal } from "lucide-react";
import { Partner } from "@shared/schema";
import PartnerForm from "@/components/forms/partner-form";

const typeColors = {
  client: "bg-blue-100 text-blue-800",
  vendor: "bg-green-100 text-green-800",
  consultant: "bg-purple-100 text-purple-800",
  other: "bg-gray-100 text-gray-800",
};

const typeLabels = {
  client: "Client",
  vendor: "Vendor", 
  consultant: "Consultant",
  other: "Other",
};

export default function PartnersPage() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const { data: partners, isLoading } = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
  });

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto">
        <Header 
          title="Partners" 
          subtitle="Manage your clients, vendors and business contacts"
          onNewClick={() => setShowCreateDialog(true)}
        />
        
        <div className="p-6">
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(6)].map((_, i) => (
                <Card key={i}>
                  <CardHeader>
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/2" />
                  </CardHeader>
                  <CardContent>
                    <Skeleton className="h-16 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : partners?.length === 0 ? (
            <div className="text-center py-12">
              <Building className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No partners yet</h3>
              <p className="text-muted-foreground mb-4">Add your first client or business contact to get started</p>
              <Button onClick={() => setShowCreateDialog(true)} data-testid="button-create-first-partner">
                Add Partner
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {partners?.map((partner) => (
                <Card key={partner.id} className="hover:shadow-lg transition-shadow" data-testid={`card-partner-${partner.id}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                          <Building className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg" data-testid={`text-partner-name-${partner.id}`}>
                            {partner.name}
                          </CardTitle>
                          <Badge 
                            className={typeColors[partner.type]}
                            data-testid={`badge-partner-type-${partner.id}`}
                          >
                            {typeLabels[partner.type]}
                          </Badge>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon">
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardHeader>
                  
                  <CardContent className="space-y-3">
                    {partner.company && (
                      <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                        <Building className="h-4 w-4" />
                        <span data-testid={`text-partner-company-${partner.id}`}>{partner.company}</span>
                      </div>
                    )}
                    
                    {partner.position && (
                      <p className="text-sm text-muted-foreground" data-testid={`text-partner-position-${partner.id}`}>
                        {partner.position}
                      </p>
                    )}
                    
                    <div className="space-y-2">
                      {partner.email && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`mailto:${partner.email}`}
                            className="text-primary hover:underline"
                            data-testid={`link-partner-email-${partner.id}`}
                          >
                            {partner.email}
                          </a>
                        </div>
                      )}
                      
                      {partner.phone && (
                        <div className="flex items-center space-x-2 text-sm">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <a 
                            href={`tel:${partner.phone}`}
                            className="text-primary hover:underline"
                            data-testid={`link-partner-phone-${partner.id}`}
                          >
                            {partner.phone}
                          </a>
                        </div>
                      )}
                      
                      {partner.address && (
                        <div className="flex items-start space-x-2 text-sm text-muted-foreground">
                          <MapPin className="h-4 w-4 mt-0.5" />
                          <span data-testid={`text-partner-address-${partner.id}`}>{partner.address}</span>
                        </div>
                      )}
                    </div>
                    
                    {partner.notes && (
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-partner-notes-${partner.id}`}>
                          {partner.notes}
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add New Partner</DialogTitle>
          </DialogHeader>
          <PartnerForm onSuccess={() => setShowCreateDialog(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
