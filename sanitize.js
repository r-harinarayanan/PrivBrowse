/**
 * PrivBrowse — Stage 2: Local PII Filtering Module
 * 
 * SIH 2026, PS ID SIH26171 | Team: Breaking Bad
 */

(function (globalScope) {
  'use strict';

  // Core regular expressions for PII detection
  const PII_PATTERNS = {
    // Indian Aadhaar: 12 digits with optional spaces or dashes
    aadhaar: {
      regex: /\b[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}\b/g,
      label: '[REDACTED_AADHAAR]',
      description: 'Indian Aadhaar Number'
    },
    // Indian PAN: 5 uppercase letters, 4 digits, 1 uppercase letter
    pan: {
      regex: /\b[A-Z]{5}[0-9]{4}[A-Z]{1}\b/g,
      label: '[REDACTED_PAN]',
      description: 'Indian Permanent Account Number (PAN)'
    },
    // Standard Email Addresses
    email: {
      regex: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
      label: '[REDACTED_EMAIL]',
      description: 'Email Address'
    },
    // Phone numbers (Indian 10-digit mobile with optional +91/0, and standard intl formats)
    phoneIndia: {
      regex: /\b(?:\+91|0)?[6-9]\d{9}\b/g,
      label: '[REDACTED_PHONE]',
      description: 'Indian Mobile Number'
    },
    phoneIntl: {
      regex: /\b(?:\+?1[-.\s]?)?\(?[2-9]\d{2}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
      label: '[REDACTED_PHONE]',
      description: 'International / US Phone Number'
    },
    // US SSN / Generic 9-digit format
    ssn: {
      regex: /\b\d{3}-\d{2}-\d{4}\b/g,
      label: '[REDACTED_SSN]',
      description: 'Social Security / National ID Number'
    },
    // Credit / Debit card patterns (16 digits with spaces or hyphens)
    creditCard: {
      regex: /\b(?:\d{4}[ -]?){3}\d{4}\b/g,
      label: '[REDACTED_CARD]',
      description: 'Payment Card Number'
    }
  };

  const DEFAULT_DENYLIST = ['Aarav', 'Sharma', 'Priya', 'Rahul', 'Sneha'];

  function sanitizeText(text, denylist = DEFAULT_DENYLIST) {
    if (!text || typeof text !== 'string') {
      const empty = new String('');
      empty.sanitized = '';
      empty.redactionCount = 0;
      empty.detectedTypes = [];
      return empty;
    }

    let sanitized = text;
    let redactionCount = 0;
    const detectedTypes = new Set();

    // 1. Run Regex Patterns
    for (const [key, rule] of Object.entries(PII_PATTERNS)) {
      const matches = sanitized.match(rule.regex);
      if (matches && matches.length > 0) {
        redactionCount += matches.length;
        detectedTypes.add(rule.description);
        sanitized = sanitized.replace(rule.regex, rule.label);
      }
    }

    // 2. Denylist Matching
    if (Array.isArray(denylist) && denylist.length > 0) {
      for (const item of denylist) {
        if (!item || typeof item !== 'string' || item.trim().length < 3) continue;
        const escaped = item.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const nameRegex = new RegExp(`\\b${escaped}\\b`, 'gi');
        const matches = sanitized.match(nameRegex);
        if (matches && matches.length > 0) {
          redactionCount += matches.length;
          detectedTypes.add('User Denylist Name');
          sanitized = sanitized.replace(nameRegex, '[REDACTED_NAME]');
        }
      }
    }

    // Return hybrid String object supporting both result.includes(...) and result.sanitized
    const res = new String(sanitized);
    res.sanitized = sanitized;
    res.redactionCount = redactionCount;
    res.detectedTypes = Array.from(detectedTypes);
    return res;
  }

  function sanitizeSkeleton(skeleton, denylist = DEFAULT_DENYLIST) {
    if (!Array.isArray(skeleton)) {
      return { sanitizedSkeleton: [], skeleton: [], stats: { elementsScanned: 0, redactionsCount: 0, detectedTypes: [] }, redactedCount: 0 };
    }

    let totalRedactions = 0;
    const allDetectedTypes = new Set();

    const sanitized = skeleton.map((el) => {
      const sanitizedEl = { ...el };
      const textFields = ['label', 'placeholder', 'ariaLabel', 'name', 'id', 'title'];

      for (const field of textFields) {
        if (sanitizedEl[field] && typeof sanitizedEl[field] === 'string') {
          const before = sanitizedEl[field];
          const after = sanitizeText(before, denylist);
          sanitizedEl[field] = after.toString();
          if (after.toString() !== before) totalRedactions += (after.redactionCount || 1);
          if (after.detectedTypes) after.detectedTypes.forEach(t => allDetectedTypes.add(t));
        }
      }

      if (Array.isArray(sanitizedEl.options)) {
        sanitizedEl.options = sanitizedEl.options.map((opt) => {
          if (typeof opt === 'string') {
            const after = sanitizeText(opt, denylist);
            if (after.toString() !== opt) totalRedactions++;
            return after.toString();
          }
          const optText = sanitizeText(opt.text || '', denylist);
          const optVal = sanitizeText(opt.value || '', denylist);
          return { text: optText.toString(), value: optVal.toString() };
        });
      }

      return sanitizedEl;
    });

    const blinded = blindStructuralSkeleton(sanitized);

    return {
      sanitizedSkeleton: blinded,
      skeleton: blinded,
      stats: {
        elementsScanned: skeleton.length,
        redactionsCount: totalRedactions,
        detectedTypes: Array.from(allDetectedTypes)
      },
      redactedCount: totalRedactions
    };
  }

  // Contextual metadata anonymization: maps sensitive structural label hints into generic blind tokens
  const SENSITIVE_LABEL_KEYWORDS = [
    { pattern: '\\b(?:aadhaar|uidai|unique id)\\b', blindToken: '[GOV_ID_INPUT]' },
    { pattern: '\\b(?:pan card|permanent account|pan)\\b', blindToken: '[TAX_ID_INPUT]' },
    { pattern: '\\b(?:ssn|social security)\\b', blindToken: '[NATIONAL_ID_INPUT]' },
    { pattern: '\\b(?:passport|voter id|driving license)\\b', blindToken: '[OFFICIAL_ID_INPUT]' },
    { pattern: '\\b(?:credit card|debit card|cvv|expiry|bank account)\\b', blindToken: '[FINANCIAL_DATA_INPUT]' }
  ];

  function blindStructuralSkeleton(skeleton) {
    if (!Array.isArray(skeleton)) return [];
    return skeleton.map(el => {
      const copy = { ...el };
      for (const field of ['label', 'placeholder', 'ariaLabel', 'name', 'title']) {
        if (copy[field] && typeof copy[field] === 'string') {
          for (const rule of SENSITIVE_LABEL_KEYWORDS) {
            copy[field] = copy[field].replace(new RegExp(rule.pattern, 'gi'), rule.blindToken);
          }
        }
      }
      return copy;
    });
  }

  const PrivBrowseSanitizer = {
    PII_PATTERNS,
    DEFAULT_DENYLIST,
    SENSITIVE_LABEL_KEYWORDS,
    sanitizeText,
    sanitizeSkeleton,
    blindStructuralSkeleton
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = PrivBrowseSanitizer;
  }

  globalScope.PrivBrowseSanitizer = PrivBrowseSanitizer;
  globalScope.sanitizeSkeleton = sanitizeSkeleton;
  globalScope.sanitizeText = sanitizeText;
  globalScope.DEFAULT_DENYLIST = DEFAULT_DENYLIST;

})(typeof self !== 'undefined' ? self : this);
