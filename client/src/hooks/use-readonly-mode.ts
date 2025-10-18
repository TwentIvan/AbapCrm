import { useState, useEffect } from "react";
import { useLocation, useSearch } from "wouter";

/**
 * Hook per gestire la modalità di visualizzazione read-only nei form
 * Legge il parametro URL ?readonly=true e fornisce funzioni per il toggle
 */
export function useReadOnlyMode() {
  const search = useSearch();
  const [location, setLocation] = useLocation();
  
  // Leggi il parametro readonly dall'URL
  const urlParams = new URLSearchParams(search);
  const isReadOnlyFromUrl = urlParams.get("readonly") === "true";
  
  const [isReadOnly, setIsReadOnly] = useState(isReadOnlyFromUrl);
  
  // Sincronizza con l'URL quando cambia
  useEffect(() => {
    setIsReadOnly(isReadOnlyFromUrl);
  }, [isReadOnlyFromUrl]);
  
  // Funzione per attivare la modalità di modifica
  const enableEdit = () => {
    const params = new URLSearchParams(search);
    params.delete("readonly");
    const newSearch = params.toString();
    const newUrl = location.split('?')[0] + (newSearch ? `?${newSearch}` : '');
    setLocation(newUrl);
  };
  
  // Funzione per tornare alla modalità di visualizzazione
  const disableEdit = () => {
    const params = new URLSearchParams(search);
    params.set("readonly", "true");
    const newUrl = location.split('?')[0] + `?${params.toString()}`;
    setLocation(newUrl);
  };
  
  return {
    isReadOnly,
    enableEdit,
    disableEdit,
  };
}
