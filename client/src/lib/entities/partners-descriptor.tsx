import { Badge } from "@/components/ui/badge";
import { Users } from "lucide-react";
import { registerEntity, EntityListDescriptor } from "../entity-registry";

const typeLabels: Record<string, string> = {
  client: "Cliente",
  supplier: "Fornitore",
  partner: "Partner",
  employee: "Dipendente",
  candidate: "Candidato",
  other: "Altro",
};

const typeColors: Record<string, string> = {
  client: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  supplier: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  partner: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  employee: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  candidate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

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
          {partner.logoUrl ? (
            <img
              src={partner.logoUrl}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center">
              <span className="text-xs font-medium">
                {partner.name?.charAt(0)?.toUpperCase() || "?"}
              </span>
            </div>
          )}
          <span className="font-medium">{partner.name}</span>
        </div>
      ),
    },
    {
      key: "type",
      label: "Tipo",
      sortable: true,
      render: (partner: any) => (
        <Badge className={typeColors[partner.type] || ""}>
          {typeLabels[partner.type] || partner.type}
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
