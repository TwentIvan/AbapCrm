# Patch UI — mostrare i server MCP (e il resto di aiSpec) nella proposta

File: `client/src/pages/proposals-page.tsx`
La card dei task non rende `task.aiSpec`, quindi le proposte MCP (e obiettivo, criteri,
complessità, domande aperte) restano invisibili. `Badge` è già importato in questa pagina.

## INSERT — dentro il `proposalData.tasks.map(...)`, subito dopo la riga dei badge

CERCA:
```jsx
                        <div className="flex gap-2 mt-1 text-xs">
                          <Badge variant="outline">{task.priority}</Badge>
                          <Badge variant="outline">{task.taskType}</Badge>
                          {task.estimatedEffort && <Badge variant="outline">{task.estimatedEffort}h</Badge>}
                        </div>
```

INSERISCI SUBITO DOPO il `</div>` di chiusura di quel blocco:
```jsx
                        {task.aiSpec && (
                          <div className="mt-2 space-y-1 text-xs">
                            {task.aiSpec.objective && (
                              <div>
                                <span className="text-muted-foreground">Obiettivo:</span> {task.aiSpec.objective}
                              </div>
                            )}
                            {task.aiSpec.complexity && (
                              <Badge variant="outline">Complessità {task.aiSpec.complexity}</Badge>
                            )}

                            {/* Server MCP proposti (con fallback alle categorie) */}
                            {task.aiSpec.proposedMcpConfigs?.length > 0 ? (
                              <div>
                                <span className="text-muted-foreground">Server MCP proposti:</span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {task.aiSpec.proposedMcpConfigs.map((m: any, i: number) => (
                                    <Badge key={i} variant="secondary" title={m.reason}>
                                      {m.name}
                                      {m.category ? ` · ${m.category}` : ""}
                                      {m.write ? " · write" : " · read"}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            ) : task.aiSpec.requiredMcpCategories?.length > 0 ? (
                              <div>
                                <span className="text-muted-foreground">Categorie MCP:</span>{" "}
                                {task.aiSpec.requiredMcpCategories.join(", ")}
                              </div>
                            ) : (
                              <div className="text-muted-foreground italic">Nessun server MCP proposto</div>
                            )}

                            {task.aiSpec.acceptanceCriteria?.length > 0 && (
                              <div>
                                <span className="text-muted-foreground">Criteri di accettazione:</span>
                                <ul className="list-disc ml-4">
                                  {task.aiSpec.acceptanceCriteria.map((c: string, i: number) => (
                                    <li key={i}>{c}</li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {task.aiSpec.openQuestions?.length > 0 && (
                              <div className="text-amber-600">
                                Domande aperte: {task.aiSpec.openQuestions.join(" · ")}
                              </div>
                            )}
                          </div>
                        )}
```

## Nota 1 — se dopo la patch i server restano vuoti
Allora non è la UI: l'array è legittimamente vuoto perché **l'org non ha nessun
`mcp_server_config` validato**. L'agente attacca solo server con `VALIDATED=SI`. Verifica in
Libreria MCP che ci sia almeno un server validato per l'organizzazione; altrimenti la
proposta corretta è proprio "nessun server" + una domanda aperta del tipo "manca un server
MCP capace di X".

## Nota 2 — non solo i task
Anche i nuovi campi a livello di proposta NON sono renderizzati: `proposalData.systems`,
`proposalData.connections`, e `proposalData.needsClarification` / `clarificationQuestions`.
Se vuoi visibilità completa in fase di proposta, aggiungi una Card "Sistemi", una Card
"Connessioni" e un banner per le domande di chiarimento, sullo stesso modello delle card
esistenti (Partner, Contatti, Progetto, Task). Posso prepararti anche quelle.
