import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  completionPercentage: z.number().min(0).max(100),
  notes: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface CompletionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: FormData) => void;
  isLoading?: boolean;
  currentPercentage?: number;
}

export function CompletionDialog({ 
  isOpen, 
  onClose, 
  onSubmit, 
  isLoading = false,
  currentPercentage = 0 
}: CompletionDialogProps) {
  const [percentage, setPercentage] = useState(currentPercentage);
  
  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      completionPercentage: currentPercentage,
      notes: "",
    },
  });

  // Update percentage when dialog opens with new suggested percentage
  useEffect(() => {
    if (isOpen) {
      console.log('Dialog opening with suggested percentage:', currentPercentage);
      setPercentage(currentPercentage);
      form.reset({
        completionPercentage: currentPercentage,
        notes: "",
      });
    }
  }, [isOpen, currentPercentage, form]);

  const handleSubmit = (data: FormData) => {
    onSubmit({
      ...data,
      completionPercentage: percentage,
    });
    form.reset();
    setPercentage(0);
  };

  const handleClose = () => {
    form.reset();
    setPercentage(currentPercentage);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Update Task Progress</DialogTitle>
        </DialogHeader>
        
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
            <div className="space-y-4">
              <div>
                <FormLabel>Completion Percentage</FormLabel>
                <div className="space-y-4 mt-2">
                  <Slider
                    value={[percentage]}
                    onValueChange={(value) => setPercentage(value[0])}
                    max={100}
                    step={5}
                    className="w-full"
                    data-testid="slider-completion"
                  />
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>0%</span>
                    <span className="font-medium text-foreground">{percentage}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Progress Notes (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        {...field} 
                        placeholder="Add notes about the work completed..."
                        data-testid="input-progress-notes"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="flex justify-end space-x-2">
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleClose}
                disabled={isLoading}
                data-testid="button-cancel-completion"
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isLoading}
                data-testid="button-submit-completion"
              >
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Stop Timer
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}