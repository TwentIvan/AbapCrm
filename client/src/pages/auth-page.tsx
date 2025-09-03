import { useState } from "react";
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
import { SiGoogle } from "react-icons/si";
import { Alert, AlertDescription } from "@/components/ui/alert";

const loginSchema = z.object({
  username: z.string().min(1, "Username richiesto"),
  password: z.string().min(1, "Password richiesta"),
});

const registerSchema = z.object({
  username: z.string().min(3, "Username deve avere almeno 3 caratteri"),
  email: z.string().email("Inserisci un'email valida"),
  password: z.string().min(6, "Password deve avere almeno 6 caratteri"),
  firstName: z.string().min(1, "Nome richiesto"),
  lastName: z.string().min(1, "Cognome richiesto"),
});

type LoginForm = z.infer<typeof loginSchema>;
type RegisterForm = z.infer<typeof registerSchema>;

export default function AuthPage() {
  const [, setLocation] = useLocation();
  const { user, loginMutation, registerMutation, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState("login");
  const [registrationSuccess, setRegistrationSuccess] = useState(false);

  // If user is already authenticated, redirect to home
  if (!isLoading && user) {
    setLocation("/");
    return null;
  }

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const registerForm = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: "",
      email: "",
      password: "",
      firstName: "",
      lastName: "",
    },
  });

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
      <div className="container flex items-center justify-center min-h-screen px-4 py-8">
        <div className="w-full max-w-6xl">
          <div className="grid lg:grid-cols-2 gap-8 items-center">
            {/* Hero Section */}
            <div className="hidden lg:block space-y-8">
              <div className="space-y-4">
                <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
                  CRM SAP Freelancer
                </h1>
                <p className="text-xl text-gray-600 dark:text-gray-300">
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
              
              <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
                <Zap className="h-4 w-4" />
                <span>Progettato specificamente per professionisti SAP ABAP</span>
              </div>
            </div>

            {/* Form Section */}
            <div className="w-full max-w-md mx-auto lg:mx-0">
              <Card className="shadow-xl border-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-sm">
                <CardHeader className="space-y-4 text-center">
                  <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Shield className="h-8 w-8 text-white" />
                  </div>
                  <div>
                    <CardTitle className="text-2xl">
                      {activeTab === "login" ? "Accedi" : "Registrati"}
                    </CardTitle>
                    <CardDescription className="text-gray-500 dark:text-gray-400">
                      {activeTab === "login" 
                        ? "Accedi al tuo account" 
                        : "Crea il tuo account freelancer"}
                    </CardDescription>
                  </div>
                </CardHeader>
                
                <CardContent className="space-y-6">
                  {registrationSuccess && (
                    <Alert className="bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-green-700 dark:text-green-300">
                        Registrazione completata! Controlla la tua email per confermare l'account.
                      </AlertDescription>
                    </Alert>
                  )}

                  <Tabs value={activeTab} onValueChange={(value) => {
                    setActiveTab(value);
                    setRegistrationSuccess(false);
                  }} className="w-full">
                    <TabsList className="grid w-full grid-cols-2 h-11">
                      <TabsTrigger value="login" data-testid="tab-login" className="font-medium">
                        Accedi
                      </TabsTrigger>
                      <TabsTrigger value="register" data-testid="tab-register" className="font-medium">
                        Registrati
                      </TabsTrigger>
                    </TabsList>
                    
                    <TabsContent value="login" className="space-y-4">
                      <Form {...loginForm}>
                        <form onSubmit={loginForm.handleSubmit(onLogin)} className="space-y-4">
                          <FormField
                            control={loginForm.control}
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 dark:text-gray-300">Username</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    data-testid="input-username"
                                    placeholder="Il tuo username" 
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
                                <FormLabel className="text-gray-700 dark:text-gray-300">Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="password"
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
                          <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white dark:bg-gray-800 px-2 text-gray-500">
                            oppure
                          </span>
                        </div>
                      </div>
                      
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
                    </TabsContent>
                    
                    <TabsContent value="register" className="space-y-4">
                      <Form {...registerForm}>
                        <form onSubmit={registerForm.handleSubmit(onRegister)} className="space-y-4">
                          <div className="grid grid-cols-2 gap-3">
                            <FormField
                              control={registerForm.control}
                              name="firstName"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-gray-700 dark:text-gray-300">Nome</FormLabel>
                                  <FormControl>
                                    <Input 
                                      {...field} 
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
                                  <FormLabel className="text-gray-700 dark:text-gray-300">Cognome</FormLabel>
                                  <FormControl>
                                    <Input 
                                      {...field} 
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
                            name="username"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 dark:text-gray-300">Username</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    data-testid="input-register-username"
                                    placeholder="Scegli un username" 
                                    className="h-11"
                                  />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={registerForm.control}
                            name="email"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="text-gray-700 dark:text-gray-300">
                                  <span className="flex items-center gap-2">
                                    <Mail className="h-4 w-4" />
                                    Email
                                  </span>
                                </FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="email"
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
                                <FormLabel className="text-gray-700 dark:text-gray-300">Password</FormLabel>
                                <FormControl>
                                  <Input 
                                    {...field} 
                                    type="password"
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
                          <span className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-xs uppercase">
                          <span className="bg-white dark:bg-gray-800 px-2 text-gray-500">
                            oppure
                          </span>
                        </div>
                      </div>
                      
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
      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center flex-shrink-0">
        <div className="text-blue-600 dark:text-blue-400">
          {icon}
        </div>
      </div>
      <div className="space-y-1">
        <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
        <p className="text-sm text-gray-600 dark:text-gray-400">{description}</p>
      </div>
    </div>
  );
}