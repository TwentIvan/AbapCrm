import { Badge } from "@/components/ui/badge";
import { Handshake } from "lucide-react";
import { registerEntity, EntityListDescriptor } from "../entity-registry";
import { dealStageLabels, dealStageColors } from "../entity-constants";

const dealsDescriptor: EntityListDescriptor = {
  entityKey: "deals",
  title: "Accordo",
  titlePlural: "Accordi",
  apiBase: "/api/deals",
  icon: Handshake,

  supportsAI: false,
  supportsTimeTracking: false,
  supportsMessages: true,
  supportsAudit: true,
  supportsBulkEdit: true,
  supportsBulkCopy: true,
  supportsBulkDelete: true,

  getColumns: (context) => [
    {
      key: "title",
      label: "Titolo",
      sortable: true,
      searchable: true,
      render: (deal: any) => <span className="font-medium" data-testid={`text-deal-title-${deal.id}`}>{deal.title}</span>,
    },
    {
      key: "stage",
      label: "Fase",
      sortable: true,
      render: (deal: any) => (
        <Badge className={dealStageColors[deal.stage] || ""} data-testid={`badge-deal-stage-${deal.id}`}>
          {dealStageLabels[deal.stage] || deal.stage}
        </Badge>
      ),
    },
    {
      key: "partnerId",
      label: "Partner",
      render: (deal: any) => {
        const partner = context?.partners?.find((p: any) => p.id === deal.partnerId);
        return partner?.name || "-";
      },
    },
    {
      key: "value",
      label: "Valore",
      sortable: true,
      render: (deal: any) =>
        new Intl.NumberFormat("it-IT", {
          style: "currency",
          currency: "EUR",
        }).format(parseFloat(deal.value) || 0),
    },
    {
      key: "hourlyRate",
      label: "Tariffa Oraria",
      sortable: true,
      render: (deal: any) =>
        deal.hourlyRate
          ? new Intl.NumberFormat("it-IT", {
              style: "currency",
              currency: "EUR",
            }).format(parseFloat(deal.hourlyRate)) + "/h"
          : "-",
    },
    {
      key: "probability",
      label: "Probabilità",
      sortable: true,
      render: (deal: any) => (
        <div className="flex items-center gap-2">
          <div className="w-16 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${deal.probability || 0}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground">{deal.probability || 0}%</span>
        </div>
      ),
    },
    {
      key: "expectedCloseDate",
      label: "Chiusura Prevista",
      sortable: true,
      render: (deal: any) =>
        deal.expectedCloseDate
          ? new Date(deal.expectedCloseDate).toLocaleDateString("it-IT")
          : "-",
    },
  ],

  getFilterColumns: () => [
    {
      id: "stage",
      label: "Fase",
      type: "select",
      options: [
        { value: "prospecting", label: "Prospezione" },
        { value: "qualification", label: "Qualificazione" },
        { value: "proposal", label: "Proposta" },
        { value: "negotiation", label: "Negoziazione" },
        { value: "closed_won", label: "Vinto" },
        { value: "closed_lost", label: "Perso" },
      ],
    },
    {
      id: "partnerId",
      label: "Partner",
      type: "relation",
      relationEntity: "partners",
    },
  ],

  getBulkEditFields: (context) => {
    const partnerOptions =
      context?.partners?.map((p: any) => ({ value: p.id, label: p.name })) || [];

    return [
      {
        key: "stage",
        label: "Fase",
        type: "select",
        options: [
          { value: "prospecting", label: "Prospezione" },
          { value: "qualification", label: "Qualificazione" },
          { value: "proposal", label: "Proposta" },
          { value: "negotiation", label: "Negoziazione" },
          { value: "closed_won", label: "Vinto" },
          { value: "closed_lost", label: "Perso" },
        ],
      },
      { key: "partnerId", label: "Partner", type: "select", options: partnerOptions },
      { key: "probability", label: "Probabilità (%)", type: "number" },
    ];
  },
};

registerEntity(dealsDescriptor);
