import type { Exercise } from '../types'
import { py } from './py'

/** Predict, explain and multiple-choice exercises. Every expectedOutput is checked against real Python in content.test.ts. */
export const readExercises: Exercise[] = [
  {
    id: 'alias-predict', version: 1, order: 20, difficulty: 2, source: 'conversation', diagnostic: true,
    topicIds: ['d-identity'], mode: 'predict', answer: 'output', misconception: 'list-identity',
    title: 'Two names, how many lists?',
    prompt: 'What does this print? Put each printed line on its own line.',
    code: py`
a = [1, 2]
b = a
b.append(3)
c = list(a)
c.append(4)
print(a)
print(a is b, a is c)
print(a == c)
`,
    expectedOutput: '[1, 2, 3]\nTrue False\nFalse',
    hints: [
      'After b = a, how many lists exist?',
      'list(a) builds a new list with the same items. Which list does c.append(4) change?',
      'is asks "the very same object?". == asks "equal contents?".',
    ],
    wrongAnswers: [
      { match: '[1, 2]\nFalse False\nFalse', feedback: 'You treated b as a separate copy. Look at the line b = a: does it build a new list?' },
      { match: '[1, 2, 3, 4]\nTrue True\nTrue', feedback: 'You treated c as the same list as a. What does list(a) return?' },
    ],
    trace: 'a = [1, 2]: one list, named a.\nb = a: the same list now has a second name.\nb.append(3): that one list becomes [1, 2, 3].\nc = list(a): a second, separate list [1, 2, 3].\nc.append(4): only the second list changes.',
    explanation: 'b = a adds a second name to the same list, so the append through b shows through a. list(a) makes a separate copy, so a is c is False, and after c gets a 4 the contents differ too.',
  },
  {
    id: 'list-ops-predict', version: 1, order: 40, difficulty: 3, source: 'conversation',
    topicIds: ['d-mutation'], mode: 'predict', answer: 'output', misconception: 'mutation-vs-reassignment',
    title: 'a + [3], a += [3] and a.append(3)',
    prompt: 'Three functions receive a list and try to add 3 to it. What is printed?',
    code: py`
def plus(a):
    a = a + [3]

def plus_equals(a):
    a += [3]

def append(a):
    a.append(3)

x = [1, 2]
plus(x)
print(x)

y = [1, 2]
plus_equals(y)
print(y)

z = [1, 2]
append(z)
print(z)
`,
    expectedOutput: '[1, 2]\n[1, 2, 3]\n[1, 2, 3]',
    hints: [
      'Inside each function, a starts as another name for the caller\'s list.',
      'a + [3] builds a new list. Where does that new list go, and does anyone outside the function see it?',
      'For a list, += changes the existing list, like append does.',
    ],
    wrongAnswers: [
      { match: '[1, 2, 3]\n[1, 2, 3]\n[1, 2, 3]', feedback: 'Look again at plus. a + [3] makes a new list; the assignment only changes what the local name a refers to.' },
      { match: '[1, 2]\n[1, 2]\n[1, 2, 3]', feedback: 'Look again at plus_equals. For a list, += extends the same list in place.' },
      { match: '[1, 2]\n[1, 2]\n[1, 2]', feedback: 'The function receives the caller\'s actual list, not a copy. Which of the three operations change that list itself?' },
    ],
    explanation: 'All three functions receive the caller\'s list under the local name a. a = a + [3] builds a new list and re-points the local name, so the caller\'s list is untouched. a += [3] and a.append(3) change the list itself, so the caller sees the 3.',
  },
  {
    id: 'print-vs-return-predict', version: 1, order: 60, difficulty: 2, source: 'conversation', diagnostic: true,
    topicIds: ['c-return'], mode: 'predict', answer: 'output', misconception: 'return-vs-print',
    title: 'print inside a function',
    prompt: 'What does this print?',
    code: py`
def show_mass(mass):
    print(mass)

def get_mass(mass):
    return mass

a = show_mass(10.2)
b = get_mass(11.8)
print(a)
print(b)
`,
    expectedOutput: '10.2\nNone\n11.8',
    hints: [
      'Which lines of the program put text on the screen? Count them.',
      'What does a call give back when the function has no return statement?',
    ],
    wrongAnswers: [
      { match: '10.2\n10.2\n11.8', feedback: 'show_mass printed 10.2 once, while it ran. What did the call hand back to be stored in a?' },
      { match: 'None\n11.8', feedback: 'One line is missing. Something is printed while show_mass runs.' },
      { match: '10.2\n11.8', feedback: 'There are three prints that run. What is stored in a?' },
    ],
    explanation: 'show_mass prints 10.2 while it runs but has no return, so the call gives back None and a is None. get_mass prints nothing; it returns 11.8, which is stored in b.',
  },
  {
    id: 'early-return-predict', version: 1, order: 80, difficulty: 2, source: 'conversation',
    topicIds: ['c-return', 'b-for'], mode: 'predict', answer: 'output', misconception: 'return-placement',
    title: 'return inside a loop',
    prompt: 'What does this print?',
    code: py`
def first_high(readings):
    for reading in readings:
        if reading > 11:
            return reading
        print("checked", reading)
    return None

print(first_high([10.2, 11.8, 12.4]))
`,
    expectedOutput: 'checked 10.2\n11.8',
    hints: [
      'Go through the list one reading at a time. Which is the first one above 11?',
      'What happens to the rest of the loop once return runs?',
    ],
    wrongAnswers: [
      { match: 'checked 10.2\n11.8\n12.4', feedback: 'return does more than leave one pass of the loop. What does it end?' },
      { match: 'checked 10.2\nchecked 11.8\nchecked 12.4\nNone', feedback: 'On the second pass the if is true. Which line runs then, and what does it do to the function?' },
    ],
    explanation: '10.2 is not above 11, so "checked 10.2" is printed. 11.8 is above 11, so return hands 11.8 back and the whole function ends there. 12.4 is never looked at.',
  },
  {
    id: 'loop-var-trace', version: 1, order: 100, difficulty: 1, source: 'conversation', diagnostic: true,
    topicIds: ['b-for', 'd-iteration'], mode: 'predict', answer: 'output', misconception: 'loop-variables',
    title: 'A loop over balance records',
    prompt: 'What does this print? Put each printed line on its own line.',
    code: py`
balances = [
    {"name": "B1", "mass": 10.2},
    {"name": "B2", "mass": 11.8},
]
for blob in balances:
    print(blob["name"], blob["mass"])
`,
    expectedOutput: 'B1 10.2\nB2 11.8',
    hints: [
      'How many items are in balances?',
      'On the first pass blob is the first dictionary. What are blob["name"] and blob["mass"]?',
      'print with two values puts one space between them.',
    ],
    explanation: 'The for line creates blob. On each pass it refers to the next dictionary in the list, so the loop prints one line per balance.',
  },
  {
    id: 'loop-var-explain', version: 1, order: 110, difficulty: 2, source: 'conversation',
    topicIds: ['b-for'], mode: 'explain', answer: 'text', misconception: 'loop-variables',
    title: 'Where does the loop variable come from?',
    prompt: 'Nothing above the loop defines blob. Where does blob come from? And what changes if you rename it to reading in both places?',
    code: py`
balances = [
    {"name": "B1", "mass": 10.2},
    {"name": "B2", "mass": 11.8},
]
for blob in balances:
    print(blob["name"], blob["mass"])
`,
    rubric: [
      { idea: 'The for statement itself creates the name', anyOf: ['assign', 'create', 'define', 'sets', 'set by', 'binds', 'makes', 'declare', 'for statement', 'for line', 'for loop'] },
      { idea: 'It refers to one item per pass', anyOf: ['each', 'one item', 'one at a time', 'every', 'in turn', 'next item', 'per pass', 'iteration', 'one by one', 'next element'] },
      { idea: 'Renaming it changes nothing', anyOf: ['nothing', 'same', 'no change', 'doesn\'t matter', 'does not matter', 'any name', 'no difference', 'wouldn\'t change', 'would not change'] },
    ],
    hints: [
      'Which line is the first one to mention blob?',
      'Is blob a special word in Python, or a name the author chose?',
    ],
    explanation: 'The for line defines blob. On each pass Python assigns the next item of balances to it. It is an ordinary name chosen by the author, so renaming it in both places changes nothing.',
  },
  {
    id: 'while-continue-choice', version: 1, order: 130, difficulty: 2, source: 'conversation',
    topicIds: ['b-while'], mode: 'predict', answer: 'choice', misconception: 'continue-in-while',
    title: 'continue in a while loop',
    prompt: 'What happens when x reaches 2?',
    code: py`
x = 0
while x < 5:
    if x == 2:
        continue
    print(x)
    x = x + 1
`,
    choices: [
      '2 is skipped and the loop carries on with 3',
      'continue jumps back to the while test with x still 2, so it repeats forever',
      'The loop ends',
      'Python raises an error',
    ],
    correctChoice: 1,
    hints: [
      'continue skips the rest of the loop body. Which lines are in the rest of the body?',
      'After continue, what is the value of x when the while test runs again?',
    ],
    trace: 'x = 0: prints 0, x becomes 1.\nx = 1: prints 1, x becomes 2.\nx = 2: the if is true, continue jumps to the while test. x is still 2.\nx = 2: the if is true again. This repeats forever.',
    explanation: 'continue skips everything below it in the body, and that includes x = x + 1. So x stays 2, the test 2 < 5 stays true, and the loop never ends. In a for loop the next item arrives automatically; in a while loop nothing changes unless your code changes it.',
  },
  {
    id: 'loop-count-predict', version: 1, order: 150, difficulty: 1, source: 'conversation',
    topicIds: ['b-for', 'b-conditions'], mode: 'predict', answer: 'output', misconception: 'loop-control',
    title: 'Passes versus printed lines',
    prompt: 'What does this print?',
    code: py`
readings = [9.0, 12.0, 10.0, 13.0]
rounds = 0
for reading in readings:
    rounds = rounds + 1
    if reading > 11:
        print("high", reading)
print("rounds", rounds)
`,
    expectedOutput: 'high 12.0\nhigh 13.0\nrounds 4',
    hints: [
      'How many times does the loop body run? Does the if change that?',
      'Which lines are inside the if, and which are only inside the for?',
    ],
    wrongAnswers: [
      { match: 'high 12.0\nhigh 13.0\nrounds 2', feedback: 'rounds = rounds + 1 is not inside the if. How often does it run?' },
      { match: 'high 12.0\nrounds 1', feedback: 'The loop does not stop after the first match. What would have to be in the code for it to stop?' },
    ],
    explanation: 'The loop body runs once per reading: four passes. The if only decides whether that pass prints. Two readings are above 11, so two lines are printed, and rounds ends at 4.',
  },
  {
    id: 'dict-membership-predict', version: 1, order: 170, difficulty: 1, source: 'conversation',
    topicIds: ['d-dict-access', 'b-comparison'], mode: 'predict', answer: 'output', misconception: 'dictionary-membership',
    title: 'in with a dictionary',
    prompt: 'What does this print?',
    code: py`
masses = {"B1": 10.2, "B2": 11.8}
print("B1" in masses)
print(10.2 in masses)
print(10.2 in masses.values())
`,
    expectedOutput: 'True\nFalse\nTrue',
    hints: ['in on a dictionary looks at one side of each pair. Which side?'],
    wrongAnswers: [
      { match: 'True\nTrue\nTrue', feedback: 'Look at the second line. Is 10.2 a key or a value?' },
    ],
    explanation: 'in on a dictionary checks its keys. "B1" is a key, 10.2 is not. To look among the values you ask for .values() first.',
  },
  {
    id: 'dict-lookups-predict', version: 1, order: 190, difficulty: 2, source: 'conversation',
    topicIds: ['d-dict-access', 'd-iteration'], mode: 'predict', answer: 'output',
    title: '.get() and .items()',
    prompt: 'What does this print?',
    code: py`
reading = {"name": "B1", "mass": 10.2}
print(reading.get("mass"))
print(reading.get("unit"))
print(reading.get("unit", "g"))
for key, value in reading.items():
    print(key, value)
`,
    expectedOutput: '10.2\nNone\ng\nname B1\nmass 10.2',
    hints: [
      'What does .get give when the key is missing and no default is supplied?',
      '.items() gives pairs. The loop unpacks each pair into key and value.',
    ],
    explanation: '.get returns the value when the key exists, None when it does not, or the default you pass as a second argument. .items() gives each key with its value, in the order they were written.',
  },
  {
    id: 'alias-explain', version: 1, order: 210, difficulty: 2, source: 'conversation',
    topicIds: ['d-identity'], mode: 'explain', answer: 'text', misconception: 'list-identity',
    title: 'Why did a change?',
    prompt: 'This prints [1, 2, 3]. Nothing was appended through a. Explain why a shows the 3.',
    code: py`
a = [1, 2]
b = a
b.append(3)
print(a)
`,
    rubric: [
      { idea: 'There is only one list', anyOf: ['one list', 'same list', 'single list', 'one object', 'same object', 'only one', 'the same'] },
      { idea: 'a and b are two names for it', anyOf: ['two names', 'both names', 'another name', 'second name', 'alias', 'refer', 'point', 'label', 'reference'] },
    ],
    hints: ['How many lists does the line b = a create?'],
    explanation: 'b = a does not copy anything. There is one list with two names. Appending through b changes that one list, and a is simply another name for it.',
  },
  {
    id: 'for-else-predict', version: 1, order: 230, difficulty: 3, source: 'conversation',
    topicIds: ['b-loop-else'], mode: 'predict', answer: 'output', misconception: 'for-else',
    title: 'The else of a for loop',
    prompt: 'What does this print? The else lines up with for, not with if.',
    newSyntax: ['for ... else: the else block runs when the loop finishes without break'],
    code: py`
def find(readings, limit):
    for reading in readings:
        if reading > limit:
            print("found", reading)
            break
    else:
        print("none over", limit)

find([10, 12, 13], 11)
find([10, 10.5], 11)
`,
    expectedOutput: 'found 12\nnone over 11',
    hints: [
      'In the first call, does the loop reach break?',
      'The else belongs to the for. It runs only when the loop ran out of items without break.',
    ],
    wrongAnswers: [
      { match: 'none over 11\nfound 12\nnone over 11', feedback: 'You ran the else each time the if was false. Check its indentation: which statement does it line up with?' },
      { match: 'found 12\nnone over 11\nnone over 11', feedback: 'In the first call the loop ended through break. Does the else run after a break?' },
    ],
    explanation: 'The else is attached to the for loop. It runs when the loop used up all its items without break. The first call breaks at 12, so the else is skipped. The second call finds nothing, the loop ends normally, and the else runs.',
  },
  {
    id: 'not-order-predict', version: 1, order: 250, difficulty: 2, source: 'conversation',
    topicIds: ['b-boolean'], mode: 'predict', answer: 'output', misconception: 'boolean-order',
    title: 'How far does not reach?',
    prompt: 'What does this print?',
    code: py`
a = True
b = True
print(not a or b)
print(not (a or b))
print(not a and not b)
`,
    expectedOutput: 'True\nFalse\nFalse',
    hints: [
      'not applies only to what comes directly after it.',
      'Work out not a first, then combine the result with b.',
    ],
    wrongAnswers: [
      { match: 'False\nFalse\nFalse', feedback: 'In the first line there are no parentheses. What exactly does not apply to?' },
    ],
    explanation: 'not a or b means (not a) or b: False or True, which is True. With parentheses, not (a or b) is not True, which is False. The last two lines always agree: not (a or b) equals not a and not b.',
  },
  {
    id: 'float-division-predict', version: 1, order: 270, difficulty: 1, source: 'conversation',
    topicIds: ['a-arithmetic'], mode: 'predict', answer: 'output', misconception: 'formatting-precision',
    title: 'Which results have a decimal point?',
    prompt: 'What does this print? Write the numbers exactly as Python shows them.',
    code: py`
print(10 / 2)
print(7 // 2)
print(7 / 2)
print(2 * 5.0)
`,
    expectedOutput: '5.0\n3\n3.5\n10.0',
    hints: ['/ always gives a float, even when the division is exact.', 'An int combined with a float gives a float.'],
    explanation: '/ always produces a float, so 10 / 2 is 5.0. // keeps the whole-number part, so 7 // 2 is 3. 2 * 5.0 involves a float, so the result is 10.0.',
  },
  {
    id: 'try-finally-predict', version: 1, order: 300, difficulty: 3, source: 'conversation',
    topicIds: ['e-exceptions'], mode: 'predict', answer: 'output', misconception: 'exceptions',
    title: 'An except that does not match',
    prompt: 'The record has no "mass" key, so record["mass"] raises KeyError. What is printed?',
    code: py`
def read(record):
    try:
        print("reading")
        return record["mass"]
    except ValueError:
        print("bad value")
    finally:
        print("done")

try:
    read({"name": "B1"})
except KeyError:
    print("no mass key")
`,
    expectedOutput: 'reading\ndone\nno mass key',
    hints: [
      'Does except ValueError match a KeyError?',
      'finally runs on the way out, whatever happened. Does it stop the error?',
      'After read ends with the error still active, where does the error go?',
    ],
    wrongAnswers: [
      { match: 'reading\nbad value\ndone', feedback: 'The error is a KeyError. Which except blocks match a KeyError?' },
      { match: 'reading\ndone', feedback: 'finally ran, but it does not handle the error. The KeyError is still travelling. Who catches it?' },
      { match: 'reading\nno mass key\ndone', feedback: 'The order matters. finally belongs to read and runs before the error leaves read.' },
    ],
    explanation: '"reading" is printed, then the lookup raises KeyError. except ValueError does not match. finally runs and prints "done", but it does not handle the error, which carries on out of read. The outer except KeyError catches it.',
  },
  {
    id: 'try-except-else-predict', version: 1, order: 310, difficulty: 2, source: 'seed',
    topicIds: ['e-exceptions'], mode: 'predict', answer: 'output',
    title: 'except, else and finally together',
    prompt: 'float("abc") raises ValueError. What is printed?',
    code: py`
values = ["10.2", "abc"]
for text in values:
    try:
        number = float(text)
    except ValueError:
        print("skip", text)
    else:
        print("ok", number)
    finally:
        print("next")
`,
    expectedOutput: 'ok 10.2\nnext\nskip abc\nnext',
    hints: ['else runs only when the try block had no error.', 'finally runs on every pass.'],
    explanation: 'For "10.2" there is no error: else prints "ok 10.2", then finally prints "next". For "abc" float raises ValueError: except prints "skip abc", else is skipped, and finally prints "next".',
  },
  {
    id: 'finally-return-predict', version: 1, order: 330, difficulty: 3, source: 'conversation',
    topicIds: ['e-exceptions'], mode: 'predict', answer: 'output', misconception: 'exceptions',
    title: 'return inside finally',
    prompt: 'What does this print?',
    code: py`
def check():
    try:
        return "from try"
    finally:
        return "from finally"

print(check())
`,
    expectedOutput: 'from finally',
    hints: ['finally runs before the function actually leaves, even after a return.'],
    explanation: 'The try block is ready to return "from try", but finally always runs first, and its own return replaces the pending one. This also silently discards any error, which is why current Python versions warn about return inside finally. Avoid it in real code.',
  },
  {
    id: 'file-modes-predict', version: 1, order: 340, difficulty: 3, source: 'conversation',
    topicIds: ['e-files'], mode: 'predict', answer: 'output', misconception: 'file-writing',
    title: 'Opening with "w" and "a"',
    prompt: 'What does this print?',
    newSyntax: ['.splitlines() turns text into a list of its lines'],
    code: py`
with open("log.txt", "w") as f:
    f.write("a\n")
    f.write("b\n")

with open("log.txt", "a") as f:
    f.write("c\n")

with open("log.txt") as f:
    print(f.read().splitlines())

with open("log.txt", "w") as f:
    f.write("d\n")

with open("log.txt") as f:
    print(f.read().splitlines())
`,
    expectedOutput: "['a', 'b', 'c']\n['d']",
    hints: [
      'When exactly does "w" empty the file: at open, or at each write?',
      '"a" keeps the existing content and adds to the end.',
    ],
    wrongAnswers: [
      { match: "['b', 'c']\n['d']", feedback: 'You erased the file at the second write. "w" empties the file once. When?' },
      { match: "['a', 'b', 'c']\n['a', 'b', 'c', 'd']", feedback: 'The last write happens after the file was opened again with "w". What does opening with "w" do to existing content?' },
    ],
    explanation: '"w" empties the file once, at the moment it is opened. Both writes inside that with block are kept. "a" adds to the end. Opening with "w" again later empties the file again, so only "d" remains.',
  },
  {
    id: 'nested-json-predict', version: 1, order: 360, difficulty: 2, source: 'conversation',
    topicIds: ['f-nested', 'f-json'], mode: 'predict', answer: 'output', misconception: 'data-types',
    title: 'From JSON text to Python data',
    prompt: 'What does this print?',
    newSyntax: ['type(x).__name__ gives the name of a value\'s type as text'],
    code: py`
import json

text = '{"balance": {"id": "B1", "readings": [10.2, 11.8]}, "ok": true, "note": null}'
data = json.loads(text)
print(data["balance"]["readings"][1])
print(type(data["balance"]).__name__)
print(data["ok"], data["note"])
print(type(text).__name__)
`,
    expectedOutput: '11.8\ndict\nTrue None\nstr',
    hints: [
      'Take the nested lookup one step at a time: data["balance"], then ["readings"], then [1].',
      'JSON true and null are not Python words. What do they become?',
    ],
    explanation: 'json.loads turns the text into Python data: the objects become dicts, the array becomes a list, true becomes True and null becomes None. text itself is still a str. The lookup goes dict, then list, then position 1.',
  },
  {
    id: 'import-once-predict', version: 1, order: 390, difficulty: 2, source: 'conversation',
    topicIds: ['e-imports', 'f-modules'], mode: 'predict', answer: 'output', misconception: 'python-import',
    title: 'Importing the same module twice',
    prompt: 'settings.py is a second file, shown below the program. What does the program print?',
    files: { 'settings.py': 'print("loading settings")\ncount = 0\n' },
    code: py`
import settings
settings.count = settings.count + 1
import settings
print(settings.count)
`,
    expectedOutput: 'loading settings\n1',
    hints: [
      'Importing a module runs its file. How many times?',
      'Does the second import start again from the file, or reuse what is already loaded?',
    ],
    wrongAnswers: [
      { match: 'loading settings\nloading settings\n0', feedback: 'Python remembers modules it has already imported. What does the second import do?' },
      { match: '1', feedback: 'The first import runs settings.py from top to bottom. What does its first line do?' },
    ],
    explanation: 'The first import runs settings.py once, which prints "loading settings" and sets count to 0. The second import reuses the module already in memory, so count is still the 1 you set.',
  },
  {
    id: 'process-memory-choice', version: 1, order: 400, difficulty: 2, source: 'conversation',
    topicIds: ['f-modules'], mode: 'explain', answer: 'choice', misconception: 'python-import',
    title: 'Does import connect two programs?',
    prompt: 'agent.py is running in one terminal and keeps appending to its list called messages. In a second terminal you start viewer.py, which contains: from agent import messages. What does viewer.py get?',
    choices: [
      'The live list from the running agent, updating as the agent appends',
      'A snapshot of the running agent\'s list at that moment',
      'Its own list: viewer.py runs agent.py\'s code itself, in its own memory',
      'An error, because agent.py is already in use',
    ],
    correctChoice: 2,
    hints: ['Import works on a file. Does it know anything about other programs that are running?'],
    explanation: 'import runs the file agent.py inside the viewer\'s own process and gives it the names that result. It has no connection to the other running program. Two processes have separate memory; to share data they need something outside both, such as a file one writes and the other reads.',
  },
  {
    id: 'response-content-predict', version: 1, order: 420, difficulty: 2, source: 'conversation',
    topicIds: ['i-message-shape', 'f-nested'], mode: 'predict', answer: 'output', misconception: 'claude-response-shape',
    title: 'A response and its content blocks',
    prompt: 'This dictionary stands in for a Claude response. (With the real SDK you write response.content and block.type.) What is printed?',
    code: py`
response = {
    "role": "assistant",
    "stop_reason": "tool_use",
    "content": [
        {"type": "text", "text": "Weighing now."},
        {"type": "tool_use", "id": "toolu_01", "name": "read_balance", "input": {"balance": "B1"}},
    ],
}
for block in response["content"]:
    print(block["type"])
print(len(response))
`,
    expectedOutput: 'text\ntool_use\n3',
    hints: [
      'What is response["content"]: a dictionary or a list? How many items?',
      'len(response) counts the top-level entries of response, not the blocks.',
    ],
    wrongAnswers: [
      { match: 'text\ntool_use\n2', feedback: 'The last line measures response itself, not response["content"]. How many keys does response have?' },
    ],
    explanation: 'The response is one object with three entries: role, stop_reason and content. content is a list of two blocks, and each block has its own type. The loop goes over the content list because the code asked for it.',
  },
  {
    id: 'response-content-choice', version: 1, order: 430, difficulty: 2, source: 'conversation',
    topicIds: ['i-message-shape'], mode: 'explain', answer: 'choice', misconception: 'claude-response-shape',
    title: 'Looping over the whole response',
    prompt: 'Using the same response dictionary, what does this loop go over?',
    code: py`
for item in response:
    print(item)
`,
    choices: [
      'The two content blocks',
      'The three keys: role, stop_reason and content',
      'Each character of the text',
      'Nothing: Python raises an error',
    ],
    correctChoice: 1,
    hints: ['What does looping over a dictionary give you?'],
    explanation: 'Looping over a dictionary gives its keys. for never chops a response into blocks on its own. The blocks live in the content list, so you must loop over response["content"], or response.content with the SDK.',
  },
]
