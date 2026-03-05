/**
 * HubSpot Ticket Parser – parses HubSpot CRM tickets CSV export.
 * RFC 4180 CSV (quoted fields, escaped quotes).
 */
(function () {
  'use strict';

  /**
   * Extract ticket type from name (part after " - " in "ID - Description").
   * @param {string} name
   * @returns {string}
   */
  function extractTicketType(name) {
    if (!name || typeof name !== 'string') return '';
    var idx = name.indexOf(' - ');
    return idx >= 0 ? name.slice(idx + 3).trim() : name.trim();
  }

  /**
   * Parse a single CSV row respecting RFC 4180 (quoted fields, "" = escaped quote).
   */
  function parseCsvRow(row) {
    var values = [];
    var i = 0;
    while (i < row.length) {
      if (row[i] === '"') {
        var field = '';
        i++;
        while (i < row.length) {
          if (row[i] === '"') {
            if (row[i + 1] === '"') {
              field += '"';
              i += 2;
            } else {
              i++;
              break;
            }
          } else {
            field += row[i];
            i++;
          }
        }
        values.push(field);
      } else {
        var start = i;
        while (i < row.length && row[i] !== ',') i++;
        values.push(row.slice(start, i).trim());
        if (row[i] === ',') i++;
      }
    }
    return values;
  }

  /**
   * Parse HubSpot tickets CSV.
   * @param {string} csvText
   * @returns {{ tickets: Array, errors: Array }}
   */
  function parseHubspotCsv(csvText) {
    var tickets = [];
    var errors = [];
    if (!csvText || typeof csvText !== 'string') {
      return { tickets: [], errors: [] };
    }
    try {
      var lines = csvText.split(/\r?\n/).filter(function (l) { return l.length > 0; });
      if (lines.length < 2) return { tickets: [], errors: [] };
      var headerRow = parseCsvRow(lines[0]);
      var headers = headerRow.map(function (h) { return h.replace(/^"|"$/g, '').trim(); });
      for (var i = 1; i < lines.length; i++) {
        var values = parseCsvRow(lines[i]);
        var obj = {};
        headers.forEach(function (h, idx) {
          obj[h] = values[idx] !== undefined ? String(values[idx]).trim() : '';
        });
        var ticketId = obj['Ticket ID'] || obj['Ticket Id'] || '';
        var ticketName = obj['Ticket name'] || obj['Ticket Name'] || '';
        var pipeline = obj['Pipeline'] || '';
        var status = obj['Ticket status'] || obj['Status'] || '';
        var createDate = obj['Create date'] || obj['Create Date'] || obj['Created'] || '';
        var owner = obj['Ticket owner'] || obj['Ticket Owner'] || obj['Owner'] || '';
        var source = obj['Source'] || '';
        var lastActivity = obj['Last activity date'] || obj['Last Activity Date'] || '';
        if (!ticketId && !ticketName) continue;
        tickets.push({
          ticketId: ticketId,
          ticketName: ticketName,
          ticketType: extractTicketType(ticketName),
          pipeline: pipeline,
          status: status,
          createDate: createDate,
          owner: owner,
          source: source,
          lastActivityDate: lastActivity
        });
      }
    } catch (e) {
      errors.push(e.message || String(e));
    }
    return { tickets: tickets, errors: errors };
  }

  window.App = window.App || {};
  window.App.hubspotTicketParser = {
    parseHubspotCsv: parseHubspotCsv,
    extractTicketType: extractTicketType
  };
})();
