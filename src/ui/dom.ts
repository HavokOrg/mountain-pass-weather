type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | undefined>;

/**
 * Create an element safely. Strings become text nodes and are never parsed as HTML,
 * so untrusted API data can't inject markup or script. Event handlers must be
 * attached with addEventListener; inline on* attributes are rejected (and the
 * CSP would block them anyway).
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  for (const [name, value] of Object.entries(attrs)) {
    if (value === undefined || value === false) continue;
    if (/^on/i.test(name)) throw new Error(`h(): use addEventListener instead of "${name}"`);
    const text = value === true ? '' : String(value);
    if ((name === 'href' || name === 'src') && /^\s*(javascript|data|vbscript):/i.test(text)) {
      throw new Error(`h(): refusing unsafe ${name} URL`);
    }
    el.setAttribute(name, text);
  }

  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }

  return el;
}
