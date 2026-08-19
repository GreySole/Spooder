// Chat command matching, shared by the Chat Command trigger (which fires on it) and the Chat
// Command operation node (which reports it for text of your choosing). Kept import-free for the
// same reason as SearchMatchUtil: both the event pipeline and OperationNodeService reach it, and
// a shared module between those two is a cycle waiting to happen.
//
// Matching is by prefix rather than by whole word, which is what the chat trigger has always
// done - it's the only thing that lets a command be several words ('don therecluse').
export interface CommandMatch {
  matched: boolean;
  // Whitespace-separated words following the command, empty when it didn't match.
  args: string[];
}

export function matchCommand(command: string, text: string): CommandMatch {
  // Trimmed so a command typed with a trailing space still lines up with the message.
  const trimmed = String(command ?? '').trim();
  const message = String(text ?? '');
  if (trimmed === '' || !message.toLowerCase().startsWith(trimmed.toLowerCase())) {
    return { matched: false, args: [] };
  }
  const rest = message.slice(trimmed.length).trim();
  return { matched: true, args: rest === '' ? [] : rest.split(/\s+/) };
}
