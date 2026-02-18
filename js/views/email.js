/**
 * Email Generator – from Nested_Search. TSV payout data → emails by gateway (alert blocks + table).
 * IDs: #payoutData, #payoutsForm, #output. showAlert inserts into #payoutsForm.
 */
var dom = window.App.dom;

function root(container) {
  return container || document;
}

function byId(id, container) {
  const r = root(container);
  return r.getElementById ? r.getElementById(id) : r.querySelector('[id="' + id + '"]');
}

function render() {
  return `
    <h2 class="text-xl font-bold text-slate-800 mb-4">Payouts Email Generator</h2>
    <form id="payoutsForm">
      <label for="payoutData" class="block text-sm font-medium text-slate-700 mb-1">Paste Payout Data:</label>
      <textarea id="payoutData" rows="10" class="w-full border border-slate-300 rounded-lg px-3 py-2 text-slate-800 focus:ring-2 focus:ring-primary focus:border-primary font-mono text-sm resize-none" placeholder="Paste your payout data here..."></textarea>
      <div class="mt-4 pt-4 border-t border-slate-200">
        <button type="button" class="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 text-sm font-medium transition shadow-sm" id="generateEmailsBtn"><i class="fas fa-envelope"></i> Generate Email Content</button>
      </div>
    </form>
    <div id="output" class="mt-6 email-output space-y-4"></div>
  `;
}

function parsePayoutData(data) {
  const lines = data.split('\n');
  const payouts = [];
  for (let i = 1; i < lines.length; i++) {
    const columns = lines[i].split('\t');
    if (columns.length >= 11) {
      payouts.push({
        gatewayName: columns[3],
        payoutToken: columns[1],
        externalId: columns[2],
        createdDate: columns[6],
        amount: columns[10]
      });
    }
  }
  return payouts;
}

function generateEmailsByGateway(payouts) {
  const emails = {};
  payouts.forEach(payout => {
    if (!emails[payout.gatewayName]) {
      emails[payout.gatewayName] = '<div class="email-block rounded-xl border border-slate-200 bg-indigo-50/50 p-4 shadow-sm" role="alert" data-gateway="' + dom.escapeHtml(payout.gatewayName) + '"><div class="flex items-center justify-between mb-2"><h4 class="text-lg font-semibold text-slate-800">' + dom.escapeHtml(payout.gatewayName) + '</h4><button type="button" class="copy-email-btn inline-flex items-center gap-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 text-xs font-medium transition shadow-sm" data-gateway="' + dom.escapeHtml(payout.gatewayName) + '"><i class="fas fa-copy"></i> Copy</button></div><p class="text-slate-600 text-sm mb-3">Dear Team,<br>I hope this email finds you well.<br>May you please assist us and clarify for us what is the status of the following payouts for ' + dom.escapeHtml(payout.gatewayName) + '?<br>In case it failed, please let us know what was the failure reason.<br>In case the payout is closed may you please provide us proof of deposit?</p><table class="w-full border-collapse border border-slate-300"><thead><tr class="bg-slate-100"><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Payout Token</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">External Id</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Created Date</th><th class="border border-slate-300 px-3 py-2 text-left text-sm font-semibold">Amount</th></tr></thead><tbody>';
    }
    emails[payout.gatewayName] += '<tr><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.payoutToken) + '</td><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.externalId) + '</td><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.createdDate) + '</td><td class="border border-slate-300 px-3 py-2 text-sm">' + dom.escapeHtml(payout.amount) + '</td></tr>';
  });
  const result = [];
  for (const gatewayName in emails) {
    emails[gatewayName] += '</tbody></table><p class="text-slate-600 text-sm mt-3">Looking forward to your response.<br>Best Regards,</p></div>';
    result.push(emails[gatewayName]);
  }
  return result;
}

function showAlert(container, message) {
  const r = root(container);
  const form = byId('payoutsForm', r);
  const btn = form ? form.querySelector('#generateEmailsBtn') : null;
  if (!form) return;
  const alertDiv = document.createElement('div');
  alertDiv.className = 'mt-3 p-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm';
  alertDiv.setAttribute('role', 'alert');
  alertDiv.textContent = message;
  if (btn) form.insertBefore(alertDiv, btn);
  else form.appendChild(alertDiv);
  setTimeout(function () { alertDiv.remove(); }, 3000);
}

function copyEmailContent(container, gatewayName) {
  const r = root(container);
  const emailBlock = r.querySelector('.email-block[data-gateway="' + dom.escapeHtml(gatewayName) + '"]');
  if (!emailBlock) return;
  
  // Clone the email block to preserve structure
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = emailBlock.innerHTML;
  
  // Remove the copy button and header
  const copyBtn = tempDiv.querySelector('.copy-email-btn');
  if (copyBtn) copyBtn.remove();
  const header = tempDiv.querySelector('h4');
  if (header) header.remove();
  
  // Extract the email content (paragraph and table)
  const paragraphs = tempDiv.querySelectorAll('p');
  const table = tempDiv.querySelector('table');
  
  // Build clean HTML preserving table structure with inline styles for email compatibility
  let htmlContent = '';
  
  // Add email body paragraphs
  paragraphs.forEach(function(p, index) {
    if (index < paragraphs.length - 1 || !table) {
      // Convert <br> to newlines and preserve paragraph structure
      const pClone = p.cloneNode(true);
      pClone.removeAttribute('class');
      pClone.style.color = '#475569';
      pClone.style.fontSize = '0.875rem';
      pClone.style.marginBottom = '0.75rem';
      htmlContent += pClone.outerHTML + '\n';
    }
  });
  
  // Add table with clean HTML (preserve structure with inline styles for email compatibility)
  if (table) {
    const cleanTable = table.cloneNode(true);
    cleanTable.removeAttribute('class');
    cleanTable.style.width = '100%';
    cleanTable.style.borderCollapse = 'collapse';
    cleanTable.style.border = '1px solid #cbd5e1';
    cleanTable.style.marginTop = '0.5rem';
    cleanTable.style.marginBottom = '0.5rem';
    
    // Style all cells
    const allCells = cleanTable.querySelectorAll('th, td');
    allCells.forEach(function(cell) {
      cell.removeAttribute('class');
      cell.style.border = '1px solid #cbd5e1';
      cell.style.padding = '0.5rem 0.75rem';
      cell.style.fontSize = '0.875rem';
      cell.style.textAlign = 'left';
    });
    
    // Style header cells
    const headerCells = cleanTable.querySelectorAll('th');
    headerCells.forEach(function(cell) {
      cell.style.backgroundColor = '#f1f5f9';
      cell.style.fontWeight = '600';
    });
    
    htmlContent += cleanTable.outerHTML + '\n';
  }
  
  // Add closing paragraph if exists
  if (paragraphs.length > 0 && table) {
    const closingP = paragraphs[paragraphs.length - 1];
    const pClone = closingP.cloneNode(true);
    pClone.removeAttribute('class');
    pClone.style.color = '#475569';
    pClone.style.fontSize = '0.875rem';
    pClone.style.marginTop = '0.75rem';
    htmlContent += pClone.outerHTML;
  }
  
  // Copy HTML to clipboard using Clipboard API with HTML format
  const copyBtnEl = emailBlock.querySelector('.copy-email-btn');
  
  // Try modern ClipboardItem API first (for HTML format)
  if (copyBtnEl && navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
    try {
      const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
      const textBlob = new Blob([tempDiv.textContent || tempDiv.innerText || ''], { type: 'text/plain' });
      
      const clipboardItem = new ClipboardItem({
        'text/html': htmlBlob,
        'text/plain': textBlob
      });
      
      navigator.clipboard.write([clipboardItem]).then(function() {
        if (copyBtnEl) {
          const originalHtml = copyBtnEl.innerHTML;
          copyBtnEl.innerHTML = '<i class="fas fa-check"></i> Copied!';
          copyBtnEl.classList.add('bg-green-700');
          setTimeout(function() {
            copyBtnEl.innerHTML = originalHtml;
            copyBtnEl.classList.remove('bg-green-700');
          }, 2000);
        }
      }).catch(function() {
        // Fallback to HTML string copy
        copyHtmlFallback(htmlContent, copyBtnEl);
      });
      return;
    } catch (e) {
      // Fallback if ClipboardItem not supported
      copyHtmlFallback(htmlContent, copyBtnEl);
    }
  } else {
    // Fallback: copy HTML string directly
    copyHtmlFallback(htmlContent, copyBtnEl);
  }
}

function copyHtmlFallback(htmlContent, copyBtnEl) {
  // Create a temporary textarea with HTML content
  const textarea = document.createElement('textarea');
  textarea.value = htmlContent;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  
  try {
    // Try to copy as HTML using execCommand
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    
    if (success && copyBtnEl) {
      const originalHtml = copyBtnEl.innerHTML;
      copyBtnEl.innerHTML = '<i class="fas fa-check"></i> Copied!';
      copyBtnEl.classList.add('bg-green-700');
      setTimeout(function() {
        copyBtnEl.innerHTML = originalHtml;
        copyBtnEl.classList.remove('bg-green-700');
      }, 2000);
    } else if (copyBtnEl && dom.copyToClipboard) {
      // Final fallback: use the utility function
      dom.copyToClipboard(htmlContent.trim()).then(function(success) {
        if (success && copyBtnEl) {
          const originalHtml = copyBtnEl.innerHTML;
          copyBtnEl.innerHTML = '<i class="fas fa-check"></i> Copied!';
          copyBtnEl.classList.add('bg-green-700');
          setTimeout(function() {
            copyBtnEl.innerHTML = originalHtml;
            copyBtnEl.classList.remove('bg-green-700');
          }, 2000);
        }
      });
    }
  } catch (e) {
    document.body.removeChild(textarea);
    // Final fallback
    if (copyBtnEl && dom.copyToClipboard) {
      dom.copyToClipboard(htmlContent.trim()).then(function(success) {
        if (success && copyBtnEl) {
          const originalHtml = copyBtnEl.innerHTML;
          copyBtnEl.innerHTML = '<i class="fas fa-check"></i> Copied!';
          copyBtnEl.classList.add('bg-green-700');
          setTimeout(function() {
            copyBtnEl.innerHTML = originalHtml;
            copyBtnEl.classList.remove('bg-green-700');
          }, 2000);
        }
      });
    }
  }
}

function generateEmails(container) {
  const r = root(container);
  const payoutDataEl = byId('payoutData', r);
  const outputDiv = byId('output', r);
  if (!payoutDataEl || !outputDiv) return;
  const payoutData = payoutDataEl.value.trim();
  if (!payoutData) {
    showAlert(container, 'Please paste payout data.');
    return;
  }
  const payouts = parsePayoutData(payoutData);
  if (payouts.length === 0) {
    showAlert(container, 'No valid payout data found.');
    return;
  }
  outputDiv.innerHTML = '';
  const emails = generateEmailsByGateway(payouts);
  emails.forEach(html => {
    outputDiv.innerHTML += html;
  });
  
  // Attach copy button handlers
  const copyButtons = outputDiv.querySelectorAll('.copy-email-btn');
  copyButtons.forEach(function(btn) {
    btn.addEventListener('click', function() {
      const gateway = btn.getAttribute('data-gateway');
      if (gateway) copyEmailContent(container, gateway);
    });
  });
}

function mount(container) {
  const r = root(container);
  const btn = byId('generateEmailsBtn', r);
  if (btn) btn.addEventListener('click', function () { generateEmails(container); });
}

var emailView = {
  route: 'email',
  navLabel: 'Email Generator',
  render: render,
  mount: mount
};
(function () { window.MonitorToolsViews = window.MonitorToolsViews || {}; window.MonitorToolsViews.emailView = emailView; })();
