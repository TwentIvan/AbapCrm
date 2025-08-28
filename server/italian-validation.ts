// Servizio per validazione codice fiscale e partita IVA italiana

export class ItalianValidationService {
  /**
   * Valida un codice fiscale italiano
   */
  static validateFiscalCode(fiscalCode: string): { valid: boolean; error?: string } {
    if (!fiscalCode) return { valid: true }; // Campo opzionale
    
    const cf = fiscalCode.toUpperCase().trim();
    
    // Lunghezza
    if (cf.length !== 16) {
      return { valid: false, error: 'Il codice fiscale deve essere di 16 caratteri' };
    }
    
    // Pattern generale: 6 lettere + 2 numeri + 1 lettera + 2 numeri + 1 lettera + 3 caratteri + 1 lettera
    const pattern = /^[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]$/;
    if (!pattern.test(cf)) {
      return { valid: false, error: 'Formato codice fiscale non valido' };
    }
    
    // Controllo carattere di controllo (algoritmo semplificato)
    try {
      const odd = [1, 0, 5, 7, 9, 13, 15, 17, 19, 21, 2, 4, 18, 20, 11, 3, 6, 8, 12, 14, 16, 10, 22, 25, 24, 23];
      const even = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25];
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
      
      let sum = 0;
      
      for (let i = 0; i < 15; i++) {
        const char = cf.charAt(i);
        const value = /[0-9]/.test(char) ? parseInt(char) : chars.indexOf(char);
        sum += i % 2 === 0 ? odd[value] : even[value];
      }
      
      const expectedCheck = chars.charAt(sum % 26);
      const actualCheck = cf.charAt(15);
      
      if (expectedCheck !== actualCheck) {
        return { valid: false, error: 'Codice fiscale non valido (controllo fallito)' };
      }
    } catch (error) {
      return { valid: false, error: 'Errore nella validazione del codice fiscale' };
    }
    
    return { valid: true };
  }
  
  /**
   * Valida una partita IVA italiana
   */
  static validateVatNumber(vatNumber: string): { valid: boolean; error?: string } {
    if (!vatNumber) return { valid: true }; // Campo opzionale
    
    const vat = vatNumber.replace(/\s/g, '').toUpperCase();
    
    // Rimuovi IT se presente
    const cleanVat = vat.startsWith('IT') ? vat.substring(2) : vat;
    
    // Deve essere di 11 cifre
    if (!/^[0-9]{11}$/.test(cleanVat)) {
      return { valid: false, error: 'La partita IVA deve essere di 11 cifre' };
    }
    
    // Controllo algoritmo partita IVA italiana
    try {
      let sum = 0;
      
      for (let i = 0; i < 10; i++) {
        let digit = parseInt(cleanVat.charAt(i));
        
        if (i % 2 === 1) { // Posizioni pari (1, 3, 5, 7, 9)
          digit *= 2;
          if (digit > 9) {
            digit = Math.floor(digit / 10) + (digit % 10);
          }
        }
        
        sum += digit;
      }
      
      const checkDigit = (10 - (sum % 10)) % 10;
      const expectedCheck = parseInt(cleanVat.charAt(10));
      
      if (checkDigit !== expectedCheck) {
        return { valid: false, error: 'Partita IVA non valida (controllo fallito)' };
      }
    } catch (error) {
      return { valid: false, error: 'Errore nella validazione della partita IVA' };
    }
    
    return { valid: true };
  }
  
  /**
   * Formatta un codice fiscale
   */
  static formatFiscalCode(fiscalCode: string): string {
    return fiscalCode.toUpperCase().trim();
  }
  
  /**
   * Formatta una partita IVA
   */
  static formatVatNumber(vatNumber: string): string {
    const clean = vatNumber.replace(/\s/g, '').toUpperCase();
    const withoutIT = clean.startsWith('IT') ? clean.substring(2) : clean;
    return withoutIT.length === 11 ? `IT${withoutIT}` : withoutIT;
  }
}