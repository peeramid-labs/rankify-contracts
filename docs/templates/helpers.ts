import { HelperOptions, Utils } from 'handlebars';

/**
 * Returns a Markdown heading marker. An optional number increases the heading level.
 *
 *    Input                  Output
 *    {{h}} {{name}}         # Name
 *    {{h 2}} {{name}}       ## Name
 */
export function h(opts: HelperOptions): string;
export function h(hsublevel: number, opts: HelperOptions): string;
export function h(hsublevel: number | HelperOptions, opts?: HelperOptions) {
  const { hlevel } = getHLevel(hsublevel, opts);
  return new Array(hlevel).fill('#').join('');
}

/**
 * Delineates a section where headings should be increased by 1 or a custom number.
 *
 *    {{#hsection}}
 *    {{>partial-with-headings}}
 *    {{/hsection}}
 */
export function hsection(opts: HelperOptions): string;
export function hsection(hsublevel: number, opts: HelperOptions): string;
export function hsection(this: unknown, hsublevel: number | HelperOptions, opts?: HelperOptions) {
  let hlevel;
  ({ hlevel, opts } = getHLevel(hsublevel, opts));
  opts.data = Utils.createFrame(opts.data);
  opts.data.hlevel = hlevel;
  return opts.fn(this as unknown, opts);
}

/**
 * Helper for dealing with the optional hsublevel argument.
 */
function getHLevel(hsublevel: number | HelperOptions, opts?: HelperOptions) {
  if (typeof hsublevel === 'number') {
    opts = opts!;
    hsublevel = Math.max(1, hsublevel);
  } else {
    opts = hsublevel;
    hsublevel = 1;
  }
  const contextHLevel: number = opts.data?.hlevel ?? 0;
  return { opts, hlevel: contextHLevel + hsublevel };
}

export function trim(text: string) {
  if (typeof text === 'string') {
    return text.trim();
  }
}

export function toLowerCase(text: string) {
  return text.toLowerCase();
}

export function joinLines(text?: string) {
  if (typeof text === 'string') {
    return text.replace(/\n+/g, ' ');
  }
}

export function transformDev(comment: string): string {
  // Split the comment into lines
  const lines = comment?.split('\n') ?? [];

  // Initialize variables to store the transformed text
  let transformedText = '';
  let isWarning = false;
  let isFirstNotice = true;
  let noticeBlock = '';

  // Iterate over each line
  lines.forEach(line => {
    const trimmedLine = line.trim();

    // Check if the line starts with WARNING:
    if (trimmedLine.startsWith('WARNING:')) {
      // Add the WARNING prefix
      if (noticeBlock) {
        transformedText += `\n\n!!! NOTICE\n\n\t${noticeBlock.trim().replace(/\n/g, '\n\t')}`;
        noticeBlock = '';
      }
      transformedText += `\n\n!!! WARNING\n\n\t${trimmedLine.replace('WARNING:', '').trim()}`;
      isWarning = true;
    } else if (trimmedLine) {
      // Add the line to the NOTICE block
      if (isWarning) {
        transformedText += `\n\t${trimmedLine}`;
      } else {
        noticeBlock += `\n${trimmedLine}`;
      }
    } else {
      // Handle empty lines
      if (noticeBlock) {
        transformedText += `\n\n!!! NOTICE\n\n\t${noticeBlock.trim().replace(/\n/g, '\n\t')}`;
        noticeBlock = '';
      }
      isWarning = false;
    }
  });

  // Add any remaining notice block
  if (noticeBlock) {
    transformedText += `\n\n!!! NOTICE\n\n\t${noticeBlock.trim().replace(/\n/g, '\n\t')}`;
  }

  // Return the transformed text
  return transformedText.trim();
}

export const isVisible = (type: string) => {
  return type !== 'internal' && type !== 'private';
};

export const substituteAnchors = (text: string) => {
  if (typeof text === 'string') {
    return text.replace(/{([^}]+)}/g, (match: string, p1: string) => {
      // Split the reference into parts
      const parts = p1.split('.');
      const anchor = parts.length > 1 ? `#${parts.slice(1).join('.').toLocaleLowerCase()}` : '';
      const reference = parts[0];
      const displayText = reference.charAt(0).toUpperCase() + reference.slice(1);

      // Handle different depth levels
      const path = reference.startsWith('../') ? reference : `./${reference}`;

      return `[${displayText}${anchor}](../${path}${anchor})`;
    });
  }
  return text;
};
