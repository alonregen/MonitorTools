/**
 * Small DOM helpers for the Monitor Tools SPA.
 * Used across views for querying, safe HTML, and copy-to-clipboard.
 */
(function (global) {
  'use strict';

  function byId(id, root) {
    var el = (root || document).getElementById(id);
    return el || (root ? root.querySelector('[id="' + id + '"]') : null);
  }

  function query(selector, root) {
    return (root || document).querySelector(selector);
  }

  function queryAll(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  /**
   * Escape HTML to prevent XSS when setting innerHTML.
   */
  function escapeHtml(text) {
    if (text == null) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Safe innerHTML: only use for trusted/sanitized content or escaped strings.
   */
  function setHtml(el, html) {
    if (!el) return;
    el.innerHTML = html;
  }

  /**
   * Copy text to clipboard. Returns a Promise that resolves to true on success.
   */
  function copyToClipboard(text) {
    if (!text) return Promise.resolve(false);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).then(function () { return true; }).catch(function () { return false; });
    }
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return Promise.resolve(!!ok);
    } catch (e) {
      document.body.removeChild(ta);
      return Promise.resolve(false);
    }
  }

  global.App = global.App || {};
  global.App.dom = {
    byId: byId,
    query: query,
    queryAll: queryAll,
    escapeHtml: escapeHtml,
    setHtml: setHtml,
    copyToClipboard: copyToClipboard
  };
})(typeof window !== 'undefined' ? window : this);
