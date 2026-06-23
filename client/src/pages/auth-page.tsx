import React, { useState } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Users, Calendar, TrendingUp, Shield, Zap, Mail, CheckCircle } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { SiGoogle } from "react-icons/si";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  email: z.string().min(1, "Username o email richiesti"),
  password: z.string().min(1, "Password richiesta"),
});

const registerSchema = z.object({
  email: z.string().email("Inserisci un'email valida"),
  password: z.string().min(6, "Password deve avere almeno 6 caratteri"),
  firstName: z.string().min(1, "Nome richiesto"),
  lastName: z.string().min(1, "Cognome richiesto"),
});

const resetSchema = z.object({
  email: z.string().email("Inserisci un'email valida"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;
type ResetForm = z.infer<typeof resetSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetPending, setResetPending] = useState(false);

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURN
  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

  const resetForm = useForm<ResetForm>({
    resolver: zodResolver(resetSchema),
    defaultValues: {
      email: "",
    },
  });

  // If user is already authenticated, redirect to home
  React.useEffect(() => {
    if (!isLoading && user) {
      setLocation("/");
    }
  }, [isLoading, user, setLocation]);

  // Don't render anything if redirecting
  if (!isLoading && user) {
    return null;
  }

  const onLogin = async (data: LoginForm) => {
    loginMutation.mutate(data, {
      onSuccess: () => setLocation("/"),
    });
  };

  const onRegister = async (data: RegisterForm) => {
    registerMutation.mutate(data, {
      onSuccess: (response: any) => {
        // Check if registration includes verification message
        if (response.message && response.message.includes("Controlla la tua email")) {
          setRegistrationSuccess(true);
          registerForm.reset();
        } else {
          setLocation("/");
        }
      },
    });
  };

  const onReset = async (data: ResetForm) => {
    setResetError("");
    setResetSuccess(false);
    setResetPending(true);
    
    try {
      const response = await fetch("/api/password-reset/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      
      // SECURITY FIX: Always show success for 2xx and 4xx responses to prevent email enumeration
      // Only show error for network issues (5xx) to avoid leaking email existence information
      if (response.ok || response.status < 500) {
        setResetSuccess(true);
        resetForm.reset();
      } else {
        setResetError("Errore di connessione. Riprova più tardi.");
      }
    } catch (error) {
      setResetError("Errore di connessione. Riprova più tardi.");
    } finally {
      setResetPending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted">
      <div className="container flex items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Hero Section */}
            <div className="hidden lg:block space-y-8">
              <div className="space-y-4">
                <Wordmark height={46} />
                <p className="text-xl text-muted-foreground">
                  Il hub completo per la gestione della tua attività di freelancer SAP ABAP
                </p>
              </div>
              
              <div className="space-y-4">
                <FeatureItem 
                  icon={<Users className="h-5 w-5" />}
                  title="Gestione Partner"
                  description="Amministra clienti e fornitori in modo centralizzato"
                />
                
                <FeatureItem 
                  icon={<Calendar className="h-5 w-5" />}
                  title="Progetti & Task"
                  description="Organizza e traccia il lavoro con timesheet integrati"
                />
                
                <FeatureItem 
                  icon={<TrendingUp className="h-5 w-5" />}
                  title="Pipeline Commerciale"
                  description="Gestisci opportunità e accordi tariffari"
                />
                
                <FeatureItem 
                  icon={<Shield className="h-5 w-5" />}
                  title="Sistema SAP"
                  description="Connessioni VPN e credenziali per sistemi SAP"
                />
              </div>
              
              <div className="flex items-center space-x-2 text-sm text-muted-foreground dark:text-muted-foreground">
                <Zap className="h-4 w-4" />
                <span>Progettato specificamente per professionisti SAP ABAP</span>
              </div>
            </div>

            {/* Form Section */}
            <div className="w-full max-w-md mx-auto lg:mx-0">
              <Card className="border bg-background/95 backdrop-blur-sm">
                <CardHeader className="space-y-4 text-center">
                  <div className="w-16 h-16 bg-primary rounded-lg flex items-center justify-center mx-auto">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">
                      {activeTab === "login" ? "Accedi" : 
                       activeTab === "register" ? "Registrati" : "Reset Password"}
                    </CardTitle>
                    <CardDescription className="text-muted-foreground dark:text-muted-foreground">
                      {activeTab === "login" 
                        ? "Accedi al tuo account" 
                        : activeTab === "register"
                        ? "Crea il tuo account freelancer"
                        : "Inserisci la tua email per ricevere il link di reset"}
                    </CardDescription>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {registrationSuccess && (
                    <Alert className="bg-success/10 border-success/30">
                      <CheckCircle className="h-4 w-4 text-success" />
                      <AlertDescription className="text-success dark:text-success">
                        Registrazione completata! Controlla la tua email per confermare l'account.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Tabs value={activeTab} onValueChange={(value) => {
                    setActiveTab(value);
                    setRegistrationSuccess(false);
                    setResetSuccess(false);
                    setResetError("");
                  }} className="w-full">
                    <TabsList className="grid w-full grid-cols-3 h-11">
                      <TabsTrigger value="login" data-testid="tab-login" className="font-medium">
                        Accedi
                      </TabsTrigger>
                      <TabsTrigger value="register" data-testid="tab-register" className="font-medium">
                        Registrati
                      </TabsTrigger>
                      <TabsTrigger value="reset" data-testid="tab-reset" className="font-medium">
                        Reset
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="login" className="space-y-4">
                      <Form {...loginForm}>
                        <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4" autoComplete="on">
                          <FormField
                            control={loginForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">Username o Email</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="text"
                                    name="email"
                                    id="loginEmail"
                                    autoComplete="username"
                                    data-testid="input-email"
                                    placeholder="Username o email" 
                                    className="h-11"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={loginForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="password"
                                    name="current-password"
                                    id="loginPassword"
                                    autoComplete="current-password"
                                    data-testid="input-password"
                                    placeholder="La tua password" 
                                    className="h-11"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <Button 
                            type="submit" 
                            className="w-full h-11 font-medium"
                            data-testid="button-login"
                            disabled={loginMutation.isPending}
                          >
                            {loginMutation.isPending ? "Accesso in corso..." : "Accedi"}
                          </Button>
                        </form>
                      </Form>
                      
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background dark:bg-card px-2 text-muted-foreground">
                            oppure
                          </span>
                        </div>
                      </div>
                      
                      {/* Google OAuth disabilitato per sviluppo - riattivare in produzione
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-11"
                        data-testid="button-google-login"
                        onClick={() => window.location.href = '/api/auth/google'}
                      >
                        <SiGoogle className="mr-2 h-4 w-4" />
                        Accedi con Google
                      </Button>
                      */}
                    </TabsContent>
                    
                    <TabsContent value="register" className="space-y-4">
                      <Form {...registerForm}>
                        <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4" autoComplete="on">
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={registerForm.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-foreground">Nome</FormLabel>
                                  <FormControl>
                                    <Input 
                                      value={field.value}
                                      onChange={field.onChange}
                                      onBlur={field.onBlur}
                                      name="given-name"
                                      id="firstName"
                                      autoComplete="given-name"
                                      data-testid="input-first-name"
                                      placeholder="Nome" 
                                      className="h-11"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            
                            <FormField
                              control={registerForm.control}
                              name="lastName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-foreground">Cognome</FormLabel>
                                  <FormControl>
                                    <Input 
                                      value={field.value}
                                      onChange={field.onChange}
                                      onBlur={field.onBlur}
                                      name="family-name"
                                      id="lastName"
                                      autoComplete="family-name"
                                      data-testid="input-last-name"
                                      placeholder="Cognome" 
                                      className="h-11"
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          
                          <FormField
                            control={registerForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">
                                  <span className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    Email
                                  </span>
                                </FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="email"
                                    name="email"
                                    id="registerEmail"
                                    autoComplete="email"
                                    data-testid="input-email"
                                    placeholder="La tua email" 
                                    className="h-11"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={registerForm.control}
                            name="password"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="password"
                                    name="new-password"
                                    id="registerPassword"
                                    autoComplete="new-password"
                                    data-testid="input-register-password"
                                    placeholder="Crea una password" 
                                    className="h-11"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <Button 
                            type="submit" 
                            className="w-full h-11 font-medium"
                            data-testid="button-register"
                            disabled={registerMutation.isPending}
                          >
                            {registerMutation.isPending ? "Creazione account..." : "Crea Account"}
                          </Button>
                        </form>
                      </Form>
                      
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                          <span className="w-full border-t border-border" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-background dark:bg-card px-2 text-muted-foreground">
                            oppure
                          </span>
                        </div>
                      </div>
                      
                      {/* Google OAuth disabilitato per sviluppo - riattivare in produzione
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full h-11"
                        data-testid="button-google-register"
                        onClick={() => window.location.href = '/api/auth/google'}
                      >
                        <SiGoogle className="mr-2 h-4 w-4" />
                        Registrati con Google
                      </Button>
                      */}
                    </TabsContent>
                    
                    <TabsContent value="reset" className="space-y-4">
                      {resetSuccess && (
                        <Alert className="bg-success/10 border-success/30">
                          <CheckCircle className="h-4 w-4 text-success" />
                          <AlertDescription className="text-success dark:text-success">
                            Se l'email esiste nel sistema, riceverai un link per il reset della password.
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      {resetError && (
                        <Alert className="bg-destructive/10 border-destructive/30 dark:bg-red-900/20 dark:border-red-800">
                          <AlertCircle className="h-4 w-4 text-destructive" />
                          <AlertDescription className="text-destructive dark:text-red-300">
                            {resetError}
                          </AlertDescription>
                        </Alert>
                      )}
                      
                      <Form {...resetForm}>
                        <form onSubmit={resetForm.handleSubmit(onReset)} className="space-y-4" autoComplete="on">
                          <FormField
                            control={resetForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-foreground">
                                  <span className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    Email
                                  </span>
                                </FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="email"
                                    name="email"
                                    id="resetEmail"
                                    autoComplete="email"
                                    data-testid="input-reset-email"
                                    placeholder="La tua email" 
                                    className="h-11"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <Button 
                            type="submit" 
                            className="w-full h-11 font-medium"
                            data-testid="button-reset"
                            disabled={resetPending}
                          >
                            {resetPending ? "Invio in corso..." : "Invia Link Reset"}
                          </Button>
                        </form>
                      </Form>
                      
                      <div className="text-center">
                        <p className="text-sm text-muted-foreground dark:text-muted-foreground">
                          Ricordi la password?{" "}
                          <button
                            type="button"
                            onClick={() => setActiveTab("login")}
                            className="text-primary hover:text-primary font-medium"
                            data-testid="link-back-to-login"
                          >
                            Torna al login
                          </button>
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

interface FeatureItemProps {
  icon: React.ReactNode;
  title: string;
  description: string;
}

function FeatureItem({ icon, title, description }: FeatureItemProps) {
  return (
    <div className="flex items-start space-x-3">
      <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center flex-shrink-0">
        <div className="text-primary">
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-foreground dark:text-white">{title}</h3>
        <p className="text-sm text-muted-foreground dark:text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}