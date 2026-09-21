// Escaping for everything user-authored that ends up in generated markup. The
// DSL text is untrusted (models are shared as .cme files), so every renderer
// goes through these two functions.

/** Escape text for use as HTML/SVG element content. */
export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Escape text for use inside a double-quoted attribute value. Newlines become
 * character references: an XML parser normalises a literal newline inside an
 * attribute to a space, which would flatten multi-line tooltips in exported SVG.
 */
export function escAttr(s: string): string {
  return esc(s).replace(/"/g, '&quot;').replace(/\n/g, '&#10;');
}
