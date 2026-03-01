/**
 * Slack Alert Parser – parses Slack alerts monitoring channel content.
 * Supports block style (Format 1) and webhook style (Format 2).
 * Exposes parseSlackAlerts() and parseSlackCsv() for future CSV upload.
 */
(function () {
  'use strict';

  var ALERT_TYPE_PATTERN = /^([A-Z][A-Z0-9_]+(?:\-[A-Z0-9_]+)*)/;

  /**
   * Extract alert type from message (e.g. NOC_SHVA_ALERT from "NOC_SHVA_ALERT - Daily POS record...").
   * @param {string} message
   * @returns {string}
   */
  function extractAlertType(message) {
    if (!message || typeof message !== 'string') return '';
    var m = message.trim().match(ALERT_TYPE_PATTERN);
    return m ? m[1] : '';
  }

  /**
   * Parse Format 1 – block style alerts.
   * - :label: Operation ID: uuid
   *    * time: ISO
   *    * message: ...
   *    * label: service_name
   */
  function parseBlockFormat(text) {
    var alerts = [];
    var blockRegex = /[-:]\s*:label:\s*Operation ID:\s*([a-f0-9\-]+)\s*[\s\S]*?(?=\n[-:]\s*:label:\s*Operation ID:|\n_{10,}|\n\n\n|$)/gi;
    var block;
    while ((block = blockRegex.exec(text)) !== null) {
      var blockText = block[0];
      var opIdMatch = blockText.match(/Operation ID:\s*([a-f0-9\-]+)/i);
      var timeMatch = blockText.match(/\*\s*time:\s*([^\n]+)/);
      var messageMatch = blockText.match(/\*\s*message:\s*([^\n]+)/);
      var labelMatch = blockText.match(/\*\s*label:\s*([^\n]+)/);
      var operationId = opIdMatch ? opIdMatch[1].trim() : '';
      var time = timeMatch ? timeMatch[1].trim() : '';
      var message = messageMatch ? messageMatch[1].trim() : '';
      var label = labelMatch ? labelMatch[1].trim() : '';
      if (operationId || message || label) {
        alerts.push({
          operationId: operationId,
          time: time,
          message: message,
          label: label,
          alertType: extractAlertType(message),
          severity: undefined,
          hits: undefined,
          periodStart: undefined,
          periodEnd: undefined
        });
      }
    }
    return alerts;
  }

  /**
   * Parse Format 2 – webhook style alerts.
   * NOC_SHVA_ALERT - shva_collect_service
   * :rotating_light: Alert: ...
   *   - Severity: 1
   * :clock3: Period Start: ISO
   * :clock3: Period End: ISO
   * :exclamation: Number of Hits: 1
   */
  function parseWebhookFormat(text) {
    var alerts = [];
    var blocks = text.split(/_{10,}/);
    for (var i = 0; i < blocks.length; i++) {
      var block = blocks[i];
      var periodStartMatch = block.match(/Period Start:\s*([^\s\n]+)/i);
      var hitsMatch = block.match(/Number of Hits:\s*(\d+)/i);
      if (!periodStartMatch && !hitsMatch) continue;
      var lines = block.split('\n');
      var alertNameMatch = null;
      var firstLine = '';
      for (var k = 0; k < lines.length; k++) {
        alertNameMatch = lines[k].match(/([A-Z][A-Z0-9_\-]+)\s*-\s*([a-z][a-z0-9_]+)/);
        if (alertNameMatch) {
          firstLine = lines[k];
          break;
        }
      }
      if (!alertNameMatch) continue;
      var alertType = alertNameMatch[1];
      var label = alertNameMatch[2];
      var severityMatch = block.match(/Severity:\s*(\d+)/i);
      var periodEndMatch = block.match(/Period End:\s*([^\s\n]+)/i);
      var time = periodStartMatch ? periodStartMatch[1].trim() : '';
      alerts.push({
        operationId: '',
        time: time,
        message: firstLine.trim(),
        label: label,
        alertType: alertType,
        severity: severityMatch ? parseInt(severityMatch[1], 10) : undefined,
        hits: hitsMatch ? parseInt(hitsMatch[1], 10) : undefined,
        periodStart: periodStartMatch ? periodStartMatch[1].trim() : undefined,
        periodEnd: periodEndMatch ? periodEndMatch[1].trim() : undefined
      });
    }
    return alerts;
  }

  /**
   * Parse raw Slack channel text into structured alerts.
   * @param {string} rawText
   * @returns {{ alerts: Array, errors: Array }}
   */
  function parseSlackAlerts(rawText) {
    var alerts = [];
    var errors = [];
    if (!rawText || typeof rawText !== 'string') {
      return { alerts: [], errors: [] };
    }
    try {
      var blockAlerts = parseBlockFormat(rawText);
      var webhookAlerts = parseWebhookFormat(rawText);
      var seen = {};
      blockAlerts.forEach(function (a) {
        var key = (a.operationId || '') + '|' + (a.time || '') + '|' + (a.message || '').slice(0, 80);
        if (!seen[key]) {
          seen[key] = true;
          alerts.push(a);
        }
      });
      webhookAlerts.forEach(function (a) {
        var key = (a.periodStart || '') + '|' + (a.label || '') + '|' + (a.alertType || '');
        if (!seen[key]) {
          seen[key] = true;
          alerts.push(a);
        }
      });
    } catch (e) {
      errors.push(e.message || String(e));
    }
    return { alerts: alerts, errors: errors };
  }

  /**
   * Parse CSV content (future: Slack channel export).
   * Stub – expects columns compatible with alert structure when CSV format is known.
   * @param {string} csvText
   * @returns {{ alerts: Array, errors: Array }}
   */
  function parseSlackCsv(csvText) {
    var alerts = [];
    var errors = [];
    if (!csvText || typeof csvText !== 'string') {
      return { alerts: [], errors: [] };
    }
    try {
      var lines = csvText.split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (lines.length < 2) return { alerts: [], errors: [] };
      var headers = lines[0].split(',').map(function (h) { return h.trim().replace(/^"|"$/g, ''); });
      for (var i = 1; i < lines.length; i++) {
        var row = lines[i];
        var values = [];
        var inQuotes = false;
        var current = '';
        for (var j = 0; j < row.length; j++) {
          var c = row[j];
          if (c === '"') {
            inQuotes = !inQuotes;
          } else if ((c === ',' && !inQuotes) || c === '\n') {
            values.push(current.trim());
            current = '';
          } else {
            current += c;
          }
        }
        values.push(current.trim());
        var obj = {};
        headers.forEach(function (h, idx) {
          obj[h] = values[idx] || '';
        });
        var time = obj.time || obj.Time || obj.timestamp || obj.Timestamp || obj.date || obj.Date || obj['Date Time'] || obj['Sent at'] || '';
        var message = obj.message || obj.Message || obj.text || obj.Text || obj.content || obj.Content || '';
        var label = obj.label || obj.Label || obj.service || obj.Service || obj.channel || obj.Channel || obj.user || obj.User || obj['User Name'] || '';
        var operationId = obj.operationId || obj['Operation ID'] || obj.operation_id || obj.id || obj.Id || '';
        alerts.push({
          operationId: operationId,
          time: time,
          message: message,
          label: label,
          alertType: extractAlertType(message),
          severity: undefined,
          hits: undefined,
          periodStart: undefined,
          periodEnd: undefined
        });
      }
    } catch (e) {
      errors.push(e.message || String(e));
    }
    return { alerts: alerts, errors: errors };
  }

  window.App = window.App || {};
  window.App.slackAlertParser = {
    parseSlackAlerts: parseSlackAlerts,
    parseSlackCsv: parseSlackCsv,
    extractAlertType: extractAlertType
  };
})();
