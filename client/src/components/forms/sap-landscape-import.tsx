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
import type { Partner } from "@shared/schema";

const importFormSchema = z.object({
  partnerId: z.string().optional(),
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
  const [isProcessing, setIsProcessing] = useState(false);
  const [step, setStep] = useState<"upload" | "configure" | "import">("upload");

  // Fetch partners per la selezione
  const partnersQuery = useQuery<Partner[]>({
    queryKey: ["/api/partners"],
    queryFn: async () => {
      const res = await fetch("/api/partners", { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch partners');
      const data = await res.json();
      console.log("🏢 Partners loaded:", data);
      return data;
    },
  });

  const partners = partnersQuery.data;

  const form = useForm<ImportFormData>({
    resolver: zodResolver(importFormSchema),
    defaultValues: {
      partnerId: undefined,
      selectedSystems: [],
    },
  });

  // Mutation per import multiplo
  const importMutation = useMutation({
    mutationFn: async (data: ImportFormData) => {
      console.log("🚀 Starting import with data:", data);
      console.log("📋 Parsed systems:", parsedSystems);
      
      const systemsToImport = parsedSystems.filter((_, index) => 
        data.selectedSystems.includes(index.toString())
      );
      
      console.log("✅ Systems to import:", systemsToImport);

      const importPromises = systemsToImport.map(async (system, index) => {
        const systemData = {
          ...system,
          partnerId: data.partnerId || undefined,
        };
        
        console.log(`📤 Importing system ${index + 1}/${systemsToImport.length}:`, system.name, systemData);
        
        const response = await fetch("/api/sap-systems", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(systemData),
        });
        
        console.log(`📥 Response for ${system.name}:`, response.status, response.statusText);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Error response for ${system.name}:`, errorText);
          let errorDetails;
          try {
            errorDetails = JSON.parse(errorText);
          } catch {
            errorDetails = { details: errorText };
          }
          throw new Error(`Failed to import ${system.name}: ${errorDetails.details || errorDetails.error || 'Unknown error'}`);
        }
        
        const result = await response.json();
        console.log(`✅ Successfully imported ${system.name}:`, result);
        return result;
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
    console.log("🎯 Form submit triggered with data:", data);
    console.log("🔍 Form validation errors:", form.formState.errors);
    console.log("📝 Form values:", form.getValues());
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
      case "development": return "bg-blue-100 text-blue-800";
      case "test": return "bg-yellow-100 text-yellow-800";
      case "production": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getSystemTypeBadgeColor = (systemType: string) => {
    switch (systemType) {
      case "s4hana": return "bg-green-100 text-green-800";
      case "ecc": return "bg-indigo-100 text-indigo-800";
      case "bw": return "bg-purple-100 text-purple-800";
      default: return "bg-gray-100 text-gray-800";
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
            {/* Partner Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building className="h-5 w-5" />
                  Select Partner
                </CardTitle>
              </CardHeader>
              <CardContent>
                <FormField
                  control={form.control}
                  name="partnerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Associated Partner</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-partner">
                            <SelectValue placeholder="Select the partner who owns these SAP systems" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {partnersQuery.isLoading && (
                            <SelectItem value="loading" disabled>Loading partners...</SelectItem>
                          )}
                          {partnersQuery.error && (
                            <SelectItem value="error" disabled>Failed to load partners</SelectItem>
                          )}
                          {partners?.map((partner) => (
                            <SelectItem key={partner.id} value={partner.id}>
                              <div className="flex items-center gap-2">
                                <Building className="h-4 w-4" />
                                {partner.name}
                                {partner.company && (
                                  <span className="text-sm text-gray-500">({partner.company})</span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                          {!partnersQuery.isLoading && !partnersQuery.error && (!partners || partners.length === 0) && (
                            <SelectItem value="none" disabled>No partners found</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </CardContent>
            </Card>

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
                                    
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                      <div className="flex items-center gap-1">
                                        <Globe className="h-3 w-3" />
                                        <span className="font-medium">Host:</span> {system.serverHost}
                                      </div>
                                      <div>
                                        <span className="font-medium">System:</span> {system.systemNumber}
                                      </div>
                                      <div>
                                        <span className="font-medium">Client:</span> {system.clientNumber}
                                      </div>
                                      <div>
                                        <span className="font-medium">Port:</span> {system.applicationServerPort}
                                      </div>
                                    </div>
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
                onClick={(e) => {
                  console.log("🖱️ Import button clicked!");
                  console.log("📝 Form is valid:", form.formState.isValid);
                  console.log("📋 Form errors:", form.formState.errors);
                  console.log("💾 Form values:", form.getValues());
                }}
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
                <CheckCircle className="h-5 w-5 text-green-600" />
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