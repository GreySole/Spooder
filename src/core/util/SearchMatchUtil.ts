// The search-and-match pattern language, as a pure function of (pattern, text).
//
// Extracted from checkResponseTrigger so the Chat Search & Match trigger and the Search & Match
// operation node run the exact same matcher rather than two drifting copies. Deliberately free
// of imports: it's reached from both the event pipeline and OperationNodeService, and a shared
// module between those two is a cycle waiting to happen.
//
// A pattern is a sequence of word slots, matched in order but not necessarily adjacently:
//   word    a literal word
//   *       any single word
//   *word   skip forward through the text until `word` matches, and continue from there
//   >pre    a word starting with 'pre'
//   <suf    a word ending with 'suf'
//   a|b|>c  any of several alternatives (each of which may itself use > or <)
// Every slot - literals included - contributes the word it matched to the result.

// Whether one pattern slot accepts one word, returning the word itself so the caller can record
// what was matched (the two differ for wildcards).
function matchConditions(a: string, b: string): string | false {
  if (a.includes('|')) {
    const alternatives = a.split('|');
    for (const alternative of alternatives) {
      if (alternative.startsWith('>')) {
        if (b.startsWith(alternative.replace('>', ''))) {
          return b;
        }
      } else if (alternative.startsWith('<')) {
        if (b.endsWith(alternative.replace('<', ''))) {
          return b;
        }
      } else if (alternative.toLowerCase() == b.toLowerCase()) {
        return b;
      }
    }
    return false;
  } else if (a.startsWith('>')) {
    return b.startsWith(a.replace('>', '')) ? b : false;
  } else if (a.startsWith('<')) {
    return b.endsWith(a.replace('<', '')) ? b : false;
  } else if (a.toLowerCase() == b.toLowerCase()) {
    return b;
  }
  return false;
}

// The pattern's slots. Also drives how many Match output ports a node draws, so the frontend
// splits the pattern exactly this way (see buildSearchMatchOutputs).
export function patternSlots(pattern: string): string[] {
  return pattern
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

// Returns one matched word per pattern slot, or undefined when the text doesn't match.
// The text is lowercased and stripped of punctuation before matching, so the returned words are
// too - that has always been true of this matcher and response scripts depend on it.
export function matchSearchPattern(pattern: string, text: string): string[] | undefined {
  const slots = patternSlots(pattern.toLowerCase());
  if (slots.length === 0) {
    // An empty pattern has nothing to match on. Without this the "all slots filled" test below
    // is trivially true and the pattern would match every message.
    return undefined;
  }

  let matches: (string | false)[] = new Array(slots.length).fill(false);
  const words = text
    .toLowerCase()
    .replaceAll(/[\p{P}\p{S}]/gu, '')
    .split(' ');
  let slotIndex = 0;
  let firstMatchAt = 0;

  for (let w = 0; w < words.length; w++) {
    if (slots[slotIndex] == '*') {
      matches[slotIndex] = words[w];
    } else if (slots[slotIndex].startsWith('*')) {
      // Skip-ahead slot: scan forward for the first word that satisfies it and resume from
      // there, so '*ze warudo' tolerates any number of words before 'ze'.
      for (let n = w; n < words.length; n++) {
        if (matchConditions(slots[slotIndex].substr(1), words[n]) != false) {
          matches[slotIndex] = words[n];
          w = n;
          break;
        }
      }
    } else {
      matches[slotIndex] = matchConditions(slots[slotIndex], words[w]);
    }

    if (matches[slotIndex] != false) {
      if (slotIndex == 0) {
        firstMatchAt = w;
      }
      slotIndex++;
      if (slotIndex == matches.length) {
        break;
      }
    } else {
      // A broken run restarts from just after where this attempt began, so a false start early
      // in the message can't hide a real match later in it.
      if (slotIndex > 0) {
        w = firstMatchAt;
      }
      slotIndex = 0;
      matches = new Array(slots.length).fill(false);
    }
  }

  return slotIndex == matches.length ? (matches as string[]) : undefined;
}
