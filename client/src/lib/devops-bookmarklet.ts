/**
 * Azure DevOps Work Item Data Extractor Bookmarklet
 * 
 * This bookmarklet extracts work item data from Azure DevOps pages
 * and copies it to the clipboard in JSON format for import into the CRM.
 * 
 * Usage:
 * 1. Create a new bookmark in your browser
 * 2. Set the URL to the generated bookmarklet code
 * 3. Navigate to a Work Item page in Azure DevOps
 * 4. Click the bookmark to extract and copy data
 * 5. Paste the JSON into the CRM Work Items dialog
 */

/**
 * The actual bookmarklet code that runs on the Azure DevOps page.
 * This is a self-contained function that extracts all work item data.
 */
export const bookmarkletCode = `
(function() {
  'use strict';
  
  function showNotification(message, isError) {
    var existing = document.getElementById('devops-extractor-notification');
    if (existing) existing.remove();
    
    var div = document.createElement('div');
    div.id = 'devops-extractor-notification';
    div.style.cssText = 'position:fixed;top:20px;right:20px;padding:16px 24px;border-radius:8px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;' + 
      (isError ? 'background:#fee2e2;color:#991b1b;border:1px solid #fecaca;' : 'background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;');
    div.textContent = message;
    document.body.appendChild(div);
    
    setTimeout(function() {
      div.style.opacity = '0';
      setTimeout(function() { div.remove(); }, 300);
    }, 3000);
  }
  
  function getTextContent(selector) {
    var el = document.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }
  
  function getInputValue(selector) {
    var el = document.querySelector(selector);
    return el ? (el.value || el.textContent || '').trim() : null;
  }
  
  function extractWorkItemData() {
    var data = {
      extractedAt: new Date().toISOString(),
      source: 'bookmarklet',
      url: window.location.href
    };
    
    // Extract Work Item ID from URL or page
    var idMatch = window.location.href.match(/_workitems\\/edit\\/(\\d+)/);
    if (idMatch) {
      data.workItemId = parseInt(idMatch[1], 10);
    } else {
      var idEl = document.querySelector('.work-item-form-id, .workitem-info-bar-id .id');
      if (idEl) data.workItemId = parseInt(idEl.textContent.replace('#', ''), 10);
    }
    
    // Extract Work Item Type
    var typeEl = document.querySelector('.work-item-type-icon-control, .work-item-type-name, [aria-label*="Work item type"]');
    if (typeEl) {
      data.workItemType = typeEl.getAttribute('aria-label') || typeEl.title || typeEl.textContent.trim();
    }
    // Fallback: check the type dropdown
    if (!data.workItemType) {
      var typeDropdown = document.querySelector('.work-item-type-dropdown');
      if (typeDropdown) data.workItemType = typeDropdown.textContent.trim();
    }
    
    // Extract Title
    var titleEl = document.querySelector('.work-item-form-title input, #witc_1_txt, [aria-label="Title"]');
    if (titleEl) {
      data.title = titleEl.value || titleEl.textContent.trim();
    } else {
      var titleContainer = document.querySelector('.work-item-form-title');
      if (titleContainer) data.title = titleContainer.textContent.trim();
    }
    
    // Extract State
    var stateEl = document.querySelector('.work-item-state-dropdown, [aria-label="State"]');
    if (stateEl) {
      data.state = stateEl.textContent.trim() || stateEl.value;
    }
    
    // Extract Assigned To
    var assignedEl = document.querySelector('[aria-label="Assigned To"] .identity-picker-resolved-name, .workitem-identity-persona-name, .identity-picker-display-name');
    if (assignedEl) {
      data.assignedTo = assignedEl.textContent.trim();
    }
    
    // Extract Priority (usually 1-4)
    var priorityFields = document.querySelectorAll('.control-combo');
    priorityFields.forEach(function(field) {
      var label = field.closest('.workitem-control')?.querySelector('label');
      if (label && label.textContent.toLowerCase().includes('priority')) {
        var input = field.querySelector('input');
        if (input) data.priority = parseInt(input.value, 10);
      }
    });
    
    // Fallback priority from dropdown
    if (!data.priority) {
      var priorityDropdown = document.querySelector('[aria-label="Priority"] input, [data-field-name="Priority"] input');
      if (priorityDropdown) data.priority = parseInt(priorityDropdown.value, 10);
    }
    
    // Extract Description (HTML content)
    var descEl = document.querySelector('.wit-html-field-content, [data-field-name="Description"] .richeditor-container, .work-item-html-field');
    if (descEl) {
      data.description = descEl.innerHTML;
      data.descriptionText = descEl.textContent.trim();
    }
    
    // Extract Iteration Path
    var iterationEl = document.querySelector('[aria-label="Iteration Path"] input, [data-field-name="IterationPath"] input');
    if (iterationEl) {
      data.iterationPath = iterationEl.value;
    }
    
    // Extract Area Path
    var areaEl = document.querySelector('[aria-label="Area Path"] input, [data-field-name="AreaPath"] input');
    if (areaEl) {
      data.areaPath = areaEl.value;
    }
    
    // Extract Tags
    var tagsContainer = document.querySelector('.tag-items-container');
    if (tagsContainer) {
      var tags = Array.from(tagsContainer.querySelectorAll('.tag-item')).map(function(t) {
        return t.textContent.trim();
      });
      if (tags.length) data.tags = tags;
    }
    
    // Extract Organization and Project from URL
    var urlMatch = window.location.href.match(/dev\\.azure\\.com\\/([^\\/]+)\\/([^\\/]+)/);
    if (urlMatch) {
      data.organization = urlMatch[1];
      data.project = urlMatch[2];
    } else {
      // Alternative URL format: org.visualstudio.com/project
      var altMatch = window.location.href.match(/([^\\/]+)\\.visualstudio\\.com\\/([^\\/]+)/);
      if (altMatch) {
        data.organization = altMatch[1];
        data.project = altMatch[2];
      }
    }
    
    // Extract Sprint/Iteration info if available
    var sprintEl = document.querySelector('[data-field-name="Sprint"], .iteration-path-display');
    if (sprintEl) {
      data.sprint = sprintEl.textContent.trim();
    }
    
    // Extract Story Points or Effort
    var effortFields = ['Story Points', 'Effort', 'Size', 'Original Estimate'];
    effortFields.forEach(function(fieldName) {
      var fieldEl = document.querySelector('[data-field-name="' + fieldName.replace(' ', '') + '"] input');
      if (fieldEl && fieldEl.value) {
        data[fieldName.toLowerCase().replace(' ', '')] = parseFloat(fieldEl.value);
      }
    });
    
    // Extract Created/Modified dates if visible
    var historySection = document.querySelector('.work-item-form-header-controls-container');
    if (historySection) {
      var dateMatch = historySection.textContent.match(/Created\\s+(.+?)\\s*(?:\\||$)/);
      if (dateMatch) data.createdDate = dateMatch[1].trim();
    }
    
    return data;
  }
  
  // Execute extraction
  try {
    var data = extractWorkItemData();
    
    if (!data.workItemId) {
      showNotification('Impossibile trovare Work Item ID. Assicurati di essere sulla pagina di un Work Item.', true);
      return;
    }
    
    var json = JSON.stringify(data, null, 2);
    
    navigator.clipboard.writeText(json).then(function() {
      showNotification('✓ Dati Work Item #' + data.workItemId + ' copiati negli appunti!', false);
      console.log('[DevOps Extractor] Dati estratti:', data);
    }).catch(function(err) {
      // Fallback for older browsers
      var textarea = document.createElement('textarea');
      textarea.value = json;
      textarea.style.cssText = 'position:fixed;left:-9999px;';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showNotification('✓ Dati Work Item #' + data.workItemId + ' copiati negli appunti!', false);
      } catch (e) {
        showNotification('Errore durante la copia. Controlla la console per i dati.', true);
      }
      textarea.remove();
    });
  } catch (err) {
    showNotification('Errore durante l\\'estrazione: ' + err.message, true);
    console.error('[DevOps Extractor] Errore:', err);
  }
})();
`;

/**
 * Generates the complete bookmarklet URL that can be dragged to bookmarks bar
 */
export function generateBookmarkletUrl(): string {
  // Minify and encode the bookmarklet code
  const minified = bookmarkletCode
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\/\/.*$/gm, '') // Remove line comments
    .replace(/\n\s*/g, '') // Remove newlines and leading whitespace
    .replace(/\s{2,}/g, ' ') // Collapse multiple spaces
    .trim();
  
  return `javascript:${encodeURIComponent(minified)}`;
}

/**
 * Generates HTML instruction for the bookmarklet installation
 */
export function getBookmarkletHtml(): string {
  const url = generateBookmarkletUrl();
  return `<a href="${url}" 
    style="display:inline-block;padding:10px 20px;background:#0078D4;color:white;text-decoration:none;border-radius:4px;font-weight:500;"
    onclick="return false;"
    draggable="true"
    title="Trascina questo link nella barra dei preferiti">
    📋 Estrai Work Item DevOps
  </a>`;
}

/**
 * Interface for the extracted work item data
 */
export interface DevOpsWorkItemData {
  extractedAt: string;
  source: 'bookmarklet';
  url: string;
  workItemId?: number;
  workItemType?: string;
  title?: string;
  state?: string;
  assignedTo?: string;
  priority?: number;
  description?: string;
  descriptionText?: string;
  iterationPath?: string;
  areaPath?: string;
  tags?: string[];
  organization?: string;
  project?: string;
  sprint?: string;
  storypoints?: number;
  effort?: number;
  createdDate?: string;
}

/**
 * Validates that the pasted JSON is valid DevOps work item data
 */
export function validateDevOpsData(jsonString: string): { valid: boolean; data?: DevOpsWorkItemData; error?: string } {
  try {
    const data = JSON.parse(jsonString);
    
    // Check required fields
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
