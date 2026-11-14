import type { ModuleId, Topic } from '../types'

export interface CourseModule {
  id: ModuleId
  title: string
  /** Starting position inferred from the original teaching conversation. Evidence overrides it. */
  position: string
}

export const modules: CourseModule[] = [
  { id: 'A', title: 'Data and expressions', position: 'Practised in reading; basic assignment recently authored' },
  { id: 'B', title: 'Conditions and loops', position: 'Mostly practised with output prediction' },
  { id: 'C', title: 'Functions and data flow', position: 'Can read; moving into independent writing' },
  { id: 'D', title: 'Collections', position: 'Practised; mutation vs reassignment needs spaced review' },
  { id: 'E', title: 'Errors and resources', position: 'Practised conceptually; limited independent writing' },
  { id: 'F', title: 'JSON and modules', position: 'Practised' },
  { id: 'G', title: 'Independent coding', position: 'Priority next; skills emerging' },
  { id: 'H', title: 'Later Python', position: 'Upcoming' },
  { id: 'I', title: 'Claude agents', position: 'After Python foundations' },
  { id: 'J', title: 'Evals and instrumentation', position: 'Later module' },
]

const t = (
  id: string,
  module: ModuleId,
  title: string,
  initialStatus: Topic['initialStatus'],
  objective: string,
  explanation: string,
  prerequisites: string[] = [],
): Topic => ({ id, module, title, initialStatus, objective, explanation, prerequisites })

export const topics: Topic[] = [
  // A. Data and expressions
  t('a-variables', 'A', 'Variables and assignment', 'practised',
    'Read and write a single assignment.',
    'name = value makes the name refer to the value. The right side is worked out first, then the name is attached to the result.'),
  t('a-types', 'A', 'Basic types', 'practised',
    'Tell int, float, str, bool and None apart.',
    'Every value has a type. 3 is an int, 3.0 is a float, "3" is a str, True is a bool, and None means "no value". type(x) tells you which one you have.',
    ['a-variables']),
  t('a-arithmetic', 'A', 'Arithmetic and division', 'practised',
    'Predict the type and value of an arithmetic expression.',
    '/ always gives a float, so 10 / 2 is 5.0. // gives the whole-number part. Mixing an int with a float gives a float.',
    ['a-types']),
  t('a-strings', 'A', 'Strings and indexing', 'practised',
    'Index into strings and lists.',
    'Positions start at 0. text[0] is the first character and items[-1] is the last item.',
    ['a-types']),
  t('a-literals', 'A', 'List and dict literals', 'practised',
    'Read a list or dictionary written out in code.',
    '[1, 2] is a list: values in order. {"name": "B1"} is a dictionary: each key is paired with a value.',
    ['a-types']),

  // B. Conditions and loops
  t('b-conditions', 'B', 'if / elif / else', 'practised',
    'Choose one branch from several conditions.',
    'Python tests the conditions from the top and runs the first branch that is true. else runs only when none were true.',
    ['a-types']),
  t('b-boolean', 'B', 'and, or, not', 'practised',
    'Predict a combined condition.',
    'not applies only to the thing directly after it and is worked out before and, which is worked out before or. Use parentheses to change that.',
    ['b-conditions']),
  t('b-comparison', 'B', 'in, is and ==', 'practised',
    'Pick the right comparison.',
    '== asks whether two values are equal. is asks whether they are the very same object. in asks whether something is inside a collection.',
    ['b-conditions']),
  t('b-for', 'B', 'for loops and the loop variable', 'practised',
    'Trace a for loop and say where its variable comes from.',
    'for name in collection: creates the name itself. On each pass Python assigns the next item to it. Any name works; nothing has to define it first.',
    ['a-literals']),
  t('b-while', 'B', 'while, break and continue', 'practised',
    'Trace a while loop, including break and continue.',
    'while repeats as long as its condition is true. break leaves the loop. continue jumps straight back to the condition and skips the rest of the body, including any increment below it.',
    ['b-for']),
  t('b-loop-else', 'B', 'for ... else', 'review',
    'Say when the else of a loop runs.',
    'The else of a loop runs when the loop finished without hitting break. It has nothing to do with the if inside the loop.',
    ['b-while']),

  // C. Functions and data flow
  t('c-def', 'C', 'Defining functions', 'practised',
    'Write a def line with parameters.',
    'def name(parameters): starts a function. The indented lines below are its body. Nothing runs until the function is called.',
    ['a-variables']),
  t('c-args', 'C', 'Arguments and ** unpacking', 'practised',
    'Match arguments to parameters.',
    'Positional arguments are matched in order; keyword arguments by name. f(**d) passes each key of the dictionary d as a keyword argument.',
    ['c-def']),
  t('c-return', 'C', 'return versus print', 'review',
    'Say what a call gives back.',
    'return sends a value back to the caller and ends the function. print only displays text. A function with no return gives back None.',
    ['c-def']),
  t('c-scope', 'C', 'Scope', 'untested',
    'Say which names a function can see.',
    'Names assigned inside a function are local to that call. Assigning to a parameter inside the function does not change the caller\'s variable.',
    ['c-def']),

  // D. Collections
  t('d-iteration', 'D', 'Iterating lists and dicts', 'practised',
    'Loop over a list or a dictionary.',
    'Looping over a dictionary gives its keys. .values() gives the values and .items() gives key, value pairs.',
    ['b-for']),
  t('d-dict-access', 'D', 'Safe dictionary lookups', 'practised',
    'Look up a key that might be missing.',
    'd[key] raises KeyError when the key is missing. d.get(key) gives None instead, or a default you choose. key in d checks the keys, never the values.',
    ['a-literals']),
  t('d-identity', 'D', 'List identity and aliases', 'review',
    'Tell one list with two names from two equal lists.',
    'b = a does not copy. Both names refer to the same list, so a change through one shows through the other. list(a) makes a separate copy.',
    ['a-literals']),
  t('d-mutation', 'D', 'Mutation versus reassignment', 'review',
    'Predict whether the caller\'s list changes.',
    'a.append(x) and a += [x] change the existing list. a = a + [x] builds a new list and points the name a at it, leaving the original untouched.',
    ['d-identity', 'c-scope']),
  t('d-comprehension', 'D', 'Comprehensions and generators', 'practised',
    'Read a list comprehension.',
    '[f(x) for x in items if test(x)] builds a new list in one expression. It is a loop written inside brackets.',
    ['d-iteration']),

  // E. Errors and resources
  t('e-exceptions', 'E', 'try / except / else / finally', 'practised',
    'Trace which blocks run when an error happens.',
    'An except block runs only if its exception type matches. else runs when there was no error. finally always runs, but it does not handle the error: an unmatched error carries on upwards afterwards.',
    ['c-def']),
  t('e-raise', 'E', 'raise and "as exc"', 'practised',
    'Raise an error and inspect a caught one.',
    'raise ValueError("message") signals an error. except ValueError as exc: gives you the error object so you can read its message.',
    ['e-exceptions']),
  t('e-files', 'E', 'with, open and file modes', 'practised',
    'Predict a file\'s content after writes.',
    'Mode "w" empties the file once, when it is opened. Every write after that adds to it. Mode "a" keeps what is there and adds to the end. with closes the file for you.',
    ['e-exceptions']),
  t('e-imports', 'E', 'import, from and as', 'practised',
    'Use a name from another module.',
    'import runs the other file once and gives you its names. A second import of the same module reuses the first result.',
    ['c-def']),

  // F. JSON and modules
  t('f-json', 'F', 'json dump and load', 'practised',
    'Save and load data as JSON.',
    'json.dump writes Python data to a file; json.load reads it back. dumps and loads do the same with a string instead of a file.',
    ['e-files']),
  t('f-nested', 'F', 'Nested data and JSON types', 'practised',
    'Trace a lookup through nested data.',
    'JSON text becomes Python data: objects become dicts, arrays become lists, true/false/null become True/False/None. Follow a nested lookup one step at a time.',
    ['d-dict-access']),
  t('f-modules', 'F', 'Modules and separate processes', 'review',
    'Say what importing does and does not share.',
    'Importing runs a file inside your own process. It never connects you to another running program: two processes have separate memory and share data only through files or other channels.',
    ['e-imports']),

  // G. Independent coding
  t('g-write-function', 'G', 'Write a function from a requirement', 'untested',
    'Turn a plain-English requirement into a working function.',
    'Start with the def line, decide what goes in and what must come back, then build the body. Check where return sits.',
    ['c-return', 'b-conditions']),
  t('g-loop-records', 'G', 'Combine loops and function calls', 'untested',
    'Call your own function for each item and use the result.',
    'A call is an expression: result = check(item) stores what the function returned. Inside a loop, call it once per item.',
    ['g-write-function', 'b-for']),
  t('g-debug', 'G', 'Read tracebacks and fix code', 'untested',
    'Use an error message to find and fix the fault.',
    'Read a traceback from the bottom: the last line names the error, the lines above say where it happened.',
    ['g-write-function']),
  t('g-project', 'G', 'A small multi-file project', 'untested',
    'Build a small program across more than one file.',
    'Split the work into small functions, import what you need, and handle bad input where it enters the program.',
    ['g-loop-records', 'f-json', 'e-exceptions']),

  // H. Later Python
  t('h-classes', 'H', 'Classes and methods', 'later', 'Define a class with methods.', 'Planned. Not yet introduced.'),
  t('h-annotations', 'H', 'Type annotations', 'later', 'Read and write type hints.', 'Planned. Not yet introduced.'),
  t('h-generators', 'H', 'Generators in depth', 'later', 'Write a generator function.', 'Planned. Not yet introduced.'),
  t('h-async', 'H', 'async and await', 'later', 'Read asynchronous code.', 'Planned. Not yet introduced.'),
  t('h-testing', 'H', 'Testing and logging', 'later', 'Write tests and log messages.', 'Planned. Not yet introduced.'),

  // I. Claude agents
  t('i-message-shape', 'I', 'Message, content list and blocks', 'review',
    'Tell the whole response from its content list and its typed blocks.',
    'A response is one Message. Its content is a list of blocks. Each block has a type, such as text or tool_use. Nothing splits the response into blocks for you: you loop over response.content.',
    ['d-iteration', 'f-nested']),
  t('i-tool-defs', 'I', 'Tool definitions and input schemas', 'later', 'Describe a tool to the model.', 'Planned. To be grounded in the current official Tool Use documentation.'),
  t('i-tool-loop', 'I', 'The tool-use loop', 'later',
    'Explain tool_use_id, tool_result, stop_reason and the outer while loop.',
    'Planned. Includes the bug noticed in the learner\'s own agent: appending the assistant response once before the while loop instead of after every tool-use round.'),
  t('i-tool-errors', 'I', 'Tool errors and instrument safety', 'later', 'Handle is_error and unsafe requests.', 'Planned. Not yet introduced.'),

  // J. Evals and instrumentation
  t('j-evals', 'J', 'Eval datasets and grading', 'later', 'Design a small eval for tool selection and inputs.', 'Planned. Not yet introduced.'),
  t('j-observability', 'J', 'Failure taxonomy and observability', 'later', 'Classify agent failures and record them.', 'Planned. Not yet introduced.'),
]

export const topicById = new Map(topics.map((topic) => [topic.id, topic]))
