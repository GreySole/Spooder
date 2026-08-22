// `${name}` placeholders in a Template node's text.
//
// Names are restricted to word characters because each one becomes a node input port, and a
// port id ends up in a react-hook-form path (`...values.<name>`) where a dot would be read as
// nesting. Anything that isn't a bare word - `${a.b}`, `${}`, `${ x }` - is left in the text
// as literal characters rather than silently becoming a slot the user can't wire.
export const TEMPLATE_SLOT_PATTERN = /\$\{([A-Za-z0-9_]+)\}/g;

// The placeholder names in a template, in first-appearance order and without repeats: one port
// per distinct name, so `${user} likes ${user}` offers a single User input filling both spots.
//
// The frontend derives the node's input ports from the same text (see buildTemplateForm in
// nodeDefLookup.ts) - the pattern above is duplicated there because the WebUI can't import
// backend code, the same arrangement search_match's pattern slots already use.
export function templateSlots(template: string): string[] {
  const slots: string[] = [];
  for (const match of String(template ?? '').matchAll(TEMPLATE_SLOT_PATTERN)) {
    if (!slots.includes(match[1])) {
      slots.push(match[1]);
    }
  }
  return slots;
}

// Substitutes each `${name}` with the value resolved for that input port. An unfilled slot
// becomes empty text rather than the literal 'undefined' - the same rule search_match and the
// chat command args follow, since these strings are usually headed for chat or a prompt.
export function fillTemplate(template: string, values: { [key: string]: any }): string {
  return String(template ?? '').replace(TEMPLATE_SLOT_PATTERN, (_match, name: string) => {
    const value = values?.[name];
    return value === undefined || value === null ? '' : String(value);
  });
}
