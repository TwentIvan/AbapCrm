/**
 * Azure DevOps Work Item Data Extractor Bookmarklet - Enhanced Version
 * 
 * This bookmarklet extracts comprehensive work item data from Azure DevOps pages
 * including HTML content, images, comments, and attachments.
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
    div.style.cssText = 'position:fixed;top:20px;right:20px;padding:16px 24px;border-radius:8px;z-index:999999;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;font-size:14px;box-shadow:0 4px 12px rgba(0,0,0,0.15);transition:opacity 0.3s;max-width:400px;' + 
      (isError ? 'background:#fee2e2;color:#991b1b;border:1px solid #fecaca;' : 'background:#d1fae5;color:#065f46;border:1px solid #a7f3d0;');
    div.textContent = message;
    document.body.appendChild(div);
    
    setTimeout(function() {
      div.style.opacity = '0';
      setTimeout(function() { div.remove(); }, 300);
    }, 4000);
  }
  
  function getTextContent(selector) {
    var el = document.querySelector(selector);
    return el ? el.textContent.trim() : null;
  }
  
  function getAllTextContent(selector) {
    var elements = document.querySelectorAll(selector);
    var results = [];
    elements.forEach(function(el) {
      var text = el.textContent.trim();
      if (text) results.push(text);
    });
    return results;
  }
  
  function getInputValue(selector) {
    var el = document.querySelector(selector);
    return el ? (el.value || el.textContent || '').trim() : null;
  }
  
  function getHtmlContent(selector) {
    var el = document.querySelector(selector);
    return el ? el.innerHTML : null;
  }
  
  function extractImageUrls(htmlContent) {
    if (!htmlContent) return [];
    var temp = document.createElement('div');
    temp.innerHTML = htmlContent;
    var images = temp.querySelectorAll('img');
    var urls = [];
    images.forEach(function(img) {
      var src = img.src || img.getAttribute('src');
      if (src) urls.push(src);
    });
    return urls;
  }
  
  function extractWorkItemData() {
    var data = {
      extractedAt: new Date().toISOString(),
      source: 'bookmarklet',
      version: '2.0',
      url: window.location.href
    };
    
    // Extract Work Item ID from URL or page
    var idMatch = window.location.href.match(/_workitems\\/edit\\/(\\d+)/);
    if (idMatch) {
      data.workItemId = parseInt(idMatch[1], 10);
    } else {
      var idEl = document.querySelector('.work-item-form-id, .workitem-info-bar-id .id, [data-testid="work-item-id"]');
      if (idEl) data.workItemId = parseInt(idEl.textContent.replace('#', '').replace(/\\D/g, ''), 10);
    }
    
    // Extract Work Item Type - multiple selectors for different Azure DevOps versions
    var typeSelectors = [
      '.work-item-type-icon-control',
      '.work-item-type-name',
      '[aria-label*="Work item type"]',
      '.workitem-type-icon',
      '.wit-type-icon',
      '[data-testid="work-item-type"]'
    ];
    for (var i = 0; i < typeSelectors.length; i++) {
      var typeEl = document.querySelector(typeSelectors[i]);
      if (typeEl) {
        data.workItemType = typeEl.getAttribute('aria-label') || typeEl.title || typeEl.textContent.trim();
        if (data.workItemType) break;
      }
    }
    
    // Extract Title - multiple selectors
    var titleSelectors = [
      '.work-item-form-title input',
      '#witc_1_txt',
      '[aria-label="Title"] input',
      '[data-testid="work-item-title"] input',
      '.work-item-form-title textarea',
      'input[aria-label*="Title"]'
    ];
    for (var j = 0; j < titleSelectors.length; j++) {
      var titleEl = document.querySelector(titleSelectors[j]);
      if (titleEl) {
        data.title = titleEl.value || titleEl.textContent.trim();
        if (data.title) break;
      }
    }
    if (!data.title) {
      var titleContainer = document.querySelector('.work-item-form-title');
      if (titleContainer) data.title = titleContainer.textContent.trim();
    }
    
    // Extract State - multiple selectors for different layouts
    var stateSelectors = [
      '.work-item-state-dropdown',
      '[aria-label="State"]',
      '[data-testid="state-field"]',
      '.workitem-state-value',
      '.state-dropdown input',
      '[aria-label*="State"] input'
    ];
    for (var k = 0; k < stateSelectors.length; k++) {
      var stateEl = document.querySelector(stateSelectors[k]);
      if (stateEl) {
        data.state = stateEl.textContent.trim() || stateEl.value;
        if (data.state && data.state !== 'State') break;
      }
    }
    
    // Extract Assigned To - multiple selectors
    var assignedSelectors = [
      '[aria-label="Assigned To"] .identity-picker-resolved-name',
      '.workitem-identity-persona-name',
      '.identity-picker-display-name',
      '[data-testid="assigned-to"] .identity-display-name',
      '.assigned-to-identity-picker .identity-picker-resolved-name',
      '[aria-label*="Assigned"] .persona-text-content',
      '.identity-view-control .identity-picker-resolved-name'
    ];
    for (var l = 0; l < assignedSelectors.length; l++) {
      var assignedEl = document.querySelector(assignedSelectors[l]);
      if (assignedEl) {
        var assignedText = assignedEl.textContent.trim();
        if (assignedText && assignedText !== 'Unassigned' && assignedText !== 'Assign') {
          data.assignedTo = assignedText;
          break;
        }
      }
    }
    
    // Extract Priority
    var prioritySelectors = [
      '[aria-label="Priority"] input',
      '[data-field-name="Priority"] input',
      '[aria-label*="Priority"] .combo-input'
    ];
    for (var m = 0; m < prioritySelectors.length; m++) {
      var priorityEl = document.querySelector(prioritySelectors[m]);
      if (priorityEl && priorityEl.value) {
        data.priority = parseInt(priorityEl.value, 10);
        break;
      }
    }
    
    // Extract Description - both HTML and text
    var descSelectors = [
      '.wit-html-field-content',
      '[data-field-name="Description"] .richeditor-container',
      '.work-item-html-field',
      '[aria-label="Description"] .html-field-content',
      '.description-control .richeditor-container',
      '.html-editor-control .rendered-markdown'
    ];
    for (var n = 0; n < descSelectors.length; n++) {
      var descEl = document.querySelector(descSelectors[n]);
      if (descEl) {
        data.descriptionHtml = descEl.innerHTML;
        data.descriptionText = descEl.textContent.trim();
        data.descriptionImages = extractImageUrls(data.descriptionHtml);
        break;
      }
    }
    
    // Extract Acceptance Criteria (for User Stories)
    var acceptanceSelectors = [
      '[data-field-name="AcceptanceCriteria"] .html-field-content',
      '[aria-label*="Acceptance Criteria"] .html-field-content',
      '.acceptance-criteria-control .richeditor-container'
    ];
    for (var o = 0; o < acceptanceSelectors.length; o++) {
      var acceptanceEl = document.querySelector(acceptanceSelectors[o]);
      if (acceptanceEl) {
        data.acceptanceCriteriaHtml = acceptanceEl.innerHTML;
        data.acceptanceCriteriaText = acceptanceEl.textContent.trim();
        break;
      }
    }
    
    // Extract Repro Steps (for Bugs)
    var reproSelectors = [
      '[data-field-name="ReproSteps"] .html-field-content',
      '[aria-label*="Repro Steps"] .html-field-content',
      '[aria-label*="Steps to Reproduce"] .html-field-content'
    ];
    for (var p = 0; p < reproSelectors.length; p++) {
      var reproEl = document.querySelector(reproSelectors[p]);
      if (reproEl) {
        data.reproStepsHtml = reproEl.innerHTML;
        data.reproStepsText = reproEl.textContent.trim();
        break;
      }
    }
    
    // Extract System Info (for Bugs)
    var sysInfoSelectors = [
      '[data-field-name="SystemInfo"] .html-field-content',
      '[aria-label*="System Info"] .html-field-content'
    ];
    for (var q = 0; q < sysInfoSelectors.length; q++) {
      var sysInfoEl = document.querySelector(sysInfoSelectors[q]);
      if (sysInfoEl) {
        data.systemInfoHtml = sysInfoEl.innerHTML;
        data.systemInfoText = sysInfoEl.textContent.trim();
        break;
      }
    }
    
    // Extract Iteration Path
    var iterationSelectors = [
      '[aria-label="Iteration Path"] input',
      '[data-field-name="IterationPath"] input',
      '[aria-label*="Iteration"] .combo-input'
    ];
    for (var r = 0; r < iterationSelectors.length; r++) {
      var iterationEl = document.querySelector(iterationSelectors[r]);
      if (iterationEl && iterationEl.value) {
        data.iterationPath = iterationEl.value;
        break;
      }
    }
    
    // Extract Area Path
    var areaSelectors = [
      '[aria-label="Area Path"] input',
      '[data-field-name="AreaPath"] input',
      '[aria-label*="Area"] .combo-input'
    ];
    for (var s = 0; s < areaSelectors.length; s++) {
      var areaEl = document.querySelector(areaSelectors[s]);
      if (areaEl && areaEl.value) {
        data.areaPath = areaEl.value;
        break;
      }
    }
    
    // Extract Tags
    var tagsContainer = document.querySelector('.tag-items-container, .tags-control .tag-box');
    if (tagsContainer) {
      var tags = Array.from(tagsContainer.querySelectorAll('.tag-item, .tag-item-delete-container')).map(function(t) {
        return t.textContent.replace(/[×✕]/g, '').trim();
      }).filter(function(t) { return t; });
      if (tags.length) data.tags = tags;
    }
    
    // Extract Organization and Project from URL
    var urlMatch = window.location.href.match(/dev\\.azure\\.com\\/([^\\/]+)\\/([^\\/]+)/);
    if (urlMatch) {
      data.organization = decodeURIComponent(urlMatch[1]);
      data.project = decodeURIComponent(urlMatch[2]);
    } else {
      var altMatch = window.location.href.match(/([^\\/]+)\\.visualstudio\\.com\\/([^\\/]+)/);
      if (altMatch) {
        data.organization = altMatch[1];
        data.project = altMatch[2];
      }
    }
    
    // Extract Sprint/Iteration info
    var sprintEl = document.querySelector('[data-field-name="Sprint"], .iteration-path-display');
    if (sprintEl) data.sprint = sprintEl.textContent.trim();
    
    // Extract Story Points or Effort
    var effortSelectors = [
      { name: 'storyPoints', labels: ['Story Points', 'StoryPoints'] },
      { name: 'effort', labels: ['Effort'] },
      { name: 'originalEstimate', labels: ['Original Estimate', 'OriginalEstimate'] },
      { name: 'remainingWork', labels: ['Remaining Work', 'RemainingWork'] },
      { name: 'completedWork', labels: ['Completed Work', 'CompletedWork'] }
    ];
    effortSelectors.forEach(function(field) {
      field.labels.forEach(function(label) {
        var fieldEl = document.querySelector('[data-field-name="' + label.replace(' ', '') + '"] input, [aria-label="' + label + '"] input');
        if (fieldEl && fieldEl.value) {
          data[field.name] = parseFloat(fieldEl.value);
        }
      });
    });
    
    // Extract Comments/Discussion
    var comments = [];
    var commentSelectors = [
      '.discussion-messages .discussion-message',
      '.wit-discussion-control .comment-item',
      '[data-testid="discussion-item"]'
    ];
    commentSelectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(commentEl) {
        var authorEl = commentEl.querySelector('.identity-picker-resolved-name, .author-name, .persona-text-content');
        var contentEl = commentEl.querySelector('.message-content, .comment-content, .rendered-markdown');
        var dateEl = commentEl.querySelector('.message-timestamp, .comment-date, time');
        
        if (contentEl) {
          comments.push({
            author: authorEl ? authorEl.textContent.trim() : 'Unknown',
            content: contentEl.textContent.trim(),
            contentHtml: contentEl.innerHTML,
            date: dateEl ? (dateEl.getAttribute('datetime') || dateEl.textContent.trim()) : null
          });
        }
      });
    });
    if (comments.length) data.comments = comments;
    
    // Extract Attachments
    var attachments = [];
    var attachmentSelectors = [
      '.attachments-control .attachment-item',
      '.work-item-attachments .attachment',
      '[data-testid="attachment-item"]'
    ];
    attachmentSelectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(attEl) {
        var nameEl = attEl.querySelector('.attachment-name, .file-name, a');
        var sizeEl = attEl.querySelector('.attachment-size, .file-size');
        var linkEl = attEl.querySelector('a[href]');
        
        if (nameEl) {
          attachments.push({
            name: nameEl.textContent.trim(),
            size: sizeEl ? sizeEl.textContent.trim() : null,
            url: linkEl ? linkEl.href : null
          });
        }
      });
    });
    if (attachments.length) data.attachments = attachments;
    
    // Extract Links to other work items
    var links = [];
    var linkSelectors = [
      '.links-control .link-item',
      '.work-item-links .link-row',
      '[data-testid="link-item"]'
    ];
    linkSelectors.forEach(function(selector) {
      document.querySelectorAll(selector).forEach(function(linkEl) {
        var typeEl = linkEl.querySelector('.link-type, .link-type-name');
        var titleEl = linkEl.querySelector('.link-title, .work-item-title');
        var idEl = linkEl.querySelector('.link-id, .work-item-id');
        
        if (titleEl || idEl) {
          links.push({
            type: typeEl ? typeEl.textContent.trim() : 'Related',
            title: titleEl ? titleEl.textContent.trim() : null,
            workItemId: idEl ? parseInt(idEl.textContent.replace(/\\D/g, ''), 10) : null
          });
        }
      });
    });
    if (links.length) data.linkedWorkItems = links;
    
    // Extract Created/Modified info
    var historySection = document.querySelector('.work-item-form-header-controls-container, .work-item-info-bar');
    if (historySection) {
      var createdMatch = historySection.textContent.match(/Created\\s+(.+?)\\s*(?:\\||$|by)/i);
      if (createdMatch) data.createdDate = createdMatch[1].trim();
      
      var modifiedMatch = historySection.textContent.match(/(?:Modified|Updated)\\s+(.+?)\\s*(?:\\||$|by)/i);
      if (modifiedMatch) data.modifiedDate = modifiedMatch[1].trim();
    }
    
    // Count extracted fields for notification
    var fieldCount = Object.keys(data).filter(function(k) {
      var v = data[k];
      return v && (typeof v !== 'object' || (Array.isArray(v) ? v.length > 0 : Object.keys(v).length > 0));
    }).length;
    
    data._fieldCount = fieldCount;
    
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
    var sizeMB = (json.length / 1024 / 1024).toFixed(2);
    
    navigator.clipboard.writeText(json).then(function() {
      var msg = '✓ Work Item #' + data.workItemId + ' copiato! (' + data._fieldCount + ' campi';
      if (data.comments) msg += ', ' + data.comments.length + ' commenti';
      if (data.attachments) msg += ', ' + data.attachments.length + ' allegati';
      msg += ', ' + sizeMB + ' MB)';
      showNotification(msg, false);
      console.log('[DevOps Extractor v2] Dati estratti:', data);
    }).catch(function(err) {
      var textarea = document.createElement('textarea');
      textarea.value = json;
      textarea.style.cssText = 'position:fixed;left:-9999px;';
      document.body.appendChild(textarea);
      textarea.select();
      try {
        document.execCommand('copy');
        showNotification('✓ Work Item #' + data.workItemId + ' copiato!', false);
      } catch (e) {
        showNotification('Errore durante la copia. Controlla la console (F12).', true);
      }
      textarea.remove();
    });
  } catch (err) {
    showNotification('Errore: ' + err.message, true);
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
    📋 Estrai Work Item DevOps v2
  </a>`;
}

/**
 * Interface for comment data
 */
export interface DevOpsComment {
  author: string;
  content: string;
  contentHtml?: string;
  date?: string;
}

/**
 * Interface for attachment data
 */
export interface DevOpsAttachment {
  name: string;
  size?: string;
  url?: string;
}

/**
 * Interface for linked work item
 */
export interface DevOpsLinkedWorkItem {
  type: string;
  title?: string;
  workItemId?: number;
}

/**
 * Interface for the extracted work item data
 */
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
  // Rich text fields
  descriptionHtml?: string;
  descriptionText?: string;
  descriptionImages?: string[];
  acceptanceCriteriaHtml?: string;
  acceptanceCriteriaText?: string;
  reproStepsHtml?: string;
  reproStepsText?: string;
  systemInfoHtml?: string;
  systemInfoText?: string;
  // Path fields
  iterationPath?: string;
  areaPath?: string;
  tags?: string[];
  // Organization info
  organization?: string;
  project?: string;
  sprint?: string;
  // Effort fields
  storyPoints?: number;
  effort?: number;
  originalEstimate?: number;
  remainingWork?: number;
  completedWork?: number;
  // Related data
  comments?: DevOpsComment[];
  attachments?: DevOpsAttachment[];
  linkedWorkItems?: DevOpsLinkedWorkItem[];
  // Dates
  createdDate?: string;
  modifiedDate?: string;
  // Internal
  _fieldCount?: number;
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
