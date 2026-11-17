import { useState } from "react";
import { Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, CheckCircle } from "lucide-react";

const schema = z
  .object({
    password: z.string().min(6, "La password deve avere almeno 6 caratteri"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Le due password non coincidono", path: ["confirm"] });

type ResetPasswordForm = z.infer<typeof schema>;

/** Pagina del link ricevuto per email: imposta la nuova password con il token della query. */
export default function ResetPasswordPage() {
  const token = new URLSearchParams(window.location.search).get("token") ?? "";
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const form = useForm<ResetPasswordForm>({ resolver: zodResolver(schema), defaultValues: { password: "", confirm: "" } });

  const onSubmit = async (data: ResetPasswordForm) => {
    setError("");
    setPending(true);
    try {
      const response = await fetch("/api/password-reset/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: data.password }),
      });
      if (response.ok) {
        setDone(true);
        // Il token è stato usato: toglilo dall'indirizzo
        window.history.replaceState(null, "", "/reset-password");
      } else if (response.status === 400) {
        setError("Il link non è valido o è scaduto: chiedine uno nuovo dalla pagina di accesso.");
      } else {
        setError("Errore del server. Riprova più tardi.");
      }
    } catch {
      setError("Errore di connessione. Riprova più tardi.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Nuova password</CardTitle>
          <CardDescription>Scegli la nuova password del tuo account</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {done ? (
            <>
              <Alert>
                <CheckCircle className="h-4 w-4" />
                <AlertDescription>Password aggiornata. Ora puoi accedere con la nuova password.</AlertDescription>
              </Alert>
              <Button asChild className="w-full">
                <Link href="/auth">Vai all'accesso</Link>
              </Button>
            </>
          ) : !token ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>Link incompleto: aprilo direttamente dall'email o chiedine uno nuovo.</AlertDescription>
            </Alert>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nuova password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" data-testid="input-new-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="confirm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ripeti la password</FormLabel>
                      <FormControl>
                        <Input type="password" autoComplete="new-password" data-testid="input-confirm-password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full" disabled={pending} data-testid="button-set-password">
                  {pending ? "Salvataggio..." : "Imposta la password"}
                </Button>
              </form>
            </Form>
          )}
          <div className="text-center text-sm">
            <Link href="/auth" className="text-muted-foreground underline">Torna all'accesso</Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
