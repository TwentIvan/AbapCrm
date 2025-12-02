/**
 * Azure DevOps Work Item Data Extractor Bookmarklet - Version 3.2
 * 
 * Aggressive field extraction with multiple strategies
 */

export const bookmarkletCode = `
(function() {
  'use strict';
  
  function showNotification(message, isError) {
    var existing = document.getElementById('devops-extractor-notification');
    if (existing) existing.remove();
    
    var div = document.createElement('div');
    div.id = 'devops-extractor-notification';
    div.style.cssText = 'position:fixed;top:20px;right:20px;padding:16px 24px;border-radius:8px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;max-width:400px;' + 
      (isError ? 'background:#fee2e2;color:#991b1b;border:1px solid #fecaca;' : 'background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;');
    div.textContent = message;
    document.body.appendChild(div);
    
    setTimeout(function() {
      div.style.opacity = '0';
      setTimeout(function() { div.remove(); }, 300);
    }, 4000);
  }
  
  function extractWorkItemData() {
    var data = {
      extractedAt: new Date().toISOString(),
      source: 'bookmarklet',
      version: '3.2',
      url: window.location.href
    };
    
    // Extract Work Item ID from URL
    var idMatch = window.location.href.match(/_workitems\\/edit\\/(\\d+)/);
    if (idMatch) {
      data.workItemId = parseInt(idMatch[1], 10);
    }
    
    // Extract Organization and Project from URL
    var urlMatch = window.location.href.match(/dev\\.azure\\.com\\/([^\\/]+)\\/([^\\/]+)/);
    if (urlMatch) {
      data.organization = decodeURIComponent(urlMatch[1]);
      data.project = decodeURIComponent(urlMatch[2]);
    }
    
    // Try to get data from Azure DevOps internal stores
    try {
      if (window.__vssPageContext && window.__vssPageContext.webContext) {
        var wc = window.__vssPageContext.webContext;
        if (wc.project) data.project = wc.project.name;
        if (wc.collection) data.organization = wc.collection.name;
      }
    } catch(e) {}
    
    // STRATEGY 1: Find labeled field groups (label + value pairs)
    function findFieldByLabel(labels) {
      for (var i = 0; i < labels.length; i++) {
        var label = labels[i].toLowerCase();
        // Search for label elements
        var allLabels = document.querySelectorAll('label, .label, [class*="field-label"], [class*="control-label"]');
        for (var j = 0; j < allLabels.length; j++) {
          var labelEl = allLabels[j];
          if (labelEl.textContent.toLowerCase().trim() === label) {
            // Look for sibling or child input/value
            var parent = labelEl.closest('[class*="field"], [class*="control"], [class*="group"]') || labelEl.parentElement;
            if (parent) {
              var valueEl = parent.querySelector('input, select, textarea, .text, [class*="value"], [class*="combo-input"]');
              if (valueEl) {
                var val = valueEl.value || valueEl.textContent.trim();
                if (val && val.length > 0 && val.length < 200) return val;
              }
            }
          }
        }
      }
      return null;
    }
    
    // STRATEGY 2: Search by text content in the page
    function findFieldByText(fieldName) {
      var regex = new RegExp(fieldName + '[:\\\\s]*([^\\\\n]+)', 'i');
      var text = document.body.innerText;
      var match = text.match(regex);
      if (match && match[1]) return match[1].trim().substring(0, 100);
      return null;
    }
    
    // STRATEGY 3: Search in all form controls
    function scanAllControls() {
      var fields = {};
      // Scan combo boxes (dropdowns)
      document.querySelectorAll('[class*="combo"], [class*="dropdown"], [class*="picker"]').forEach(function(el) {
        var label = el.getAttribute('aria-label') || el.closest('[aria-label]')?.getAttribute('aria-label') || '';
        var value = el.querySelector('.text, input, [class*="selected"]');
        if (label && value) {
          var val = value.value || value.textContent.trim();
          if (val && val.length > 0 && val.length < 200) {
            fields[label] = val;
          }
        }
      });
      // Scan work item header for state
      document.querySelectorAll('[class*="state"], [class*="status"]').forEach(function(el) {
        var text = el.textContent.trim();
        if (text && text.length < 50 && !text.includes('\\n')) {
          if (!fields['State']) fields['State'] = text;
        }
      });
      return fields;
    }
    
    // STRATEGY 4: Extract CUSTOM FIELDS from Custom fields section
    function extractCustomFields() {
      var customFields = {};
      
      // Method 1: Find all workitemcontrol-label elements (Azure DevOps custom field labels)
      document.querySelectorAll('.workitemcontrol-label, [class*="workitemcontrol-label"]').forEach(function(labelEl) {
        var labelText = labelEl.textContent.trim();
        if (labelText && labelText.length > 0 && labelText.length < 100) {
          // Find the value - look in sibling or parent container
          var container = labelEl.closest('.work-item-form-control-wrapper, .flex-column, [class*="control-wrapper"]');
          if (container) {
            var valueEl = container.querySelector('input, textarea, select, .text, [class*="value"], [class*="combo-input"], .bolt-textfield-input');
            if (valueEl) {
              var val = valueEl.value || valueEl.textContent.trim();
              if (val && val !== labelText && val.length > 0 && val.length < 500) {
                customFields[labelText] = val;
              }
            }
          }
        }
      });
      
      // Method 2: Look in collapsible sections labeled "Custom fields"
      document.querySelectorAll('.work-item-form-collapsible-section, [class*="collapsible-section"]').forEach(function(section) {
        var header = section.querySelector('.work-item-form-collapsible-section-header, [class*="section-header"]');
        var isCustomSection = header && header.textContent.toLowerCase().includes('custom');
        
        if (isCustomSection || true) { // Scan all sections for now
          section.querySelectorAll('label, .workitemcontrol-label').forEach(function(label) {
            var labelText = label.textContent.trim();
            if (labelText && labelText.length > 1 && labelText.length < 100) {
              var wrapper = label.closest('.work-item-form-control-wrapper, .flex-column, .flex-row');
              if (wrapper) {
                var input = wrapper.querySelector('input, textarea, .bolt-textfield-input');
                if (input) {
                  var val = input.value || input.textContent.trim();
                  if (val && val !== labelText && val.length > 0) {
                    customFields[labelText] = val;
                  }
                }
              }
            }
          });
        }
      });
      
      // Method 3: Scan ALL input fields with nearby labels
      document.querySelectorAll('.work-item-form-control-wrapper').forEach(function(wrapper) {
        var label = wrapper.querySelector('label, .workitemcontrol-label');
        var input = wrapper.querySelector('input, textarea, select, .bolt-textfield-input');
        if (label && input) {
          var labelText = label.textContent.trim();
          var val = input.value || input.textContent.trim();
          if (labelText && val && val !== labelText && labelText.length < 100) {
            customFields[labelText] = val;
          }
        }
      });
      
      return customFields;
    }
    
    // Extract Title
    var titleInput = document.querySelector('.work-item-form-title input, .work-item-form-title textarea, input.work-item-title-textfield, [class*="title"] input');
    if (!titleInput) {
      var inputs = document.querySelectorAll('input[type="text"], textarea');
      for (var i = 0; i < inputs.length; i++) {
        var inp = inputs[i];
        if (inp.value && inp.value.length > 10 && inp.offsetWidth > 300) {
          titleInput = inp;
          break;
        }
      }
    }
    if (titleInput) data.title = titleInput.value || titleInput.textContent;
    
    // Extract State - multiple strategies
    var stateEl = document.querySelector('[class*="state-color"], [class*="work-item-state"], [class*="wit-state"]');
    if (stateEl) {
      var stateText = stateEl.textContent.trim();
      if (stateText && stateText.length < 30) data.state = stateText;
    }
    if (!data.state) data.state = findFieldByLabel(['State', 'Stato', 'Status']);
    
    // Extract Assigned To
    var assignedEl = document.querySelector('.identity-picker-resolved-name, [class*="assigned"] .persona-text, [class*="identity-view"] .text');
    if (assignedEl) {
      var assignedText = assignedEl.textContent.trim();
      if (assignedText && assignedText !== 'Unassigned' && assignedText !== 'Non assegnato') {
        data.assignedTo = assignedText;
      }
    }
    
    // Extract Work Item Type from header/icon
    var typeEl = document.querySelector('[class*="work-item-type"] span, [class*="wit-type"], .work-item-type-icon + span');
    if (typeEl) data.workItemType = typeEl.textContent.trim();
    if (!data.workItemType) {
      var titleTag = document.querySelector('title');
      if (titleTag && titleTag.textContent) {
        var typeMatch = titleTag.textContent.match(/^(Task|Bug|User Story|Feature|Epic|Issue|Product Backlog Item)/i);
        if (typeMatch) data.workItemType = typeMatch[1];
      }
    }
    
    // Extract common fields
    data.iterationPath = findFieldByLabel(['Iteration Path', 'Iteration', 'Sprint', 'Percorso iterazione']);
    data.areaPath = findFieldByLabel(['Area Path', 'Area', 'Percorso area']);
    
    // Extract Priority
    var priority = findFieldByLabel(['Priority', 'Priorità']);
    if (priority) data.priority = parseInt(priority, 10);
    
    // Extract Story Points / Effort
    var storyPoints = findFieldByLabel(['Story Points', 'Effort', 'Impegno', 'Punti storia', 'Original Estimate']);
    if (storyPoints) data.storyPoints = parseFloat(storyPoints);
    
    // Extract rich text fields (Description, Acceptance Criteria, Repro Steps)
    function extractRichText(fieldNames) {
      for (var i = 0; i < fieldNames.length; i++) {
        var name = fieldNames[i];
        // Look for contenteditable divs or rich text containers
        var selectors = [
          '[aria-label="' + name + '"] .rendered-markdown',
          '[aria-label="' + name + '"] .ql-editor',
          '[aria-label="' + name + '"] .html-content',
          '[data-field-name*="' + name + '"] .rendered-markdown',
          '[data-field-name*="' + name + '"] .ql-editor',
          'div[role="textbox"][aria-label*="' + name + '"]'
        ];
        for (var j = 0; j < selectors.length; j++) {
          var el = document.querySelector(selectors[j]);
          if (el && el.innerHTML && el.innerHTML.trim().length > 0) {
            return { html: el.innerHTML, text: el.textContent.trim() };
          }
        }
      }
      return null;
    }
    
    // Alternative: scan all rich text containers
    var richTextContainers = document.querySelectorAll('.rendered-markdown, .ql-editor, [contenteditable="true"], .html-field-content, .richeditor-container');
    var richTexts = [];
    richTextContainers.forEach(function(el) {
      if (el.innerHTML && el.textContent.trim().length > 5) {
        var label = '';
        var parent = el.closest('[aria-label]') || el.closest('[data-field-name]');
        if (parent) {
          label = parent.getAttribute('aria-label') || parent.getAttribute('data-field-name') || '';
        }
        richTexts.push({
          label: label,
          html: el.innerHTML,
          text: el.textContent.trim().substring(0, 200)
        });
      }
    });
    
    // Try to identify Description
    var desc = extractRichText(['Description', 'Descrizione']);
    if (desc) {
      data.descriptionHtml = desc.html;
      data.descriptionText = desc.text;
    } else if (richTexts.length > 0) {
      // Use first rich text as description
      data.descriptionHtml = richTexts[0].html;
      data.descriptionText = richTexts[0].text;
      data.descriptionLabel = richTexts[0].label;
    }
    
    // Acceptance Criteria
    var ac = extractRichText(['Acceptance Criteria', 'Criteri di accettazione']);
    if (ac) {
      data.acceptanceCriteriaHtml = ac.html;
      data.acceptanceCriteriaText = ac.text;
    }
    
    // Repro Steps (for Bugs)
    var repro = extractRichText(['Repro Steps', 'Steps to Reproduce', 'Passaggi per riprodurre']);
    if (repro) {
      data.reproStepsHtml = repro.html;
      data.reproStepsText = repro.text;
    }
    
    // Store all rich texts for debugging
    if (richTexts.length > 0) {
      data._richTextsFound = richTexts.length;
      data._richTextLabels = richTexts.map(function(r) { return r.label; }).filter(function(l) { return l; });
    }
    
    // Extract Tags
    var tags = [];
    document.querySelectorAll('.tag-item, .tag-box .tag, [class*="tag-item"]').forEach(function(el) {
      var text = el.textContent.replace(/[×✕x]/gi, '').trim();
      if (text && text.length > 0 && text.length < 50) tags.push(text);
    });
    if (tags.length > 0) data.tags = tags;
    
    // Extract all visible form fields for debugging
    var allFields = {};
    document.querySelectorAll('[aria-label]').forEach(function(el) {
      var label = el.getAttribute('aria-label');
      if (label && label.length < 50) {
        var input = el.querySelector('input, textarea, select');
        var text = el.querySelector('.text, span, .combo-input');
        var value = input ? (input.value || '') : (text ? text.textContent.trim() : '');
        if (value && value.length > 0 && value.length < 200) {
          allFields[label] = value;
        }
      }
    });
    if (Object.keys(allFields).length > 0) {
      data._allFields = allFields;
      // Try to extract specific fields from allFields
      if (!data.state && (allFields['State'] || allFields['Stato'])) {
        data.state = allFields['State'] || allFields['Stato'];
      }
      if (!data.priority && (allFields['Priority'] || allFields['Priorità'])) {
        data.priority = parseInt(allFields['Priority'] || allFields['Priorità'], 10);
      }
      if (!data.storyPoints) {
        var effort = allFields['Effort'] || allFields['Story Points'] || allFields['Impegno'] || allFields['Original Estimate'] || allFields['Remaining Work'];
        if (effort) data.effort = parseFloat(effort);
      }
      if (!data.iterationPath && allFields['Iteration Path']) {
        data.iterationPath = allFields['Iteration Path'];
      }
      if (!data.areaPath && allFields['Area Path']) {
        data.areaPath = allFields['Area Path'];
      }
      if (allFields['Activity']) data.activity = allFields['Activity'];
      if (allFields['Reason']) data.reason = allFields['Reason'];
      if (allFields['Severity'] || allFields['Gravità']) data.severity = allFields['Severity'] || allFields['Gravità'];
    }
    
    // Extract CUSTOM FIELDS (Codice_Ticket, WBS, etc.)
    var customFields = extractCustomFields();
    console.log('[DevOps v3.3] Custom fields found:', customFields);
    if (Object.keys(customFields).length > 0) {
      data.customFields = customFields;
      // Map known custom fields to specific properties
      if (customFields['Codice_Ticket'] || customFields['codice_ticket'] || customFields['Ticket']) {
        data.ticketCode = customFields['Codice_Ticket'] || customFields['codice_ticket'] || customFields['Ticket'];
      }
      if (customFields['WBS'] || customFields['wbs'] || customFields['Codice WBS'] || customFields['WBE']) {
        data.wbsCode = customFields['WBS'] || customFields['wbs'] || customFields['Codice WBS'] || customFields['WBE'];
      }
    }
    
    // Extract Comments/Discussion - try multiple approaches
    var comments = [];
    
    // Approach 0: AGGRESSIVE - Find the Discussion tab content area
    var discussionTab = document.querySelector('[role="tabpanel"][aria-label*="Discussion"], [role="tabpanel"][aria-label*="discussion"], [data-content="discussion"]');
    if (!discussionTab) {
      // Try to find by looking for tab panels
      document.querySelectorAll('[role="tabpanel"]').forEach(function(panel) {
        var content = panel.textContent.toLowerCase();
        if (content.includes('added a comment') || content.includes('aggiunto un commento') || panel.querySelector('.discussion-messages')) {
          discussionTab = panel;
        }
      });
    }
    console.log('[DevOps v3.3] Discussion tab panel:', discussionTab);
    
    // Approach 1: Look for discussion container with many selectors
    var discussionSelectors = [
      '.discussion-messages-container',
      '.wit-discussion-control', 
      '[class*="discussion-control"]',
      '.work-item-discussion',
      '.discussion-messages',
      '[class*="comments-section"]',
      '[class*="discussion-section"]',
      '.discussion-container'
    ];
    var discussionContainer = null;
    for (var ds = 0; ds < discussionSelectors.length; ds++) {
      discussionContainer = document.querySelector(discussionSelectors[ds]);
      if (discussionContainer) break;
    }
    console.log('[DevOps v3.3] Discussion container:', discussionContainer);
    
    // Use discussion tab if container not found
    var searchArea = discussionContainer || discussionTab || document;
    
    // Message selectors to try
    var messageSelectors = [
      '.discussion-message',
      '.message-list-item', 
      '[class*="comment-item"]',
      '[class*="discussion-message"]',
      '[class*="activity-message"]',
      '.comment-content',
      '.wit-comment'
    ];
    
    messageSelectors.forEach(function(sel) {
      if (comments.length > 0) return; // Stop if we found comments
      searchArea.querySelectorAll(sel).forEach(function(el) {
        var content = el.querySelector('.message-content, .comment-content, .rendered-markdown, .message-body, [class*="message-text"], p');
        var author = el.querySelector('.identity-picker-resolved-name, .persona-text, [class*="author-name"], [class*="display-name"], [class*="persona"]');
        var date = el.querySelector('time, [class*="timestamp"], [datetime], [class*="date"]');
        
        // If no content element found, use the element itself
        if (!content) content = el;
        
        var text = content.textContent.trim();
        if (text.length > 5 && text.length < 5000) {
          // Filter out system/field change messages
          var isSystemMsg = text.startsWith('changed') || text.startsWith('Created') || 
                           text.includes('field from') || text.includes('to the value') ||
                           text.match(/^\\w+ changed/);
          if (!isSystemMsg) {
            comments.push({
              author: author ? author.textContent.trim() : '',
              content: text,
              contentHtml: content.innerHTML || text,
              date: date ? (date.getAttribute('datetime') || date.textContent.trim()) : null
            });
          }
        }
      });
    });
    
    // Approach 2: Very aggressive - look for any rendered markdown in discussion area
    if (comments.length === 0 && searchArea !== document) {
      searchArea.querySelectorAll('.rendered-markdown').forEach(function(el) {
        var text = el.textContent.trim();
        if (text.length > 10 && text.length < 5000) {
          var parent = el.closest('[class*="message"], [class*="comment"], [class*="item"]');
          var author = parent ? parent.querySelector('[class*="persona"], [class*="identity"], [class*="author"]') : null;
          comments.push({
            author: author ? author.textContent.trim() : '',
            content: text,
            contentHtml: el.innerHTML
          });
        }
      });
    }
    
    console.log('[DevOps v3.3] Comments found:', comments.length);
    if (comments.length > 0) {
      console.log('[DevOps v3.3] Sample comment:', comments[0]);
      data.comments = comments;
    }
    
    // Extract Attachments
    var attachments = [];
    document.querySelectorAll('.attachment-item, .attachment-link, [class*="attachment"]').forEach(function(el) {
      var link = el.querySelector('a[href]') || (el.tagName === 'A' ? el : null);
      var name = el.querySelector('.attachment-name, .file-name') || link;
      
      if (name && name.textContent.trim()) {
        attachments.push({
          name: name.textContent.trim(),
          url: link ? link.href : null
        });
      }
    });
    if (attachments.length > 0) data.attachments = attachments;
    
    // Count extracted fields
    var fieldCount = Object.keys(data).filter(function(k) {
      if (k.startsWith('_')) return false;
      var v = data[k];
      return v !== null && v !== undefined && v !== '';
    }).length;
    data._fieldCount = fieldCount;
    
    // Debug: log all found elements
    console.log('[DevOps v3.3] Rich texts found:', richTexts.length);
    console.log('[DevOps v3.3] All aria-labels:', Object.keys(allFields));
    
    return data;
  }
  
  try {
    var data = extractWorkItemData();
    
    if (!data.workItemId) {
      showNotification('Work Item ID non trovato. Sei sulla pagina di un Work Item?', true);
      return;
    }
    
    var json = JSON.stringify(data, null, 2);
    
    function copyToClipboard(text) {
      // Try modern API first
      if (navigator.clipboard && document.hasFocus()) {
        return navigator.clipboard.writeText(text);
      }
      // Fallback: create textarea and use execCommand
      return new Promise(function(resolve, reject) {
        var textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:none;outline:none;boxShadow:none;background:transparent;';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        try {
          var ok = document.execCommand('copy');
          textarea.remove();
          if (ok) resolve(); else reject(new Error('execCommand failed'));
        } catch(e) {
          textarea.remove();
          reject(e);
        }
      });
    }
    
    copyToClipboard(json).then(function() {
      var msg = '✓ Work Item #' + data.workItemId + ' copiato! (' + data._fieldCount + ' campi';
      if (data.comments && data.comments.length) msg += ', ' + data.comments.length + ' commenti';
      if (data.attachments && data.attachments.length) msg += ', ' + data.attachments.length + ' allegati';
      if (data._richTextsFound) msg += ', ' + data._richTextsFound + ' testi formattati';
      msg += ')';
      showNotification(msg, false);
      console.log('[DevOps Extractor v3] Dati estratti:', data);
    }).catch(function(err) {
      // Show modal with copyable JSON as last resort
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;';
      modal.innerHTML = '<div style="background:white;padding:20px;border-radius:8px;max-width:600px;max-height:80vh;overflow:auto;"><h3 style="margin:0 0 10px">Copia manualmente (Cmd+C / Ctrl+C)</h3><textarea id="devops-json" style="width:100%;height:300px;font-family:monospace;font-size:12px;">' + json.replace(/</g,'&lt;') + '</textarea><button onclick="this.parentElement.parentElement.remove()" style="margin-top:10px;padding:8px 16px;cursor:pointer;">Chiudi</button></div>';
      document.body.appendChild(modal);
      var ta = document.getElementById('devops-json');
      ta.focus();
      ta.select();
      console.log('[DevOps Extractor v3] Dati estratti:', data);
    });
  } catch (err) {
    showNotification('Errore: ' + err.message, true);
    console.error('[DevOps Extractor v3] Error:', err);
  }
})();
`;

export function generateBookmarkletUrl(): string {
  const minified = bookmarkletCode
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\n\s*/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
  
  return `javascript:${encodeURIComponent(minified)}`;
}

export interface DevOpsWorkItemData {
  extractedAt: string;
  source: 'bookmarklet';
  version?: string;
  url: string;
  workItemId?: number;
  workItemType?: string;
  title?: string;
  state?: string;
  assignedTo?: string;
  priority?: number;
  descriptionHtml?: string;
  descriptionText?: string;
  descriptionLabel?: string;
  acceptanceCriteriaHtml?: string;
  acceptanceCriteriaText?: string;
  reproStepsHtml?: string;
  reproStepsText?: string;
  iterationPath?: string;
  areaPath?: string;
  tags?: string[];
  organization?: string;
  project?: string;
  storyPoints?: number;
  comments?: Array<{ author: string; content: string; contentHtml?: string; date?: string }>;
  attachments?: Array<{ name: string; url?: string }>;
  _fieldCount?: number;
  _richTextsFound?: number;
  _richTextLabels?: string[];
}

export function validateDevOpsData(jsonString: string): { valid: boolean; data?: DevOpsWorkItemData; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    if (!data.workItemId) {
      return { valid: false, error: 'Dati non validi: manca workItemId' };
    }
    if (data.source !== 'bookmarklet') {
      return { valid: false, error: 'Dati non provenienti dal bookmarklet' };
    }
    return { valid: true, data: data as DevOpsWorkItemData };
  } catch (e) {
    return { valid: false, error: 'JSON non valido: ' + (e instanceof Error ? e.message : String(e)) };
  }
}
