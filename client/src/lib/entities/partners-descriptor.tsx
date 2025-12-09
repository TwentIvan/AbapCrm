import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { registerEntity, EntityListDescriptor } from "../entity-registry";
import { partnerTypeLabels, partnerTypeColors } from "../entity-constants";

function PartnerLogo({ logoUrl, name }: { logoUrl?: string; name: string }) {
  const [hasError, setHasError] = useState(false);
  
  if (!logoUrl || hasError) {
    return (
      <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-medium">
          {name?.charAt(0)?.toUpperCase() || "?"}
        </span>
      </div>
    );
  }
  
  return (
    <img
      src={logoUrl}
      alt=""
      className="w-8 h-8 rounded-full object-cover flex-shrink-0"
      onError={() => setHasError(true)}
    />
  );
}

const partnersDescriptor: EntityListDescriptor = {
  entityKey: "partners",
  title: "Partner",
  titlePlural: "Partner",
  apiBase: "/api/partners",
  icon: Users,

  supportsAI: false,
  supportsTimeTracking: false,
  supportsMessages: true,
  supportsAudit: true,
  supportsBulkEdit: true,
  supportsBulkCopy: true,
  supportsBulkDelete: true,

  getColumns: () => [
    {
      key: "name",
      label: "Nome",
      sortable: true,
      searchable: true,
      render: (partner: any) => (
        <div className="flex items-center gap-2">
          <PartnerLogo logoUrl={partner.logoUrl} name={partner.name} />
          <span className="font-medium" data-testid={`text-partner-name-${partner.id}`}>{partner.name}</span>
        </div>
      ),
    },
    {
      key: "type",
      label: "Tipo",
      sortable: true,
      render: (partner: any) => (
        <Badge className={partnerTypeColors[partner.type] || ""} data-testid={`badge-partner-type-${partner.id}`}>
          {partnerTypeLabels[partner.type] || partner.type}
        </Badge>
      ),
    },
    {
      key: "company",
      label: "Azienda",
      sortable: true,
      searchable: true,
      render: (partner: any) => partner.company || "-",
    },
    {
      key: "email",
      label: "Email",
      searchable: true,
      render: (partner: any) =>
        partner.email ? (
          <a href={`mailto:${partner.email}`} className="text-primary hover:underline">
            {partner.email}
          </a>
        ) : (
          "-"
        ),
    },
    {
      key: "phone",
      label: "Telefono",
      render: (partner: any) =>
        partner.phone ? (
          <a href={`tel:${partner.phone}`} className="text-primary hover:underline">
            {partner.phone}
          </a>
        ) : (
          "-"
        ),
    },
    {
      key: "city",
      label: "Città",
      sortable: true,
      render: (partner: any) => partner.city || "-",
    },
  ],

  getFilterColumns: () => [
    {
      id: "type",
      label: "Tipo",
      type: "select",
      options: [
        { value: "client", label: "Cliente" },
        { value: "supplier", label: "Fornitore" },
        { value: "partner", label: "Partner" },
        { value: "employee", label: "Dipendente" },
        { value: "candidate", label: "Candidato" },
        { value: "other", label: "Altro" },
      ],
    },
    {
      id: "city",
      label: "Città",
      type: "text",
    },
  ],

  getBulkEditFields: () => [
    {
      key: "type",
      label: "Tipo",
      type: "select",
      options: [
        { value: "client", label: "Cliente" },
        { value: "supplier", label: "Fornitore" },
        { value: "partner", label: "Partner" },
        { value: "employee", label: "Dipendente" },
        { value: "candidate", label: "Candidato" },
        { value: "other", label: "Altro" },
      ],
    },
    { key: "city", label: "Città", type: "text" },
    { key: "country", label: "Paese", type: "text" },
  ],
};

registerEntity(partnersDescriptor);
