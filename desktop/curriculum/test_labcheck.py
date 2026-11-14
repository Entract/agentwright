"""Self-test of the guided-course checks: run with  python -m unittest test_labcheck  in this folder.

For every implemented exercise: the reference solution passes every case, the
untouched starter does not pass, and each recorded misconception is rejected.
"""
import json
import os
import subprocess
import sys
import tempfile
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import labcheck  # noqa: E402

labcheck._load_checks()
SOLUTIONS, WRONG = labcheck.answer_key()

# Starters that are already a complete program (the exercise is about the written explanation).
COMPLETE_STARTERS = {"3F"}
LONG_ENOUGH = "A reasonably long written explanation of the idea goes here for testing."


def workspace(exercise_id, main):
    options = labcheck.OPTIONS.get(exercise_id, {})
    files = dict(options.get("files", {}))
    files["main.py" if "main.py" in files or "entry" not in options else options["entry"]] = main
    return files


def starter_files(exercise_id):
    """What the learner first sees: the app's own workspace when it has one, else the manifest starter."""
    options = labcheck.OPTIONS.get(exercise_id, {})
    files = dict(options.get("files", {}))
    entry = options.get("entry", "main.py")
    if entry not in files:
        # A project milestone opens with the code that passed the milestone before it.
        previous = options.get("previous")
        files[entry] = SOLUTIONS[previous] if previous else labcheck.EXERCISES[exercise_id]["starter"]
    return files


def report(exercise_id, files, explanation=LONG_ENOUGH):
    directory = tempfile.mkdtemp(prefix="labcheck_")
    for name, text in files.items():
        with open(os.path.join(directory, name), "w", encoding="utf-8") as fh:
            fh.write(text)
    return labcheck.check_exercise(exercise_id, files, explanation, directory)


def failures(result):
    return [f"{c['name']}: {c['message']}" for c in result["cases"] if not c["passed"]]


def as_files(exercise_id, program):
    return dict(program) if isinstance(program, dict) else workspace(exercise_id, program)


class Checks(unittest.TestCase):
    def test_every_exercise_has_a_visible_and_a_hidden_case(self):
        for exercise_id, cases in labcheck.CHECKS.items():
            with self.subTest(exercise=exercise_id):
                self.assertTrue(any(c.visible for c in cases), "needs a visible case")
                self.assertTrue(any(not c.visible for c in cases), "needs a hidden case")
                self.assertEqual(len({c.name for c in cases}), len(cases), "case names must be unique")

    def test_every_exercise_in_the_manifest_is_implemented(self):
        self.assertEqual(sorted(labcheck.CHECKS), sorted(labcheck.EXERCISES))
        self.assertEqual(len(labcheck.EXERCISES), 82)

    def test_reference_solutions_pass(self):
        for exercise_id in labcheck.CHECKS:
            with self.subTest(exercise=exercise_id):
                self.assertIn(exercise_id, SOLUTIONS, "no reference solution")
                result = report(exercise_id, as_files(exercise_id, SOLUTIONS[exercise_id]))
                self.assertIsNone(result["syntaxError"])
                self.assertEqual(failures(result), [])
                self.assertTrue(result["ok"])

    def test_starters_do_not_pass(self):
        for exercise_id in labcheck.CHECKS:
            if exercise_id in COMPLETE_STARTERS:
                continue
            with self.subTest(exercise=exercise_id):
                result = report(exercise_id, starter_files(exercise_id))
                self.assertFalse(result["ok"], "the untouched starter passed")
                self.assertFalse(any(c.get("checkerError") for c in result["cases"]), failures(result))

    def test_known_misconceptions_are_rejected(self):
        for exercise_id, attempts in WRONG.items():
            for label, program in attempts:
                with self.subTest(exercise=exercise_id, attempt=label):
                    result = report(exercise_id, as_files(exercise_id, program))
                    self.assertFalse(result["ok"], "a known wrong attempt passed")
                    self.assertFalse(any(c.get("checkerError") for c in result["cases"]), failures(result))
                    for case in result["cases"]:
                        if not case["passed"]:
                            self.assertTrue(case["message"], f"{case['name']} failed without a message")

    def test_a_syntax_error_is_reported_without_running_cases(self):
        result = report("3C", workspace("3C", "results = [\nfor block in response.content\n    pass\n"))
        self.assertIsNotNone(result["syntaxError"])
        self.assertEqual(result["cases"], [])
        self.assertFalse(result["ok"])

    def test_network_is_blocked_while_exercise_code_runs(self):
        program = "\n".join([
            "import socket",
            "try:",
            "    socket.create_connection(('example.com', 80), timeout=2)",
            "    print('connected')",
            "except OSError:",
            "    print('blocked')",
        ])
        run = labcheck.execute(labcheck.EXERCISES["1A"], {"main.py": program})
        self.assertEqual(run.lines(), ["blocked"])

    def test_an_explanation_exercise_needs_a_written_answer(self):
        files = as_files("3F", SOLUTIONS["3F"])
        self.assertFalse(report("3F", files, explanation="")["ok"])
        good = report("3F", files, explanation="The schema describes the argument names and types Claude should send; it does not run the tool.")
        self.assertTrue(good["ok"])
        self.assertTrue(all(point["found"] for point in good["explanation"]))


class CommandLine(unittest.TestCase):
    def run_cli(self, *args, files=None):
        directory = tempfile.mkdtemp(prefix="labcheck_cli_")
        for name, text in (files or {}).items():
            with open(os.path.join(directory, name), "w", encoding="utf-8") as fh:
                fh.write(text)
        argv = [sys.executable, os.path.join(HERE, "labcheck.py"), *[directory if a == "<dir>" else a for a in args]]
        return subprocess.run(argv, capture_output=True, text=True, encoding="utf-8", timeout=120)

    def test_run_defines_fixtures_and_reports_errors_against_the_learners_lines(self):
        program = "print(response.content[1].name)\nprint(read_balance('XPR205'))\nprint(undefined_name)\n"
        done = self.run_cli("run", "3C", "<dir>", files={"main.py": program})
        self.assertEqual(done.stdout.splitlines(), ["read_balance", "{'balance_id': 'XPR205', 'mass': 10.52, 'unit': 'g'}"])
        self.assertIn('File "main.py", line 3', done.stderr)
        self.assertIn("NameError", done.stderr)
        self.assertNotIn("labcheck.py", done.stderr)
        self.assertEqual(done.returncode, 1)

    def test_check_prints_one_json_report(self):
        done = self.run_cli("check", "4A", "<dir>", files={"main.py": SOLUTIONS["4A"]})
        result = json.loads(done.stdout.strip().splitlines()[-1])
        self.assertTrue(result["ok"], done.stdout + done.stderr)

    def test_an_endless_loop_is_cut_off_with_a_report(self):
        directory = tempfile.mkdtemp(prefix="labcheck_loop_")
        with open(os.path.join(directory, "main.py"), "w", encoding="utf-8") as fh:
            fh.write("while True:\n    pass\n")
        code = (
            f"import sys; sys.path.insert(0, {HERE!r}); import labcheck; labcheck.CHECK_TIME_LIMIT = 2.0; "
            f"sys.exit(labcheck.main(['labcheck', 'check', '1A', {directory!r}]))"
        )
        done = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, timeout=60)
        result = json.loads(done.stdout.strip().splitlines()[-1])
        self.assertTrue(result["timedOut"])
        self.assertFalse(result["ok"])

    def test_solution_is_printed_only_by_its_own_command(self):
        done = self.run_cli("solution", "3C")
        self.assertIn("results.append", done.stdout)

    def test_info_lists_implemented_exercises(self):
        info = json.loads(self.run_cli("info").stdout)
        for exercise_id in ("2D", "3A", "3B", "3C", "4A", "4B", "4C", "4D"):
            self.assertIn(exercise_id, info["implemented"])
        self.assertTrue(info["anthropic"])


if __name__ == "__main__":
    unittest.main()
