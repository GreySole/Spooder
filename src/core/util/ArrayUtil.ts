// Turning a wired value into an array, shared by the array operation nodes and the array
// storage node so they can't disagree about what counts as one.
//
// Arrays reach a graph from a node that produced one (Search & Match's matches, a chat message's
// emotes/tags, a stored value, a plugin output), never from a typed literal. Anything else that
// turns up is treated as a one-item array rather than an error, so a stray string wired in still
// behaves sensibly.
export function toArray(value: any): any[] {
  if (Array.isArray(value)) {
    // Copied: the operation nodes that use this are pure and may be evaluated more than once per
    // run (each consumer of an output re-evaluates it), so mutating the input would corrupt the
    // other consumers' view of it.
    return [...value];
  }
  return value === undefined || value === null || value === '' ? [] : [value];
}
