chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) return;

  chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: runDevOpsExtractor
  });
});

async function runDevOpsExtractor() {
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
      source: 'chrome_extension',
      version: '3.5',
      url: window.location.href
    };
    
    var idMatch = window.location.href.match(/_workitems\/edit\/(\d+)/);
    if (idMatch) {
      data.workItemId = parseInt(idMatch[1], 10);
    }
    
    var urlMatch = window.location.href.match(/dev\.azure\.com\/([^\/]+)\/([^\/]+)/);
    if (urlMatch) {
      data.organization = decodeURIComponent(urlMatch[1]);
      data.project = decodeURIComponent(urlMatch[2]);
    }
    
    try {
      if (window.__vssPageContext && window.__vssPageContext.webContext) {
        var wc = window.__vssPageContext.webContext;
        if (wc.project) data.project = wc.project.name;
        if (wc.collection) data.organization = wc.collection.name;
      }
    } catch(e) {}
    
    var titleInput = document.querySelector('.work-item-form-title input, .work-item-form-title textarea, input.work-item-title-textfield');
    if (titleInput) data.title = titleInput.value || titleInput.textContent;
    
    var stateEl = document.querySelector('[class*="state-color"], [class*="work-item-state"]');
    if (stateEl) {
      var stateText = stateEl.textContent.trim();
      if (stateText && stateText.length < 30) data.state = stateText;
    }
    
    var assignedEl = document.querySelector('.identity-picker-resolved-name, [class*="assigned"] .persona-text');
    if (assignedEl) {
      var assignedText = assignedEl.textContent.trim();
      if (assignedText && assignedText !== 'Unassigned' && assignedText !== 'Non assegnato') {
        data.assignedTo = assignedText;
      }
    }
    
    var typeEl = document.querySelector('[class*="work-item-type"] span, [class*="wit-type"]');
    if (typeEl) data.workItemType = typeEl.textContent.trim();
    
    function extractCustomFields() {
      var customFields = {};
      
      document.querySelectorAll('.workitemcontrol-label, [class*="workitemcontrol-label"]').forEach(function(labelEl) {
        var labelText = labelEl.textContent.trim();
        if (labelText && labelText.length > 0 && labelText.length < 100) {
          var container = labelEl.closest('.work-item-form-control-wrapper, .flex-column, [class*="control-wrapper"]');
          if (container) {
            var valueEl = container.querySelector('input, textarea, select, .text, [class*="value"], .bolt-textfield-input');
            if (valueEl) {
              var val = valueEl.value || valueEl.textContent.trim();
              if (val && val !== labelText && val.length > 0 && val.length < 500) {
                customFields[labelText] = val;
              }
            }
          }
        }
      });
      
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
    
    var customFields = extractCustomFields();
    console.log('[DevOps v3.5] Custom fields found:', customFields);
    if (Object.keys(customFields).length > 0) {
      data.customFields = customFields;
      var ticketKeys = ['Codice_Ticket', 'codice_ticket', 'Ticket', 'N. Ticket', 'N. Ticket Rapportino SAP'];
      for (var tk = 0; tk < ticketKeys.length; tk++) {
        if (customFields[ticketKeys[tk]]) {
          data.ticketCode = customFields[ticketKeys[tk]];
          break;
        }
      }
      var wbsKeys = ['WBS', 'wbs', 'Codice WBS', 'WBE', 'WBS Rapportino SAP'];
      for (var wk = 0; wk < wbsKeys.length; wk++) {
        if (customFields[wbsKeys[wk]]) {
          data.wbsCode = customFields[wbsKeys[wk]];
          break;
        }
      }
      if (customFields['Tipo Ticket']) {
        data.ticketType = customFields['Tipo Ticket'];
      }
    }
    
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
      if (!data.state && (allFields['State'] || allFields['Stato'])) {
        data.state = allFields['State'] || allFields['Stato'];
      }
      if (!data.priority && (allFields['Priority'] || allFields['Priorità'])) {
        data.priority = parseInt(allFields['Priority'] || allFields['Priorità'], 10);
      }
      if (allFields['Iteration Path']) data.iterationPath = allFields['Iteration Path'];
      if (allFields['Area Path']) data.areaPath = allFields['Area Path'];
      if (allFields['Effort'] || allFields['Original Estimate']) {
        data.effort = allFields['Effort'] || allFields['Original Estimate'];
      }
    }
    
    function extractRichText(fieldNames) {
      for (var i = 0; i < fieldNames.length; i++) {
        var name = fieldNames[i];
        var selectors = [
          '[aria-label="' + name + '"] .rendered-markdown',
          '[aria-label="' + name + '"] .ql-editor',
          '[aria-label="' + name + '"] .html-content',
          '[data-field-name*="' + name + '"] .rendered-markdown',
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
    
    var richTextContainers = document.querySelectorAll('.rendered-markdown, .ql-editor, [contenteditable="true"]');
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
          text: el.textContent.trim().substring(0, 500)
        });
      }
    });
    
    var desc = extractRichText(['Description', 'Descrizione']);
    if (desc) {
      data.descriptionHtml = desc.html;
      data.descriptionText = desc.text;
    } else if (richTexts.length > 0) {
      data.descriptionHtml = richTexts[0].html;
      data.descriptionText = richTexts[0].text;
    }
    
    var ac = extractRichText(['Acceptance Criteria', 'Criteri di accettazione']);
    if (ac) {
      data.acceptanceCriteriaHtml = ac.html;
      data.acceptanceCriteriaText = ac.text;
    }
    
    var repro = extractRichText(['Repro Steps', 'Steps to Reproduce', 'Passaggi per riprodurre']);
    if (repro) {
      data.reproStepsHtml = repro.html;
      data.reproStepsText = repro.text;
    }
    
    if (richTexts.length > 0) {
      data._richTextsFound = richTexts.length;
    }
    
    var tags = [];
    document.querySelectorAll('.tag-item, .tag-box .tag, [class*="tag-item"]').forEach(function(el) {
      var text = el.textContent.replace(/[×✕x]/gi, '').trim();
      if (text && text.length > 0 && text.length < 50) tags.push(text);
    });
    if (tags.length > 0) data.tags = tags;
    
    var comments = [];
    var searchArea = document.querySelector('.discussion-messages-container, .wit-discussion-control, [class*="discussion-control"], .discussion-messages') || document;
    
    var messageSelectors = ['.discussion-message', '.message-list-item', '[class*="comment-item"]', '[class*="displayed-comment"]'];
    messageSelectors.forEach(function(sel) {
      if (comments.length > 0) return;
      searchArea.querySelectorAll(sel).forEach(function(el) {
        var content = el.querySelector('.message-content, .comment-content, .rendered-markdown, .message-body, p');
        var author = el.querySelector('.identity-picker-resolved-name, .persona-text, [class*="display-name"]');
        var date = el.querySelector('time, [class*="timestamp"], [datetime]');
        if (!content) content = el;
        var text = content.textContent.trim();
        if (text.length > 5 && text.length < 5000) {
          var isSystemMsg = text.startsWith('changed') || text.includes('field from');
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
    console.log('[DevOps v3.5] Comments found:', comments.length);
    if (comments.length > 0) data.comments = comments;
    
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
    
    var fieldCount = Object.keys(data).filter(function(k) {
      if (k.startsWith('_')) return false;
      var v = data[k];
      return v !== null && v !== undefined && v !== '';
    }).length;
    data._fieldCount = fieldCount;
    
    return data;
  }

  // Convert image URL to base64 using canvas (works with authenticated images)
  function imageUrlToBase64ViaCanvas(url, maxSize) {
    maxSize = maxSize || 1024 * 1024; // 1MB default (increased from 500KB)
    
    return new Promise(function(resolve) {
      var img = new Image();
      img.crossOrigin = 'anonymous'; // Try CORS
      
      var timeout = setTimeout(function() {
        console.log('[DevOps v3.5] Image load timeout:', url.substring(0, 80));
        resolve(null);
      }, 10000);
      
      img.onload = function() {
        clearTimeout(timeout);
        try {
          var canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width;
          canvas.height = img.naturalHeight || img.height;
          
          // Skip very large images
          if (canvas.width * canvas.height > 4000 * 4000) {
            console.log('[DevOps v3.5] Image too large, skipping:', canvas.width + 'x' + canvas.height);
            resolve(null);
            return;
          }
          
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);
          
          // Try to get as PNG first, then JPEG for compression
          var dataUrl = canvas.toDataURL('image/png');
          
          // If PNG is too large, try JPEG
          if (dataUrl.length > maxSize) {
            dataUrl = canvas.toDataURL('image/jpeg', 0.8);
          }
          
          // Final size check (use 1.5MB for base64 which is ~33% larger than binary)
          if (dataUrl.length > 1.5 * 1024 * 1024) {
            console.log('[DevOps v3.5] Image base64 too large:', Math.round(dataUrl.length/1024) + 'KB');
            resolve(null);
            return;
          }
          
          console.log('[DevOps v3.5] Converted via canvas:', Math.round(dataUrl.length/1024) + 'KB');
          resolve(dataUrl);
        } catch(e) {
          console.warn('[DevOps v3.5] Canvas conversion failed (CORS?):', e.message);
          resolve(null);
        }
      };
      
      img.onerror = function() {
        clearTimeout(timeout);
        console.log('[DevOps v3.5] Image load error:', url.substring(0, 80));
        resolve(null);
      };
      
      img.src = url;
    });
  }

  // Try fetch first, fallback to canvas
  async function convertImageToBase64(url) {
    // Skip data URLs
    if (url.startsWith('data:')) return url;
    
    console.log('[DevOps v3.5] Converting image:', url.substring(0, 80));
    
    // Method 1: Try fetch with credentials (works if CORS allows)
    try {
      var response = await fetch(url, { 
        credentials: 'include',
        mode: 'cors'
      });
      
      if (response.ok) {
        var blob = await response.blob();
        
        // Skip large images (increased to 1MB)
        if (blob.size > 1024 * 1024) {
          console.warn('[DevOps v3.5] Image too large via fetch:', Math.round(blob.size/1024) + 'KB');
        } else {
          var base64 = await new Promise(function(resolve) {
            var reader = new FileReader();
            reader.onloadend = function() { resolve(reader.result); };
            reader.readAsDataURL(blob);
          });
          
          console.log('[DevOps v3.5] Converted via fetch:', Math.round(blob.size/1024) + 'KB');
          return base64;
        }
      }
    } catch(e) {
      console.log('[DevOps v3.5] Fetch failed, trying canvas...', e.message);
    }
    
    // Method 2: Try canvas (works if image is visible in page)
    var canvasResult = await imageUrlToBase64ViaCanvas(url);
    if (canvasResult) {
      return canvasResult;
    }
    
    // Method 3: Try to find the actual image in the DOM and capture it
    var existingImg = document.querySelector('img[src="' + url + '"]');
    if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
      try {
        var canvas = document.createElement('canvas');
        canvas.width = existingImg.naturalWidth;
        canvas.height = existingImg.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(existingImg, 0, 0);
        var dataUrl = canvas.toDataURL('image/png');
        
        if (dataUrl.length < 1.5 * 1024 * 1024) {
          console.log('[DevOps v3.5] Captured existing DOM image:', Math.round(dataUrl.length/1024) + 'KB');
          return dataUrl;
        }
      } catch(e) {
        console.log('[DevOps v3.5] DOM capture failed:', e.message);
      }
    }
    
    console.log('[DevOps v3.5] All methods failed for:', url.substring(0, 80));
    return null; // Failed to convert
  }

  async function convertImagesToBase64(html) {
    if (!html) return html;
    
    var imgRegex = /<img([^>]*)src=["'](https?:\/\/[^"']+)["']([^>]*)>/gi;
    var matches = [];
    var match;
    
    while ((match = imgRegex.exec(html)) !== null) {
      matches.push({
        fullMatch: match[0],
        before: match[1],
        url: match[2],
        after: match[3]
      });
    }
    
    if (matches.length === 0) return html;
    
    console.log('[DevOps v3.5] Found ' + matches.length + ' URL images to convert');
    
    var newHtml = html;
    var convertedCount = 0;
    var failedCount = 0;
    
    for (var i = 0; i < matches.length; i++) {
      var m = matches[i];
      
      var base64 = await convertImageToBase64(m.url);
      
      if (base64) {
        var newImg = '<img' + m.before + 'src="' + base64 + '"' + m.after + '>';
        newHtml = newHtml.replace(m.fullMatch, newImg);
        convertedCount++;
      } else {
        failedCount++;
        // Remove the image if we can't convert it (better than broken placeholder)
        newHtml = newHtml.replace(m.fullMatch, '<span style="color:#999;font-style:italic">[Immagine non disponibile]</span>');
      }
    }
    
    console.log('[DevOps v3.5] Converted ' + convertedCount + '/' + matches.length + ' images (' + failedCount + ' failed)');
    return newHtml;
  }

  async function processDataImages(data) {
    var fieldsToProcess = ['descriptionHtml', 'acceptanceCriteriaHtml', 'reproStepsHtml'];
    
    for (var i = 0; i < fieldsToProcess.length; i++) {
      var field = fieldsToProcess[i];
      if (data[field]) {
        data[field] = await convertImagesToBase64(data[field]);
      }
    }
    
    if (data.comments && data.comments.length > 0) {
      for (var j = 0; j < data.comments.length; j++) {
        if (data.comments[j].contentHtml) {
          data.comments[j].contentHtml = await convertImagesToBase64(data.comments[j].contentHtml);
        }
      }
    }
    
    return data;
  }

  function copyToClipboard(text) {
    if (navigator.clipboard && document.hasFocus()) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function(resolve, reject) {
      var textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:none;outline:none;background:transparent;';
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

  try {
    showNotification('Estrazione dati in corso...', false);
    
    var data = extractWorkItemData();
    
    if (!data.workItemId) {
      showNotification('Work Item ID non trovato. Sei sulla pagina di un Work Item?', true);
      return;
    }
    
    showNotification('Conversione immagini in corso...', false);
    data = await processDataImages(data);
    
    var json = JSON.stringify(data, null, 2);
    
    var imgCount = (json.match(/data:image/g) || []).length;
    var cfCount = data.customFields ? Object.keys(data.customFields).length : 0;
    
    copyToClipboard(json).then(function() {
      var msg = '✓ Work Item #' + data.workItemId + ' copiato! (' + data._fieldCount + ' campi';
      if (cfCount > 0) msg += ', ' + cfCount + ' custom';
      if (data.comments && data.comments.length) msg += ', ' + data.comments.length + ' commenti';
      if (imgCount > 0) msg += ', ' + imgCount + ' immagini';
      msg += ')';
      showNotification(msg, false);
      console.log('[DevOps Extractor v3.4] Dati estratti:', data);
    }).catch(function(err) {
      var modal = document.createElement('div');
      modal.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.8);z-index:999999;display:flex;align-items:center;justify-content:center;';
      modal.innerHTML = '<div style="background:white;padding:20px;border-radius:8px;max-width:600px;max-height:80vh;overflow:auto;"><h3 style="margin:0 0 10px">Copia manualmente (Cmd+C / Ctrl+C)</h3><textarea id="devops-json" style="width:100%;height:300px;font-family:monospace;font-size:12px;">' + json.replace(/</g,'&lt;') + '</textarea><button onclick="this.parentElement.parentElement.remove()" style="margin-top:10px;padding:8px 16px;cursor:pointer;">Chiudi</button></div>';
      document.body.appendChild(modal);
      var ta = document.getElementById('devops-json');
      ta.focus();
      ta.select();
      console.log('[DevOps Extractor v3.4] Dati estratti:', data);
    });
  } catch (err) {
    showNotification('Errore: ' + err.message, true);
    console.error('[DevOps Extractor v3.4] Error:', err);
  }
}
