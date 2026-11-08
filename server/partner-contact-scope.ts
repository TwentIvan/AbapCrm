// Regole per partner e contatti scritti con un token API (es. Botcave con il token di servizio `thu_…`).
// Con un token l'ereditarietà dell'organizzazione dal padre è spenta: il perimetro è quello di
// `getOrganizationIdsForFilter(req)` (organizzazione del token, oppure tutte quelle dell'utente con
// X-Organization-Scope: all). La sessione della console non passa da qui.

// Campi che un token non può riscrivere aggiornando un partner.
const PARTNER_PROTECTED_FIELDS = new Set(["id", "userId", "organizationId", "createdAt", "updatedAt"]);

/** Corpo dell'aggiornamento di un partner da token, senza i campi protetti; null se non è un oggetto o resta vuoto. */
export function sanitizeTokenPartnerUpdate(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!PARTNER_PROTECTED_FIELDS.has(key)) clean[key] = value;
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

/**
 * Organizzazione in cui aggiornare un partner: quella del partner (dell'utente del token) se sta nel perimetro
 * della richiesta, altrimenti null (partner inesistente, di un altro utente o fuori perimetro).
 */
export async function tokenPartnerOrganization(
  deps: { ownedPartnerOrg(partnerId: string, userId: string): Promise<string | null> },
  input: { partnerId: string; userId: string; organizationIds: string[] },
): Promise<string | null> {
  const org = await deps.ownedPartnerOrg(input.partnerId, input.userId);
  return org && input.organizationIds.includes(org) ? org : null;
}

/**
 * Organizzazione di un contatto creato da token: senza partner quella della richiesta; con un partner quella
 * del partner, purché stia nel perimetro. Null se il partner non esiste, è fuori perimetro o l'id non è una stringa.
 */
export async function tokenContactOrganization(
  deps: { partnerOrg(partnerId: string): Promise<string | null> },
  input: { partnerId: unknown; organizationId: string; organizationIds: string[] },
): Promise<string | null> {
  if (input.partnerId === undefined || input.partnerId === null || input.partnerId === "") return input.organizationId;
  if (typeof input.partnerId !== "string") return null;
  const org = await deps.partnerOrg(input.partnerId);
  return org && input.organizationIds.includes(org) ? org : null;
}
