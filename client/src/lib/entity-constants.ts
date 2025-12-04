export const taskStatusColors: Record<string, string> = {
  todo: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200",
  in_progress: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  review: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  completed: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
};

export const taskPriorityColors: Record<string, string> = {
  low: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300", 
  high: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  urgent: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export const taskStatusLabels: Record<string, string> = {
  todo: "Da fare",
  in_progress: "In corso",
  review: "In revisione",
  completed: "Completato",
};

export const taskPriorityLabels: Record<string, string> = {
  low: "Bassa",
  medium: "Media",
  high: "Alta",
  urgent: "Urgente",
};

export const projectStatusColors: Record<string, string> = {
  planning: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  active: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  in_progress: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  on_hold: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  completed: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
  cancelled: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};

export const projectStatusLabels: Record<string, string> = {
  planning: "Pianificazione",
  active: "Attivo",
  in_progress: "In Corso",
  on_hold: "In Pausa",
  completed: "Completato",
  cancelled: "Annullato",
};

export const partnerTypeLabels: Record<string, string> = {
  client: "Cliente",
  supplier: "Fornitore",
  partner: "Partner",
  employee: "Dipendente",
  candidate: "Candidato",
  other: "Altro",
};

export const partnerTypeColors: Record<string, string> = {
  client: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  supplier: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  partner: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300",
  employee: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  candidate: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  other: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300",
};

export const dealStageLabels: Record<string, string> = {
  prospecting: "Prospezione",
  qualification: "Qualificazione",
  proposal: "Proposta",
  negotiation: "Negoziazione",
  closed_won: "Vinto",
  closed_lost: "Perso",
};

export const dealStageColors: Record<string, string> = {
  prospecting: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300",
  qualification: "bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300",
  proposal: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  negotiation: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-300",
  closed_won: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300",
  closed_lost: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
};
