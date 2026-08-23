// E.164 format: a leading '+', a non-zero country-code digit, then up to
// 14 more digits (max 15 digits total) - e.g. +919876543210. Required so a
// future WhatsApp Business API integration can use the number as-is.
const E164_REGEX = /^\+[1-9]\d{6,14}$/;

function isValidWhatsappNumber(value) {
  return E164_REGEX.test(value);
}

module.exports = { isValidWhatsappNumber };
