import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { SapLandscapeParser, type SapSystemFromXml } from "@/lib/sap-landscape-parser";
import { Building, Upload, FileText, AlertCircle, CheckCircle, Server, Globe } from "lucide-react";

const importFormSchema = z.object({
  selectedSystems: z.array(z.string()).min(1, "Please select at least one system to import"),
});

type ImportFormData = z.infer<typeof importFormSchema>;

interface SapLandscapeImportProps {
  onSuccess?: () => void;
}

export default function SapLandscapeImport({ onSuccess }: SapLandscapeImportProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Stati per il processo di import
  const [file, setFile] = useState<File | null>(null);
  const [parsedSystems, setParsedSystems] = useState<SapSystemFromXml[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);
  const [partnersCreated, setPartnersCreated] = useState<Array<{groupName: string, partner: any, created: boolean}>>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"upload" | "configure" | "import">("upload");


  const form = useForm<ImportFormData>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      selectedSystems: [],
    },
  });

  // Mutation per import multiplo
  const importMutation = useMutation({
    mutationFn: async (data: ImportFormData) => {
      const systemsToImport = parsedSystems.filter((_, index) => 
        data.selectedSystems.includes(index.toString())
      );

      const importPromises = systemsToImport.map(async (system, index) => {
        const systemData = {
          ...system,
          // Il partnerId è già assegnato automaticamente nel sistema
        };
        
        const response = await fetch("/api/sap-systems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(systemData),
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          let errorDetails;
          try {
            errorDetails = JSON.parse(errorText);
          } catch {
            errorDetails = { details: errorText };
          }
          throw new Error(`Failed to import ${system.name}: ${errorDetails.details || errorDetails.error || 'Unknown error'}`);
        }
        
        return response.json();
      });

      return Promise.all(importPromises);
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sap-systems"] });
      toast({
        title: "Import Completed",
        description: `Successfully imported ${results.length} SAP systems.`,
      });
      onSuccess?.();
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Import Error",
        description: error.message || "Failed to import SAP systems.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setFile(null);
    setParsedSystems([]);
    setParseErrors([]);
    setPartnersCreated([]);
    setStep("upload");
    form.reset();
  };

  // Handler per upload del file
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    if (!selectedFile) return;

    if (!selectedFile.name.toLowerCase().endsWith('.xml')) {
      toast({
        title: "Invalid File",
        description: "Please select an XML file.",
        variant: "destructive",
      });
      return;
    }

    setFile(selectedFile);
    setIsProcessing(true);

    try {
      const xmlContent = await selectedFile.text();
      const parseResult = await SapLandscapeParser.parseXmlFile(xmlContent);
      
      setParsedSystems(parseResult.systems);
      setParseErrors(parseResult.errors);
      setPartnersCreated(parseResult.partnersCreated || []);
      
      if (parseResult.success && parseResult.systems.length > 0) {
        setStep("configure");
        // Pre-seleziona tutti i sistemi
        form.setValue("selectedSystems", parseResult.systems.map((_, index) => index.toString()));
      } else {
        toast({
          title: "Parsing Failed",
          description: parseResult.errors[0] || "No valid SAP systems found in the file.",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "File Reading Error",
        description: error instanceof Error ? error.message : "Failed to read the file.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const onSubmit = (data: ImportFormData) => {
    setStep("import");
    importMutation.mutate(data);
  };

  const getStepProgress = () => {
    switch (step) {
      case "upload": return 0;
      case "configure": return 50;
      case "import": return 100;
      default: return 0;
    }
  };

  const getLandscapeBadgeColor = (landscape: string) => {
    switch (landscape) {
      case "development": return "bg-primary/10 text-primary";
      case "test": return "bg-warning/10 text-warning";
      case "production": return "bg-destructive/10 text-destructive";
      default: return "bg-muted text-foreground";
    }
  };

  const getSystemTypeBadgeColor = (systemType: string) => {
    switch (systemType) {
      case "s4hana": return "bg-success/10 text-success";
      case "ecc": return "bg-info/10 text-info";
      case "bw": return "bg-purple-100 text-purple-800";
      default: return "bg-muted text-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* Progress Indicator */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Upload File</span>
          <span>Configure</span>
          <span>Import</span>
        </div>
        <Progress value={getStepProgress()} className="h-2" />
      </div>

      {/* Step 1: File Upload */}
      {step === "upload" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload SAPUILandscape.xml
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-8 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <div className="space-y-2">
                <h3 className="text-lg font-semibold">Select SAPUILandscape.xml file</h3>
                <p className="text-muted-foreground">
                  Upload your SAP Landscape configuration file to import system connections
                </p>
              </div>
              <Input
                type="file"
                accept=".xml"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="mt-4 max-w-sm mx-auto"
                data-testid="input-xml-file"
              />
            </div>
            
            {file && (
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  File selected: <strong>{file.name}</strong> ({Math.round(file.size / 1024)} KB)
                </AlertDescription>
              </Alert>
            )}

            {isProcessing && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Processing XML file...
                </AlertDescription>
              </Alert>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 2: Configure Import */}
      {step === "configure" && (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">

            {/* Auto-Created Partners Info */}
            {partnersCreated.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building className="h-5 w-5" />
                    Partner Automatici
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {partnersCreated.map((item, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-muted rounded-lg">
                        <div className="flex items-center gap-3">
                          <Building className="h-4 w-4 text-primary" />
                          <div>
                            <div className="font-medium">{item.partner.name}</div>
                            <div className="text-sm text-muted-foreground">
                              Gruppo: {item.groupName}
                            </div>
                          </div>
                        </div>
                        <Badge variant={item.created ? "default" : "outline"}>
                          {item.created ? "Creato" : "Trovato"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Systems Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Server className="h-5 w-5" />
                  Select Systems to Import ({parsedSystems.length} found)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="selectedSystems"
                  render={() => (
                    <FormItem>
                      <div className="space-y-4">
                        {parsedSystems.map((system, index) => (
                          <FormField
                            key={index}
                            control={form.control}
                            name="selectedSystems"
                            render={({ field }) => (
                              <FormItem className="border rounded-lg p-4">
                                <div className="flex items-start space-x-3">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(index.toString())}
                                      onCheckedChange={(checked) => {
                                        const currentValue = field.value || [];
                                        const indexStr = index.toString();
                                        if (checked) {
                                          field.onChange([...currentValue, indexStr]);
                                        } else {
                                          field.onChange(currentValue.filter((v) => v !== indexStr));
                                        }
                                      }}
                                      data-testid={`checkbox-system-${index}`}
                                    />
                                  </FormControl>
                                  <div className="flex-1 space-y-2">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-semibold flex items-center gap-2">
                                        <Server className="h-4 w-4" />
                                        {system.name}
                                      </h4>
                                      <div className="flex gap-2">
                                        <Badge className={getLandscapeBadgeColor(system.landscape)}>
                                          {system.landscape}
                                        </Badge>
                                        <Badge className={getSystemTypeBadgeColor(system.systemType)}>
                                          {system.systemType.toUpperCase()}
                                        </Badge>
                                      </div>
                                    </div>
                                    
                                    {system.description && (
                                      <p className="text-sm text-muted-foreground">{system.description}</p>
                                    )}
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                                      <div className="flex items-center gap-1">
                                        <Globe className="h-3 w-3" />
                                        <span className="font-medium">Host:</span> {system.serverHost}
                                      </div>
                                      <div>
                                        <span className="font-medium">System:</span> {system.systemNumber}
                                      </div>
                                      <div>
                                        <span className="font-medium">Port:</span> {system.applicationServerPort}
                                      </div>
                                    </div>
                                    
                                    {system.partnerId && (
                                      <div className="mt-2 flex items-center gap-2">
                                        <Building className="h-3 w-3 text-success" />
                                        <span className="text-sm text-success font-medium">
                                          Partner automatico assegnato
                                        </span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

            {/* Parse Errors */}
            {parseErrors.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p><strong>Import Warnings:</strong></p>
                    {parseErrors.map((error, index) => (
                      <p key={index} className="text-sm">• {error}</p>
                    ))}
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Submit Buttons */}
            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={resetForm} data-testid="button-reset">
                Start Over
              </Button>
              <Button 
                type="submit" 
                disabled={importMutation.isPending} 
                data-testid="button-import"
              >
                {importMutation.isPending ? "Importing..." : `Import Selected Systems`}
              </Button>
            </div>
          </form>
        </Form>
      )}

      {/* Step 3: Import Progress */}
      {step === "import" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {importMutation.isPending ? (
                <AlertCircle className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle className="h-5 w-5 text-success" />
              )}
              Import in Progress
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {importMutation.isPending ? (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Importing SAP systems... Please wait.
                </AlertDescription>
              </Alert>
            ) : importMutation.isSuccess ? (
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>
                  Import completed successfully!
                </AlertDescription>
              </Alert>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
}