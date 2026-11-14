import type { Exercise } from '../types'
import { py } from './py'

const BLOCKS = [
  { type: 'text', text: 'Weighing now.' },
  { type: 'tool_use', id: 'toolu_01', name: 'read_balance', input: { balance: 'B1' } },
  { type: 'text', text: 'Done.' },
]

/** Fix and write exercises. Every solution is run against its tests in content.test.ts. */
export const writeExercises: Exercise[] = [
  {
    id: 'count-high-write', version: 1, order: 10, difficulty: 3, source: 'conversation',
    topicIds: ['g-write-function', 'g-loop-records'], mode: 'write', answer: 'code', misconception: 'independent-writing',
    title: 'count_high',
    prompt: 'Define count_high(measurements), returning the number of elements strictly greater than 11. Then call it with the list measurements and print the result.',
    given: { measurements: [9.5, 10.2, 11.8, 12.4, 10.7, 11.5] },
    tests: [
      { kind: 'call', name: 'empty list gives 0', fn: 'count_high', args: [[]], expect: 0 },
      { kind: 'call', name: 'only values strictly above 11 count', fn: 'count_high', args: [[11, 11.0, 11.01]], expect: 1 },
      { kind: 'call', name: 'all values high', fn: 'count_high', args: [[12, 13]], expect: 2 },
      { kind: 'stdout', name: 'the program prints the count for measurements', expect: '3' },
    ],
    solution: py`
def count_high(measurements):
    count = 0
    for mass in measurements:
        if mass > 11:
            count = count + 1
    return count

print(count_high(measurements))
`,
    hints: [
      'Where will the counter begin?',
      'What loop gives you one mass at a time?',
      'Which indentation level must return use to avoid ending on the first iteration?',
    ],
    explanation: 'Start a counter at 0, visit each mass, add 1 when it is above 11, and return the counter after the loop has finished. The call count_high(measurements) produces the value; print displays it.',
  },
  {
    id: 'check-mass-write', version: 1, order: 30, difficulty: 3, source: 'conversation',
    topicIds: ['g-write-function', 'g-loop-records', 'c-return'], mode: 'write', answer: 'code', misconception: 'independent-writing',
    title: 'check_mass, then use it in a loop',
    prompt: 'Write check_mass(mass) that RETURNS "low" when mass is below 9.5, "ok" from 9.5 up to and including 10.5, and "high" above that. Then loop over measurements and print the status of each one.',
    given: { measurements: [9.2, 10.1, 11.2] },
    tests: [
      { kind: 'call', name: 'below 9.5 is low', fn: 'check_mass', args: [9.0], expect: 'low' },
      { kind: 'call', name: '9.5 is ok', fn: 'check_mass', args: [9.5], expect: 'ok' },
      { kind: 'call', name: '10.5 is ok', fn: 'check_mass', args: [10.5], expect: 'ok' },
      { kind: 'call', name: 'above 10.5 is high', fn: 'check_mass', args: [10.6], expect: 'high' },
      { kind: 'stdout', name: 'one status printed per measurement', expect: 'low\nok\nhigh' },
    ],
    solution: py`
def check_mass(mass):
    if mass < 9.5:
        return "low"
    elif mass <= 10.5:
        return "ok"
    else:
        return "high"

for mass in measurements:
    print(check_mass(mass))
`,
    hints: [
      'Write and test the function first. What should check_mass(9.0) give back?',
      'The function should hand the word back with return. The printing happens in the loop, outside the function.',
      'Inside the loop, call the function with the current item and print what it returns.',
    ],
    explanation: 'The function decides and returns one of three strings. The loop is separate: for each measurement it calls the function and prints the returned status.',
  },
  {
    id: 'def-syntax-fix', version: 1, order: 50, difficulty: 2, source: 'conversation',
    topicIds: ['c-def', 'g-write-function'], mode: 'fix', answer: 'code', misconception: 'independent-writing',
    title: 'Repair the def and return lines',
    prompt: 'This was an earlier attempt at count_high. The loop logic is right. Two lines are not valid Python: the first and the last. Fix those two lines.',
    starterCode: py`
def = count_high(measurements)
    count = 0
    for mass in measurements:
        if mass > 11:
            count = count + 1
    return mass in measurements as result
`,
    tests: [
      { kind: 'call', name: 'empty list gives 0', fn: 'count_high', args: [[]], expect: 0 },
      { kind: 'call', name: 'counts values above 11', fn: 'count_high', args: [[9.5, 11.8, 12.4]], expect: 2 },
    ],
    solution: py`
def count_high(measurements):
    count = 0
    for mass in measurements:
        if mass > 11:
            count = count + 1
    return count
`,
    hints: [
      'A def line has this shape: def name(parameters):',
      '= is for assignment. A def line has no = in it, and it ends with a colon.',
      'return is followed by the value to send back. Which variable holds the answer?',
    ],
    explanation: 'A function starts with def name(parameters): and has no = sign. return is followed directly by the value to hand back, here count. "as" and "in" belong to other statements (import ... as, for ... in).',
  },
  {
    id: 'classify-block-write', version: 1, order: 70, difficulty: 2, source: 'conversation',
    topicIds: ['b-conditions', 'g-write-function'], mode: 'write', answer: 'code', misconception: 'independent-writing',
    title: 'Classify a mass with if / elif / else',
    prompt: 'mass is already defined. Set status to "low" if mass is below 9.5, to "ok" if it is from 9.5 up to and including 10.5, and to "high" otherwise. Then print status. Do not assign mass yourself.',
    given: { mass: 10.2 },
    tests: [
      { kind: 'vars', name: 'mass 9.0 is low', given: { mass: 9.0 }, expectVars: { status: 'low' }, expectStdout: 'low' },
      { kind: 'vars', name: 'mass 9.5 is ok', given: { mass: 9.5 }, expectVars: { status: 'ok' }, expectStdout: 'ok' },
      { kind: 'vars', name: 'mass 10.5 is ok', given: { mass: 10.5 }, expectVars: { status: 'ok' }, expectStdout: 'ok' },
      { kind: 'vars', name: 'mass 10.51 is high', given: { mass: 10.51 }, expectVars: { status: 'high' }, expectStdout: 'high' },
    ],
    solution: py`
if mass < 9.5:
    status = "low"
elif mass <= 10.5:
    status = "ok"
else:
    status = "high"
print(status)
`,
    hints: [
      'Start with one assignment: what should status be when mass is below 9.5?',
      'Each condition line ends with a colon, and the line under it is indented.',
      'By the time Python reaches elif, it already knows mass is not below 9.5. What is left to test?',
    ],
    explanation: 'Python tests the conditions from the top and takes the first true branch. Once mass < 9.5 has failed, the elif only needs to check the upper limit.',
  },
  {
    id: 'return-placement-fix', version: 1, order: 90, difficulty: 2, source: 'conversation',
    topicIds: ['c-return', 'b-for'], mode: 'fix', answer: 'code', misconception: 'return-placement',
    title: 'A total that stops too early',
    prompt: 'total_mass should add up every reading. It gives the wrong answer for lists longer than one item. Fix it.',
    starterCode: py`
def total_mass(readings):
    total = 0
    for reading in readings:
        total = total + reading
        return total
`,
    tests: [
      { kind: 'call', name: 'three readings', fn: 'total_mass', args: [[1, 2, 3]], expect: 6 },
      { kind: 'call', name: 'one reading', fn: 'total_mass', args: [[10.5]], expect: 10.5 },
      { kind: 'call', name: 'empty list gives 0', fn: 'total_mass', args: [[]], expect: 0 },
    ],
    solution: py`
def total_mass(readings):
    total = 0
    for reading in readings:
        total = total + reading
    return total
`,
    hints: [
      'With [1, 2, 3], how many times does the loop body run before the function ends?',
      'return ends the whole function, not one pass of the loop.',
      'Which indentation level puts return after the loop has finished?',
    ],
    explanation: 'return was indented inside the loop, so the function ended during the first pass. Lined up with for, it runs once, after the loop has finished.',
  },
  {
    id: 'print-return-fix', version: 1, order: 120, difficulty: 2, source: 'conversation',
    topicIds: ['c-return'], mode: 'fix', answer: 'code', misconception: 'return-vs-print',
    title: 'A function that prints its answer',
    prompt: 'The last line should print "average is 11.0". At the moment it prints "average is None", with a stray 11.0 above it. Fix the function.',
    starterCode: py`
def average(readings):
    total = 0
    for reading in readings:
        total = total + reading
    print(total / len(readings))

result = average([10, 12])
print("average is", result)
`,
    tests: [
      { kind: 'call', name: 'average of 10 and 12', fn: 'average', args: [[10, 12]], expect: 11.0 },
      { kind: 'call', name: 'average of one value', fn: 'average', args: [[9.5]], expect: 9.5 },
      { kind: 'stdout', name: 'prints only the final line', expect: 'average is 11.0' },
    ],
    solution: py`
def average(readings):
    total = 0
    for reading in readings:
        total = total + reading
    return total / len(readings)

result = average([10, 12])
print("average is", result)
`,
    hints: [
      'What is stored in result at the moment?',
      'Which word sends a value back to the line that called the function?',
    ],
    explanation: 'print inside the function only displays the number. The caller needs the value, so the function must return it. Then result holds 11.0.',
  },
  {
    id: 'while-continue-fix', version: 1, order: 140, difficulty: 3, source: 'conversation',
    topicIds: ['b-while'], mode: 'fix', answer: 'code', misconception: 'continue-in-while', starterHangs: true,
    title: 'A while loop that never ends',
    prompt: 'This should print 0, 1, 3 and 4, skipping 2. Instead it never finishes. Fix it.',
    starterCode: py`
x = 0
while x < 5:
    if x == 2:
        continue
    print(x)
    x = x + 1
`,
    tests: [{ kind: 'stdout', name: 'prints 0, 1, 3, 4', expect: '0\n1\n3\n4' }],
    solution: py`
x = 0
while x < 5:
    if x == 2:
        x = x + 1
        continue
    print(x)
    x = x + 1
`,
    hints: [
      'When x is 2, which lines of the loop body are skipped?',
      'What has to happen to x before the loop goes round again?',
      'The increment must also happen on the pass that skips.',
    ],
    explanation: 'continue skipped the increment, so x stayed at 2 forever. x has to change on every pass, including the one that skips the print.',
  },
  {
    id: 'loop-own-variable-write', version: 1, order: 160, difficulty: 1, source: 'conversation',
    topicIds: ['b-for', 'd-iteration'], mode: 'write', answer: 'code', misconception: 'loop-variables',
    title: 'Choose your own loop variable',
    prompt: 'balances is already defined as a list of dictionaries, each with a "name". Print each name on its own line. Pick any loop variable name you like.',
    given: { balances: [{ name: 'B1', mass: 10.2 }, { name: 'B2', mass: 11.8 }, { name: 'B3', mass: 9.9 }] },
    tests: [{ kind: 'stdout', name: 'prints every name', expect: 'B1\nB2\nB3' }],
    solution: py`
for balance in balances:
    print(balance["name"])
`,
    hints: [
      'A for line has this shape: for name in collection:',
      'Inside the loop your variable is one dictionary. How do you get its "name"?',
    ],
    explanation: 'The for line creates the variable. On each pass it is one dictionary, and ["name"] looks up that entry.',
  },
  {
    id: 'mass-of-write', version: 1, order: 180, difficulty: 2, source: 'conversation',
    topicIds: ['d-dict-access'], mode: 'write', answer: 'code', misconception: 'dictionary-membership',
    title: 'A lookup that cannot fail',
    prompt: 'Write mass_of(masses, name). masses is a dictionary such as {"B1": 10.2}. Return the mass stored under name, or None when that name is not a key. It must never raise KeyError.',
    tests: [
      { kind: 'call', name: 'existing name', fn: 'mass_of', args: [{ B1: 10.2, B2: 11.8 }, 'B2'], expect: 11.8 },
      { kind: 'call', name: 'missing name gives None', fn: 'mass_of', args: [{ B1: 10.2 }, 'B9'], expect: null },
      { kind: 'call', name: 'a value is not a key', fn: 'mass_of', args: [{ B1: 'B2' }, 'B2'], expect: null },
    ],
    solution: py`
def mass_of(masses, name):
    if name in masses:
        return masses[name]
    return None
`,
    hints: [
      'How can you ask whether name is one of the keys?',
      'There is also a dictionary method that does the whole job in one step.',
    ],
    explanation: 'name in masses checks the keys. Guarding the lookup with it avoids KeyError. masses.get(name) does the same in one step.',
  },
  {
    id: 'with-extra-write', version: 1, order: 200, difficulty: 3, source: 'conversation',
    topicIds: ['d-identity', 'd-mutation'], mode: 'write', answer: 'code', misconception: 'list-identity',
    title: 'Add a value without touching the original',
    prompt: 'Write with_extra(readings, value). Return a new list containing everything in readings followed by value. The list passed in must be left unchanged.',
    tests: [
      { kind: 'call', name: 'returns the longer list', fn: 'with_extra', args: [[1, 2], 3], expect: [1, 2, 3] },
      { kind: 'call', name: 'works for an empty list', fn: 'with_extra', args: [[], 5], expect: [5] },
      {
        kind: 'python', name: 'the original list is unchanged',
        code: 'original = [1, 2]\nresult = with_extra(original, 3)\nassert original == [1, 2], "the list passed in was changed"\nassert result is not original, "the same list object was returned"',
      },
    ],
    solution: py`
def with_extra(readings, value):
    return readings + [value]
`,
    hints: [
      'Which operations change an existing list, and which build a new one?',
      'readings + [value] builds a new list. append changes the one you were given.',
    ],
    explanation: 'readings + [value] builds a new list and leaves the original alone. append would change the caller\'s list, because the parameter is another name for it.',
  },
  {
    id: 'add-reading-fix', version: 1, order: 220, difficulty: 3, source: 'conversation',
    topicIds: ['d-mutation'], mode: 'fix', answer: 'code', misconception: 'mutation-vs-reassignment',
    title: 'The reading that never arrives',
    prompt: 'This should print [10.2, 11.8], but it prints [10.2]. Fix add_reading so that it changes the list it is given.',
    starterCode: py`
def add_reading(history, value):
    history = history + [value]

history = [10.2]
add_reading(history, 11.8)
print(history)
`,
    tests: [
      { kind: 'stdout', name: 'prints the updated list', expect: '[10.2, 11.8]' },
      { kind: 'python', name: 'changes the caller\'s list', code: 'h = [1]\nadd_reading(h, 2)\nassert h == [1, 2], "the caller\'s list is still " + repr(h)' },
    ],
    solution: py`
def add_reading(history, value):
    history.append(value)

history = [10.2]
add_reading(history, 11.8)
print(history)
`,
    hints: [
      'history + [value] builds a new list. What happens to that new list when the function ends?',
      'Which operation changes the existing list instead of building another?',
    ],
    explanation: 'history = history + [value] builds a new list and points the local name at it; the caller\'s list is untouched and the new one is lost when the function ends. history.append(value) changes the list the caller passed in.',
  },
  {
    id: 'first-over-write', version: 1, order: 240, difficulty: 3, source: 'conversation',
    topicIds: ['b-loop-else', 'c-return', 'g-write-function'], mode: 'write', answer: 'code', misconception: 'for-else',
    title: 'First reading over a limit',
    prompt: 'Write first_over(readings, limit). Return the first reading that is greater than limit, or None when there is none.',
    tests: [
      { kind: 'call', name: 'returns the first match, not the last', fn: 'first_over', args: [[10, 12, 13], 11], expect: 12 },
      { kind: 'call', name: 'no match gives None', fn: 'first_over', args: [[10, 10.5], 11], expect: null },
      { kind: 'call', name: 'empty list gives None', fn: 'first_over', args: [[], 11], expect: null },
    ],
    solution: py`
def first_over(readings, limit):
    for reading in readings:
        if reading > limit:
            return reading
    return None
`,
    hints: [
      'What should happen as soon as you meet a reading above the limit?',
      'Where does the "nothing found" answer go: inside the loop, or after it?',
    ],
    explanation: 'Returning inside the loop stops at the first match. The return after the loop is reached only when no reading matched.',
  },
  {
    id: 'in-range-write', version: 1, order: 260, difficulty: 2, source: 'conversation',
    topicIds: ['b-boolean', 'g-write-function'], mode: 'write', answer: 'code', misconception: 'boolean-order',
    title: 'Inside the range',
    prompt: 'Write in_range(mass) that returns True when mass is from 9 to 11 inclusive, and False otherwise. Try it once with and, then once in the form not (... or ...). Both should pass.',
    tests: [
      { kind: 'call', name: '10 is inside', fn: 'in_range', args: [10], expect: true },
      { kind: 'call', name: '9 is inside', fn: 'in_range', args: [9], expect: true },
      { kind: 'call', name: '11 is inside', fn: 'in_range', args: [11], expect: true },
      { kind: 'call', name: '8.9 is outside', fn: 'in_range', args: [8.9], expect: false },
      { kind: 'call', name: '11.1 is outside', fn: 'in_range', args: [11.1], expect: false },
    ],
    solution: py`
def in_range(mass):
    return not (mass < 9 or mass > 11)
`,
    hints: [
      'A comparison such as mass >= 9 is already True or False. You can return it directly.',
      '"Not too low and not too high" is the same as "not (too low or too high)".',
    ],
    explanation: 'mass >= 9 and mass <= 11 says it directly. not (mass < 9 or mass > 11) says the same thing: the parentheses make not apply to the whole "outside" test.',
  },
  {
    id: 'syntax-slips-fix', version: 1, order: 280, difficulty: 1, source: 'conversation',
    topicIds: ['c-def', 'g-debug'], mode: 'fix', answer: 'code', misconception: 'formatting-precision',
    title: 'Two typing slips',
    prompt: 'The logic here is fine, but Python cannot read it. Use the error messages to find and fix two small typing slips.',
    starterCode: py`
def label(mass)
    if mass > 11:
        return "high
    return "ok"

print(label(12.4))
`,
    tests: [
      { kind: 'call', name: 'above 11 is high', fn: 'label', args: [12.4], expect: 'high' },
      { kind: 'call', name: '10 is ok', fn: 'label', args: [10], expect: 'ok' },
      { kind: 'stdout', name: 'prints high', expect: 'high' },
    ],
    solution: py`
def label(mass):
    if mass > 11:
        return "high"
    return "ok"

print(label(12.4))
`,
    hints: [
      'Press Run and read the line number in the message. Python reports one slip at a time.',
      'What does every def line end with?',
      'Every string needs a closing quote.',
    ],
    explanation: 'The def line was missing its colon and one string was missing its closing quote. These are typing slips; the logic was already right.',
  },
  {
    id: 'halvings-write', version: 1, order: 290, difficulty: 3, source: 'conversation',
    topicIds: ['b-while', 'g-write-function'], mode: 'write', answer: 'code', misconception: 'loop-control',
    title: 'Count the rounds of a while loop',
    prompt: 'Write halvings(mass). Keep halving mass until it is below 1, and return how many halvings that took. A mass already below 1 needs 0.',
    tests: [
      { kind: 'call', name: '8 needs 4 halvings', fn: 'halvings', args: [8], expect: 4 },
      { kind: 'call', name: '3 needs 2 halvings', fn: 'halvings', args: [3], expect: 2 },
      { kind: 'call', name: '1 needs 1 halving', fn: 'halvings', args: [1], expect: 1 },
      { kind: 'call', name: '0.5 needs none', fn: 'halvings', args: [0.5], expect: 0 },
    ],
    solution: py`
def halvings(mass):
    rounds = 0
    while mass >= 1:
        mass = mass / 2
        rounds = rounds + 1
    return rounds
`,
    hints: [
      'What condition means "keep going"?',
      'Two things must change on each round: the mass and the counter.',
    ],
    explanation: 'The loop repeats while mass is still 1 or more. Each round halves the mass and adds 1 to the counter. The counter is returned once the loop has finished.',
  },
  {
    id: 'to-float-write', version: 1, order: 320, difficulty: 3, source: 'conversation',
    topicIds: ['e-exceptions', 'g-write-function'], mode: 'write', answer: 'code', misconception: 'exceptions',
    title: 'Convert text that may not be a number',
    prompt: 'Write to_float(text). Return float(text) when the text is a number, and None when float raises ValueError.',
    tests: [
      { kind: 'call', name: 'a number', fn: 'to_float', args: ['10.2'], expect: 10.2 },
      { kind: 'call', name: 'not a number', fn: 'to_float', args: ['abc'], expect: null },
      { kind: 'call', name: 'empty text', fn: 'to_float', args: [''], expect: null },
    ],
    solution: py`
def to_float(text):
    try:
        return float(text)
    except ValueError:
        return None
`,
    hints: [
      'Put the line that might fail inside try.',
      'Name the specific error after except, then say what to return in that case.',
    ],
    explanation: 'The conversion goes in try. except ValueError catches only the failure you expect and returns None for it.',
  },
  {
    id: 'log-lines-write', version: 1, order: 350, difficulty: 3, source: 'conversation',
    topicIds: ['e-files'], mode: 'write', answer: 'code', misconception: 'file-writing',
    title: 'Keep earlier lines when logging',
    prompt: 'Write log_lines(path, lines). Write each string in lines to the file at path, each followed by "\\n". Calling it a second time must keep what the first call wrote.',
    tests: [
      {
        kind: 'python', name: 'two calls keep all lines',
        code: 'log_lines("l.txt", ["a"])\nlog_lines("l.txt", ["b", "c"])\nwith open("l.txt") as f:\n    content = f.read()\nassert content == "a\\nb\\nc\\n", "file content is " + repr(content)',
      },
      {
        kind: 'python', name: 'creates the file when it is missing',
        code: 'log_lines("new.txt", ["x"])\nwith open("new.txt") as f:\n    content = f.read()\nassert content == "x\\n", "file content is " + repr(content)',
      },
    ],
    solution: py`
def log_lines(path, lines):
    with open(path, "a") as f:
        for line in lines:
            f.write(line + "\n")
`,
    hints: [
      'Which mode keeps what is already in the file?',
      'Open the file once, then write inside a loop.',
    ],
    explanation: 'Mode "a" keeps existing content and adds to the end. Opening with "w" would empty the file at the start of every call.',
  },
  {
    id: 'unit-of-write', version: 1, order: 370, difficulty: 2, source: 'conversation',
    topicIds: ['f-nested', 'd-dict-access'], mode: 'write', answer: 'code', misconception: 'data-types',
    title: 'A lookup two levels down',
    prompt: 'Write unit_of(record). record looks like {"balance": {"id": "B1", "unit": "mg"}}. Return the unit, or "g" when the inner dictionary has no "unit" key.',
    tests: [
      { kind: 'call', name: 'unit present', fn: 'unit_of', args: [{ balance: { id: 'B1', unit: 'mg' } }], expect: 'mg' },
      { kind: 'call', name: 'unit missing gives g', fn: 'unit_of', args: [{ balance: { id: 'B2' } }], expect: 'g' },
    ],
    solution: py`
def unit_of(record):
    return record["balance"].get("unit", "g")
`,
    hints: [
      'First get the inner dictionary. What is record["balance"]?',
      'Which lookup gives a default instead of an error?',
    ],
    explanation: 'record["balance"] is the inner dictionary. .get("unit", "g") returns its unit, or "g" when the key is absent.',
  },
  {
    id: 'json-roundtrip-write', version: 1, order: 380, difficulty: 3, source: 'conversation',
    topicIds: ['f-json', 'e-files'], mode: 'write', answer: 'code',
    title: 'Save as JSON and load it back',
    prompt: 'Write save_and_load(data, path). Save data to the file at path with json.dump, then read the file back with json.load and return the result.',
    tests: [
      { kind: 'call', name: 'returns what was saved', fn: 'save_and_load', args: [{ B1: 10.2 }, 'report.json'], expect: { B1: 10.2 } },
      {
        kind: 'python', name: 'the file really contains the data',
        code: 'import json, os\nresult = save_and_load({"n": [1, 2]}, "out.json")\nassert os.path.exists("out.json"), "out.json was not written"\nwith open("out.json") as f:\n    assert json.load(f) == {"n": [1, 2]}, "the file does not contain the data"\nassert result == {"n": [1, 2]}, "the returned value is " + repr(result)',
      },
    ],
    solution: py`
import json

def save_and_load(data, path):
    with open(path, "w") as f:
        json.dump(data, f)
    with open(path) as f:
        return json.load(f)
`,
    hints: [
      'json.dump takes the data and an open file: json.dump(data, f).',
      'Finish writing (leave the with block) before opening the file again to read.',
    ],
    explanation: 'Open the file for writing and dump the data into it. Once that block has closed the file, open it again for reading and return what json.load gives.',
  },
  {
    id: 'threshold-import-write', version: 1, order: 410, difficulty: 2, source: 'conversation',
    topicIds: ['e-imports', 'f-modules'], mode: 'write', answer: 'code', misconception: 'python-import',
    title: 'Use a value from another file',
    prompt: 'config.py (shown below the editor) defines THRESHOLD. Write is_high(mass) that returns True when mass is greater than THRESHOLD. Import the value from config; do not retype the number.',
    files: { 'config.py': 'THRESHOLD = 11\n' },
    tests: [
      { kind: 'call', name: '11.5 is high', fn: 'is_high', args: [11.5], expect: true },
      { kind: 'call', name: '11 is not high', fn: 'is_high', args: [11], expect: false },
      { kind: 'python', name: 'THRESHOLD comes from config', code: 'assert "config" in dir() or "THRESHOLD" in dir(), "import config, or import THRESHOLD from it"' },
    ],
    solution: py`
from config import THRESHOLD

def is_high(mass):
    return mass > THRESHOLD
`,
    hints: [
      'Two forms work: import config, or from config import THRESHOLD.',
      'After import config, the value is written config.THRESHOLD.',
    ],
    explanation: 'from config import THRESHOLD runs config.py once and gives you its THRESHOLD. You get the value the file defines; nothing is shared with any other running program.',
  },
  {
    id: 'text-blocks-write', version: 1, order: 440, difficulty: 3, source: 'conversation',
    topicIds: ['i-message-shape', 'd-iteration'], mode: 'write', answer: 'code', misconception: 'claude-response-shape',
    title: 'Collect the text blocks',
    prompt: 'Write text_of(content). content is a list of blocks, each a dictionary with a "type". Return a list holding the "text" of every block whose type is "text", in order.',
    tests: [
      { kind: 'call', name: 'picks only text blocks', fn: 'text_of', args: [BLOCKS], expect: ['Weighing now.', 'Done.'] },
      { kind: 'call', name: 'no blocks gives an empty list', fn: 'text_of', args: [[]], expect: [] },
      { kind: 'call', name: 'only a tool_use block', fn: 'text_of', args: [[BLOCKS[1]]], expect: [] },
    ],
    solution: py`
def text_of(content):
    texts = []
    for block in content:
        if block["type"] == "text":
            texts.append(block["text"])
    return texts
`,
    hints: [
      'Start with an empty list to collect into.',
      'Check each block\'s type before reading its text: a tool_use block has no "text" key.',
    ],
    explanation: 'Loop over the content list, test each block\'s type, and collect the text of the text blocks. tool_use blocks are skipped because they have no "text".',
  },
  {
    id: 'project-write', version: 1, order: 450, difficulty: 5, source: 'conversation',
    topicIds: ['g-project', 'f-json', 'e-exceptions'], mode: 'write', answer: 'code',
    title: 'Project: readings report',
    prompt: 'A small program across three files. readings.txt and rules.py are provided (shown below the editor). In main.py write:\n1. load_readings(path): return the masses in the file as a list of floats. Skip lines that are empty or whose mass is not a number.\n2. summarise(masses): return a dictionary with "count", "high" (how many rules.classify calls "high") and "mean" (0 for an empty list).\n3. At the bottom, summarise readings.txt and save the summary to report.json with json.dump.',
    files: {
      'readings.txt': 'B1,10.2\nB2,11.8\nB3,abc\nB4,12.4\n\nB5,9.1\n',
      'rules.py': 'THRESHOLD = 11\n\n\ndef classify(mass):\n    if mass > THRESHOLD:\n        return "high"\n    return "ok"\n',
    },
    tests: [
      { kind: 'call', name: 'load_readings skips bad lines', fn: 'load_readings', args: ['readings.txt'], expect: [10.2, 11.8, 12.4, 9.1] },
      { kind: 'call', name: 'summarise counts and averages', fn: 'summarise', args: [[10.0, 12.0]], expect: { count: 2, high: 1, mean: 11.0 } },
      { kind: 'call', name: 'summarise handles an empty list', fn: 'summarise', args: [[]], expect: { count: 0, high: 0, mean: 0 } },
      {
        kind: 'python', name: 'report.json holds the summary of readings.txt',
        code: 'import json, os\nassert os.path.exists("report.json"), "report.json was not written"\nwith open("report.json") as f:\n    report = json.load(f)\nassert report.get("count") == 4, "count is " + repr(report.get("count"))\nassert report.get("high") == 2, "high is " + repr(report.get("high"))\nassert abs(report.get("mean", 0) - 10.875) < 1e-9, "mean is " + repr(report.get("mean"))',
      },
    ],
    solution: py`
import json
from rules import classify


def load_readings(path):
    masses = []
    with open(path) as f:
        for line in f:
            parts = line.strip().split(",")
            if len(parts) != 2:
                continue
            try:
                masses.append(float(parts[1]))
            except ValueError:
                continue
    return masses


def summarise(masses):
    high = 0
    for mass in masses:
        if classify(mass) == "high":
            high = high + 1
    mean = 0
    if masses:
        mean = sum(masses) / len(masses)
    return {"count": len(masses), "high": high, "mean": mean}


summary = summarise(load_readings("readings.txt"))
with open("report.json", "w") as f:
    json.dump(summary, f)
`,
    hints: [
      'Build and test one function at a time. Start with load_readings and print what it returns.',
      'line.strip().split(",") turns "B1,10.2" into ["B1", "10.2"]. What does an empty line give?',
      'float("abc") raises ValueError. Catch it and move on to the next line.',
      'Dividing by len(masses) fails for an empty list. Check for that first.',
    ],
    explanation: 'load_readings reads line by line, ignores lines without two parts and catches ValueError for masses that are not numbers. summarise counts, classifies with the imported rule and guards the division. The last lines connect the two and write the report.',
  },
]
