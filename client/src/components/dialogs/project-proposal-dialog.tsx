import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Sparkles, Building2, FolderKanban, CheckSquare, Loader2, AlertCircle } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface ProjectProposal {
  project: {
    isNew: boolean;
    existingId?: string;
    name: string;
    description: string;
    status: string;
    startDate?: string;
    endDate?: string;
    estimatedEffort?: number;
  };
  partner: {
    isNew: boolean;
    existingId?: string;
    name: string;
    email?: string;
    company?: string;
    type: string;
  };
  tasks: Array<{
    isNew: boolean;
    existingId?: string;
    title: string;
    description: string;
    priority: string;
    taskType: string;
    estimatedEffort?: number;
    dueDate?: string;
  }>;
  reasoning: string;
}

interface ProjectProposalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  proposal: ProjectProposal | null;
  onApply: (editedProposal: ProjectProposal) => Promise<void>;
  isApplying: boolean;
}

export function ProjectProposalDialog({
  open,
  onOpenChange,
  proposal,
  onApply,
  isApplying
}: ProjectProposalDialogProps) {
  const [editedProposal, setEditedProposal] = useState<ProjectProposal | null>(proposal);

  // Update edited proposal when proposal changes
  useEffect(() => {
    if (proposal) {
      setEditedProposal(proposal);
    }
  }, [proposal]);

  // Guard: only check proposal (editedProposal will be initialized from it)
  if (!proposal) return null;

  // Use editedProposal if available, otherwise fall back to proposal
  const currentProposal = editedProposal || proposal;

  // Additional safety: ensure all required fields exist
  if (!currentProposal.project || !currentProposal.partner || !currentProposal.tasks) {
    return null;
  }

  const updateProject = (field: string, value: any) => {
    const base = editedProposal || proposal;
    setEditedProposal({
      ...base,
      project: { ...base.project, [field]: value }
    });
  };

  const updatePartner = (field: string, value: any) => {
    const base = editedProposal || proposal;
    setEditedProposal({
      ...base,
      partner: { ...base.partner, [field]: value }
    });
  };

  const updateTask = (index: number, field: string, value: any) => {
    const base = editedProposal || proposal;
    const newTasks = [...base.tasks];
    newTasks[index] = { ...newTasks[index], [field]: value };
    setEditedProposal({ ...base, tasks: newTasks });
  };

  const removeTask = (index: number) => {
    const base = editedProposal || proposal;
    const newTasks = base.tasks.filter((_, i) => i !== index);
    setEditedProposal({ ...base, tasks: newTasks });
  };

  const addTask = () => {
    const base = editedProposal || proposal;
    const newTask = {
      isNew: true,
      title: "",
      description: "",
      priority: "medium" as const,
      taskType: "other" as const,
    };
    setEditedProposal({
      ...base,
      tasks: [...base.tasks, newTask]
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-purple-500" />
            Proposta Progetto AI
          </DialogTitle>
          <DialogDescription>
            Rivedi e modifica la proposta generata dall'intelligenza artificiale prima di confermare.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-sm">
            <strong>Analisi AI:</strong> {proposal.reasoning}
          </AlertDescription>
        </Alert>

        <Tabs defaultValue="project" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="project" data-testid="tab-project">
              <FolderKanban className="h-4 w-4 mr-2" />
              Progetto
            </TabsTrigger>
            <TabsTrigger value="partner" data-testid="tab-partner">
              <Building2 className="h-4 w-4 mr-2" />
              Partner
            </TabsTrigger>
            <TabsTrigger value="tasks" data-testid="tab-tasks">
              <CheckSquare className="h-4 w-4 mr-2" />
              Task ({currentProposal.tasks?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="project" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {currentProposal.project.isNew ? (
                  <Badge variant="default" className="bg-success">Nuovo Progetto</Badge>
                ) : (
                  <Badge variant="secondary">Modifica Progetto Esistente</Badge>
                )}
              </div>
              
              {!currentProposal.project.isNew && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="force-new-project"
                    checked={currentProposal.project.isNew}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updateProject('isNew', true);
                        updateProject('existingId', undefined);
                      }
                    }}
                    data-testid="checkbox-force-new-project"
                  />
                  <label
                    htmlFor="force-new-project"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Forza creazione nuovo progetto
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="project-name">Nome Progetto</Label>
                <Input
                  id="project-name"
                  value={currentProposal.project.name}
                  onChange={(e) => updateProject('name', e.target.value)}
                  data-testid="input-project-name"
                />
              </div>

              <div>
                <Label htmlFor="project-description">Descrizione</Label>
                <Textarea
                  id="project-description"
                  value={currentProposal.project.description}
                  onChange={(e) => updateProject('description', e.target.value)}
                  rows={4}
                  data-testid="input-project-description"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="project-status">Status</Label>
                  <Select
                    value={currentProposal.project.status}
                    onValueChange={(value) => updateProject('status', value)}
                  >
                    <SelectTrigger id="project-status" data-testid="select-project-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="planning">Pianificazione</SelectItem>
                      <SelectItem value="in_progress">In Corso</SelectItem>
                      <SelectItem value="review">Revisione</SelectItem>
                      <SelectItem value="completed">Completato</SelectItem>
                      <SelectItem value="on_hold">In Pausa</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="project-effort">Ore Stimate</Label>
                  <Input
                    id="project-effort"
                    type="number"
                    value={currentProposal.project.estimatedEffort || ''}
                    onChange={(e) => updateProject('estimatedEffort', e.target.value ? Number(e.target.value) : undefined)}
                    data-testid="input-project-effort"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="project-start">Data Inizio</Label>
                  <Input
                    id="project-start"
                    type="date"
                    value={currentProposal.project.startDate || ''}
                    onChange={(e) => updateProject('startDate', e.target.value)}
                    data-testid="input-project-start"
                  />
                </div>

                <div>
                  <Label htmlFor="project-end">Data Fine</Label>
                  <Input
                    id="project-end"
                    type="date"
                    value={currentProposal.project.endDate || ''}
                    onChange={(e) => updateProject('endDate', e.target.value)}
                    data-testid="input-project-end"
                  />
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="partner" className="space-y-4 mt-4">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                {currentProposal.partner.isNew ? (
                  <Badge variant="default" className="bg-success">Nuovo Partner</Badge>
                ) : (
                  <Badge variant="secondary">Partner Esistente</Badge>
                )}
              </div>
              
              {!currentProposal.partner.isNew && (
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="force-new-partner"
                    checked={currentProposal.partner.isNew}
                    onCheckedChange={(checked) => {
                      if (checked) {
                        updatePartner('isNew', true);
                        updatePartner('existingId', undefined);
                      }
                    }}
                    data-testid="checkbox-force-new-partner"
                  />
                  <label
                    htmlFor="force-new-partner"
                    className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                  >
                    Forza creazione nuovo partner
                  </label>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="partner-name">Nome</Label>
                <Input
                  id="partner-name"
                  value={currentProposal.partner.name}
                  onChange={(e) => updatePartner('name', e.target.value)}
                  data-testid="input-partner-name"
                />
              </div>

              <div>
                <Label htmlFor="partner-email">Email</Label>
                <Input
                  id="partner-email"
                  type="email"
                  value={currentProposal.partner.email || ''}
                  onChange={(e) => updatePartner('email', e.target.value)}
                  data-testid="input-partner-email"
                />
              </div>

              <div>
                <Label htmlFor="partner-company">Azienda</Label>
                <Input
                  id="partner-company"
                  value={currentProposal.partner.company || ''}
                  onChange={(e) => updatePartner('company', e.target.value)}
                  data-testid="input-partner-company"
                />
              </div>

              <div>
                <Label htmlFor="partner-type">Tipo</Label>
                <Select
                  value={currentProposal.partner.type}
                  onValueChange={(value) => updatePartner('type', value)}
                >
                  <SelectTrigger id="partner-type" data-testid="select-partner-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="client">Cliente</SelectItem>
                    <SelectItem value="vendor">Fornitore</SelectItem>
                    <SelectItem value="consultant">Consulente</SelectItem>
                    <SelectItem value="other">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="tasks" className="space-y-4 mt-4">
            {currentProposal.tasks?.map((task, index) => (
              <div key={index} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {task.isNew ? (
                      <Badge variant="default" className="bg-success">Nuovo Task</Badge>
                    ) : (
                      <Badge variant="secondary">Modifica Task</Badge>
                    )}
                    <span className="text-sm text-muted-foreground">Task {index + 1}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeTask(index)}
                    data-testid={`button-remove-task-${index}`}
                  >
                    Rimuovi
                  </Button>
                </div>

                <Separator />

                <div>
                  <Label htmlFor={`task-title-${index}`}>Titolo</Label>
                  <Input
                    id={`task-title-${index}`}
                    value={task.title}
                    onChange={(e) => updateTask(index, 'title', e.target.value)}
                    data-testid={`input-task-title-${index}`}
                  />
                </div>

                <div>
                  <Label htmlFor={`task-description-${index}`}>Descrizione</Label>
                  <Textarea
                    id={`task-description-${index}`}
                    value={task.description}
                    onChange={(e) => updateTask(index, 'description', e.target.value)}
                    rows={2}
                    data-testid={`input-task-description-${index}`}
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label htmlFor={`task-priority-${index}`}>Priorità</Label>
                    <Select
                      value={task.priority}
                      onValueChange={(value) => updateTask(index, 'priority', value)}
                    >
                      <SelectTrigger id={`task-priority-${index}`} data-testid={`select-task-priority-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Bassa</SelectItem>
                        <SelectItem value="medium">Media</SelectItem>
                        <SelectItem value="high">Alta</SelectItem>
                        <SelectItem value="urgent">Urgente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor={`task-type-${index}`}>Tipo</Label>
                    <Select
                      value={task.taskType}
                      onValueChange={(value) => updateTask(index, 'taskType', value)}
                    >
                      <SelectTrigger id={`task-type-${index}`} data-testid={`select-task-type-${index}`}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="development">Sviluppo</SelectItem>
                        <SelectItem value="analysis">Analisi</SelectItem>
                        <SelectItem value="design">Progettazione</SelectItem>
                        <SelectItem value="testing">Test</SelectItem>
                        <SelectItem value="consulting">Consulenza</SelectItem>
                        <SelectItem value="meeting">Riunione</SelectItem>
                        <SelectItem value="documentation">Documentazione</SelectItem>
                        <SelectItem value="maintenance">Manutenzione</SelectItem>
                        <SelectItem value="support">Supporto</SelectItem>
                        <SelectItem value="other">Altro</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label htmlFor={`task-effort-${index}`}>Ore</Label>
                    <Input
                      id={`task-effort-${index}`}
                      type="number"
                      value={task.estimatedEffort || ''}
                      onChange={(e) => updateTask(index, 'estimatedEffort', e.target.value ? Number(e.target.value) : undefined)}
                      data-testid={`input-task-effort-${index}`}
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor={`task-due-${index}`}>Scadenza</Label>
                  <Input
                    id={`task-due-${index}`}
                    type="date"
                    value={task.dueDate || ''}
                    onChange={(e) => updateTask(index, 'dueDate', e.target.value)}
                    data-testid={`input-task-due-${index}`}
                  />
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addTask}
              className="w-full"
              data-testid="button-add-task"
            >
              + Aggiungi Task
            </Button>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isApplying}
            data-testid="button-cancel"
          >
            Annulla
          </Button>
          <Button
            onClick={() => onApply(currentProposal)}
            disabled={isApplying}
            data-testid="button-apply"
          >
            {isApplying && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Conferma e Crea
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
