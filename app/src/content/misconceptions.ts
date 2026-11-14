/** Friction points observed in the original teaching conversation (brief section 4). */
export interface Misconception {
  id: string
  concept: string
  /** The mistaken assumption, in the learner's terms. */
  assumption: string
  explanation: string
  topicId: string
  /** A 1–3 minute recall exercise. */
  recallExerciseId: string
  /** A later exercise where the learner writes or repairs code. */
  codingExerciseId: string
  card: { front: string; back: string }
}

export const misconceptions: Misconception[] = [
  {
    id: 'loop-variables', concept: 'Loop variables', topicId: 'b-for',
    assumption: 'The loop variable ("reading") must already be defined, perhaps by a library.',
    explanation: 'The for line creates the variable. Python assigns the next item to it on each pass. Any name works.',
    recallExerciseId: 'loop-var-trace', codingExerciseId: 'loop-own-variable-write',
    card: { front: 'In "for reading in readings:", where is reading defined?', back: 'By the for line itself. Python assigns the next item to it on each pass. It is an ordinary name; any name works.' },
  },
  {
    id: 'claude-response-shape', concept: 'Claude response shape', topicId: 'i-message-shape',
    assumption: 'for chops the whole response into pieces automatically.',
    explanation: 'A response is one Message. Its content is a list of typed blocks. You get blocks only by looping over response.content.',
    recallExerciseId: 'response-content-predict', codingExerciseId: 'text-blocks-write',
    card: { front: 'A Claude response arrives. Where are the text and tool_use blocks, and how do you reach them?', back: 'In the list response.content. The response itself is one Message object; you loop over response.content and check each block\'s type.' },
  },
  {
    id: 'loop-control', concept: 'Loop control', topicId: 'b-for',
    assumption: 'A for loop runs once, or an if inside it stops further rounds.',
    explanation: 'The body runs once per item. An if only decides what happens on that pass; it does not end the loop.',
    recallExerciseId: 'loop-count-predict', codingExerciseId: 'halvings-write',
    card: { front: 'A for loop over 4 items contains an if that is true for 2 of them. How many times does the loop body run?', back: 'Four times: once per item. The if only decides what happens inside each pass.' },
  },
  {
    id: 'return-vs-print', concept: 'Return versus print', topicId: 'c-return',
    assumption: 'Printing inside a function sends the value back to the caller.',
    explanation: 'print only displays text. return hands a value back. Without return, a call gives None.',
    recallExerciseId: 'print-vs-return-predict', codingExerciseId: 'print-return-fix',
    card: { front: 'A function prints its result and has no return. What does x = f() store in x?', back: 'None. print only displays; only return sends a value back to the caller.' },
  },
  {
    id: 'return-placement', concept: 'Return placement', topicId: 'c-return',
    assumption: 'A return below a for line just ends that iteration.',
    explanation: 'return ends the whole function immediately. Inside a loop body it stops the loop on that pass.',
    recallExerciseId: 'early-return-predict', codingExerciseId: 'return-placement-fix',
    card: { front: 'What happens when return runs inside a for loop?', back: 'The whole function ends at once and no further items are visited. To return after the loop, line return up with the for.' },
  },
  {
    id: 'continue-in-while', concept: 'continue in while', topicId: 'b-while',
    assumption: 'continue skips the value and moves to the next one automatically.',
    explanation: 'continue jumps back to the while test and skips the rest of the body, including any increment below it.',
    recallExerciseId: 'while-continue-choice', codingExerciseId: 'while-continue-fix',
    card: { front: 'In a while loop, the increment x = x + 1 sits below a continue. What goes wrong?', back: 'continue skips the increment, so x never changes and the loop repeats forever. A while loop changes nothing unless your code does.' },
  },
  {
    id: 'for-else', concept: 'for ... else', topicId: 'b-loop-else',
    assumption: 'The else runs whenever the if condition is false.',
    explanation: 'The else belongs to the loop. It runs when the loop finishes without break.',
    recallExerciseId: 'for-else-predict', codingExerciseId: 'first-over-write',
    card: { front: 'When does the else of a for loop run?', back: 'When the loop used up all its items without hitting break. It is skipped after a break.' },
  },
  {
    id: 'boolean-order', concept: 'Boolean order', topicId: 'b-boolean',
    assumption: 'not negates everything that follows it.',
    explanation: 'not applies only to the next item. not a or b means (not a) or b.',
    recallExerciseId: 'not-order-predict', codingExerciseId: 'in-range-write',
    card: { front: 'How does Python read "not a or b"?', back: 'As (not a) or b. not applies only to what directly follows it. Write not (a or b) to negate both.' },
  },
  {
    id: 'dictionary-membership', concept: 'Dictionary membership', topicId: 'd-dict-access',
    assumption: 'in checks a dictionary\'s values.',
    explanation: 'in checks the keys. Use .values() to search the values, and guard d[key] to avoid KeyError.',
    recallExerciseId: 'dict-membership-predict', codingExerciseId: 'mass-of-write',
    card: { front: 'masses = {"B1": 10.2}. What is 10.2 in masses?', back: 'False. in checks the keys. 10.2 in masses.values() is True.' },
  },
  {
    id: 'list-identity', concept: 'List identity', topicId: 'd-identity',
    assumption: 'Two names mean two separate lists.',
    explanation: 'b = a gives one list two names. list(a) makes a separate copy. is tests identity, == tests contents.',
    recallExerciseId: 'alias-predict', codingExerciseId: 'with-extra-write',
    card: { front: 'a = [1, 2]; b = a; b.append(3). What is a, and why?', back: '[1, 2, 3]. b = a does not copy: both names refer to the same list. Use list(a) for a separate copy.' },
  },
  {
    id: 'mutation-vs-reassignment', concept: 'Mutation versus reassignment', topicId: 'd-mutation',
    assumption: 'append, += and + are interchangeable.',
    explanation: 'append and += change the existing list. a = a + [x] builds a new list and re-points the name.',
    recallExerciseId: 'list-ops-predict', codingExerciseId: 'add-reading-fix',
    card: { front: 'Inside a function, which of these changes the caller\'s list: a = a + [3], a += [3], a.append(3)?', back: 'a += [3] and a.append(3) change the list itself. a = a + [3] builds a new list and only re-points the local name.' },
  },
  {
    id: 'data-types', concept: 'Data types', topicId: 'f-nested',
    assumption: 'Dictionary keys and values, or JSON and Python types, are the same thing.',
    explanation: 'Keys label values. JSON is text; after json.loads you have dicts, lists, True/False and None.',
    recallExerciseId: 'nested-json-predict', codingExerciseId: 'unit-of-write',
    card: { front: 'What do JSON true, null, an object and an array become after json.loads?', back: 'True, None, a dict and a list. The JSON itself is a str until it is loaded.' },
  },
  {
    id: 'exceptions', concept: 'Exceptions', topicId: 'e-exceptions',
    assumption: 'finally handles the error, and any except catches any error.',
    explanation: 'An except runs only when its type matches. finally always runs but does not stop the error.',
    recallExerciseId: 'try-finally-predict', codingExerciseId: 'to-float-write',
    card: { front: 'A KeyError happens in a try that has "except ValueError" and "finally". What runs, and where does the error go?', back: 'The except does not match, so it is skipped. finally runs, then the KeyError carries on to the caller. finally does not handle errors.' },
  },
  {
    id: 'file-writing', concept: 'File writing', topicId: 'e-files',
    assumption: 'Mode "w" erases the file on every .write call.',
    explanation: '"w" empties the file once, when it is opened. "a" keeps the content and adds to the end.',
    recallExerciseId: 'file-modes-predict', codingExerciseId: 'log-lines-write',
    card: { front: 'When does open(path, "w") erase the file?', back: 'Once, at the moment it is opened. Writes after that accumulate. Use "a" to keep earlier content across opens.' },
  },
  {
    id: 'python-import', concept: 'Python import', topicId: 'f-modules',
    assumption: 'Importing a variable connects you to the live value in another running process.',
    explanation: 'import runs the file inside your own process. Separate processes never share memory.',
    recallExerciseId: 'import-once-predict', codingExerciseId: 'threshold-import-write',
    card: { front: 'viewer.py does "from agent import messages" while agent.py runs elsewhere. Does it see the agent\'s live list?', back: 'No. Import runs agent.py again inside the viewer\'s own process. Two processes share data only through something external, such as a file.' },
  },
  {
    id: 'independent-writing', concept: 'Independent writing', topicId: 'g-write-function',
    assumption: 'for, as, = and call syntax get mixed up when writing from a blank page.',
    explanation: 'Build up in steps: one assignment, then an if, then wrap it in def. A def line has no =; return is followed by the value.',
    recallExerciseId: 'def-syntax-fix', codingExerciseId: 'count-high-write',
    card: { front: 'Write the first line of a function named count_high that takes measurements.', back: 'def count_high(measurements):\n\nNo = sign, parentheses around the parameter, colon at the end.' },
  },
  {
    id: 'formatting-precision', concept: 'Formatting precision', topicId: 'a-arithmetic',
    assumption: 'A closing quote, a colon, indentation or a trailing .0 is easy to drop.',
    explanation: 'These are typing slips, tracked separately from understanding. / always gives a float, so 10 / 2 prints 5.0.',
    recallExerciseId: 'float-division-predict', codingExerciseId: 'syntax-slips-fix',
    card: { front: 'What does print(10 / 2) show?', back: '5.0. / always gives a float, even when the division is exact. 10 // 2 gives 5.' },
  },
]

export const misconceptionById = new Map(misconceptions.map((m) => [m.id, m]))
