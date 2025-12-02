/**
 * Azure DevOps Work Item Data Extractor Bookmarklet - Enhanced Version 3.0
 * 
 * Uses Azure DevOps internal data stores for reliable extraction
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
      version: '3.0',
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
      // Method 1: Look for __vssPageContext
      if (window.__vssPageContext && window.__vssPageContext.webContext) {
        var wc = window.__vssPageContext.webContext;
        if (wc.project) data.project = wc.project.name;
        if (wc.collection) data.organization = wc.collection.name;
      }
    } catch(e) { console.log('[DevOps Extractor] vssPageContext error:', e); }
    
    // Method 2: Scan all inputs, textareas and contenteditable elements
    function getFieldValue(fieldNames) {
      for (var i = 0; i < fieldNames.length; i++) {
        var name = fieldNames[i];
        // Try aria-label
        var el = document.querySelector('[aria-label="' + name + '"] input, [aria-label="' + name + '"] textarea');
        if (el && (el.value || el.textContent)) return el.value || el.textContent.trim();
        
        // Try data attributes
        el = document.querySelector('[data-field-name="' + name + '"] input, [data-field-name="' + name + '"] textarea');
        if (el && (el.value || el.textContent)) return el.value || el.textContent.trim();
        
        // Try placeholder or title
        el = document.querySelector('input[placeholder*="' + name + '"], input[title*="' + name + '"]');
        if (el && el.value) return el.value;
      }
      return null;
    }
    
    // Extract Title - look for the main title input (usually the largest text input at top)
    var titleInput = document.querySelector('.work-item-form-title input, .work-item-form-title textarea, input.work-item-title-textfield');
    if (!titleInput) {
      // Fallback: find large text input near top
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
    
    // Extract State
    data.state = getFieldValue(['State', 'Stato']);
    if (!data.state) {
      var stateEl = document.querySelector('.work-item-form-state .text, .work-item-state-color + span, [class*="state-value"]');
      if (stateEl) data.state = stateEl.textContent.trim();
    }
    
    // Extract Assigned To
    var assignedEl = document.querySelector('.identity-picker-resolved-name, .work-item-form-assignedTo .text, [class*="assigned-to"] .identity-picker-resolved-name');
    if (assignedEl) {
      var assignedText = assignedEl.textContent.trim();
      if (assignedText && assignedText !== 'Unassigned' && assignedText !== 'Non assegnato') {
        data.assignedTo = assignedText;
      }
    }
    
    // Extract Work Item Type
    var typeEl = document.querySelector('.work-item-type-icon + span, .work-item-type-icon-host + span, [class*="workitem-type"]');
    if (typeEl) data.workItemType = typeEl.textContent.trim();
    if (!data.workItemType) {
      // Try from page title or breadcrumb
      var titleTag = document.querySelector('title');
      if (titleTag && titleTag.textContent) {
        var typeMatch = titleTag.textContent.match(/^(Task|Bug|User Story|Feature|Epic|Issue|Product Backlog Item)/i);
        if (typeMatch) data.workItemType = typeMatch[1];
      }
    }
    
    // Extract Iteration Path
    data.iterationPath = getFieldValue(['Iteration Path', 'Iteration', 'Sprint', 'Percorso iterazione']);
    
    // Extract Area Path  
    data.areaPath = getFieldValue(['Area Path', 'Area', 'Percorso area']);
    
    // Extract Priority
    var priority = getFieldValue(['Priority', 'Priorità']);
    if (priority) data.priority = parseInt(priority, 10);
    
    // Extract Story Points / Effort
    var storyPoints = getFieldValue(['Story Points', 'Effort', 'Impegno', 'Punti storia']);
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
    
    // Extract Comments/Discussion - try multiple approaches
    var comments = [];
    
    // Approach 1: Look for discussion container
    var discussionContainer = document.querySelector('.discussion-messages-container, .wit-discussion-control, [class*="discussion-control"], .work-item-discussion');
    if (discussionContainer) {
      discussionContainer.querySelectorAll('.discussion-message, .message-list-item, [class*="comment-item"], [class*="discussion-message"]').forEach(function(el) {
        var content = el.querySelector('.message-content, .comment-content, .rendered-markdown, .message-body, [class*="message-text"]');
        var author = el.querySelector('.identity-picker-resolved-name, .persona-text, [class*="author-name"], [class*="display-name"]');
        var date = el.querySelector('time, [class*="timestamp"], [datetime]');
        
        if (content && content.textContent.trim().length > 0) {
          comments.push({
            author: author ? author.textContent.trim() : 'Unknown',
            content: content.textContent.trim(),
            contentHtml: content.innerHTML,
            date: date ? (date.getAttribute('datetime') || date.textContent.trim()) : null
          });
        }
      });
    }
    
    // Approach 2: Fallback - look for any message-like elements
    if (comments.length === 0) {
      document.querySelectorAll('[class*="message-item"], [class*="activity-item"], [class*="history-item"]').forEach(function(el) {
        var content = el.querySelector('.message-content, .rendered-markdown, [class*="content"]');
        var author = el.querySelector('.identity-picker-resolved-name, [class*="author"]');
        
        if (content && content.textContent.trim().length > 10) {
          var text = content.textContent.trim();
          // Filter out system messages
          if (!text.startsWith('changed') && !text.startsWith('Created') && !text.includes('field from')) {
            comments.push({
              author: author ? author.textContent.trim() : 'Unknown',
              content: text,
              contentHtml: content.innerHTML
            });
          }
        }
      });
    }
    
    // Log for debugging
    console.log('[DevOps Extractor v3] Discussion container:', discussionContainer);
    console.log('[DevOps Extractor v3] Comments found:', comments.length);
    console.log('[DevOps Extractor v3] All form fields:', allFields);
    
    if (comments.length > 0) data.comments = comments;
    
    // Legacy approach for backwards compatibility
    if (comments.length === 0) {
      document.querySelectorAll('.discussion-message, .comment-item, [class*="discussion-item"], [class*="comment-content"]').forEach(function(el) {
        var content = el.querySelector('.message-content, .comment-content, .rendered-markdown, [class*="message-body"]');
        var author = el.querySelector('.identity-picker-resolved-name, [class*="author"], [class*="persona-text"]');
        var date = el.querySelector('time, [class*="timestamp"], [class*="date"]');
        
        if (content && content.textContent.trim()) {
          comments.push({
            author: author ? author.textContent.trim() : 'Unknown',
            content: content.textContent.trim(),
            contentHtml: content.innerHTML,
            date: date ? (date.getAttribute('datetime') || date.textContent.trim()) : null
          });
        }
      });
      if (comments.length > 0) data.comments = comments;
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
    console.log('[DevOps Extractor v3] Rich texts found:', richTexts);
    console.log('[DevOps Extractor v3] All inputs:', Array.from(document.querySelectorAll('input')).map(function(i) { 
      return { aria: i.getAttribute('aria-label'), value: i.value ? i.value.substring(0,50) : '' }; 
    }).filter(function(i) { return i.value; }));
    
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
