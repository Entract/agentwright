using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;

namespace PythonScratchpad;

/// <summary>
/// The guided course's link to Python. The curriculum (manifest, executable tests and
/// answer key) is a folder of Python files beside this program; labcheck.py in it runs
/// and checks exercises. This class prepares a workspace folder per exercise, starts
/// labcheck.py, and keeps the learner's progress in a JSON file in their profile.
/// </summary>
internal sealed partial class CourseHost(PythonHost python, Action<object> send)
{
    private const int CheckTimeLimitMs = 40000;

    public static string Folder => Path.Combine(AppContext.BaseDirectory, "curriculum");
    public static string Script => Path.Combine(Folder, "labcheck.py");
    private static string ProgressFile => Path.Combine(AppPaths.Data, "course-progress.json");

    [GeneratedRegex("^([1-9]([PR]-)?[A-Z]|LAB-[0-9]{2})$")]
    private static partial Regex ExerciseId();

    [GeneratedRegex(@"^[A-Za-z_][A-Za-z0-9_]{0,40}\.(py|json|txt)$")]
    private static partial Regex FileName();

    public static bool IsExerciseId(string id) => ExerciseId().IsMatch(id);

    /// <summary>Which exercises have tests, the Python and SDK versions, and the saved progress.</summary>
    public async Task<object> DescribeAsync()
    {
        string? progress = null;
        try
        {
            if (File.Exists(ProgressFile)) progress = await File.ReadAllTextAsync(ProgressFile);
        }
        catch (IOException)
        {
            // Unreadable progress is treated as none; it is never overwritten until the learner does something.
        }
        if (!File.Exists(Script))
            return new { type = "course", problem = "The course files are missing from this installation. Rebuild with \"npm run desktop\".", progress };
        var (ok, output, error) = await RunToolAsync(["info"], 60000);
        if (!ok)
            return new { type = "course", problem = error, progress };
        try
        {
            using var doc = JsonDocument.Parse(output);
            return new { type = "course", info = doc.RootElement.Clone(), progress };
        }
        catch (JsonException)
        {
            return new { type = "course", problem = "The course checker gave an unreadable answer: " + Clip(output + error), progress };
        }
    }

    /// <summary>Writes the learner's files for one exercise into its own folder, replacing what was there.</summary>
    public string PrepareWorkspace(string exerciseId, JsonElement files, string explanation)
    {
        if (!IsExerciseId(exerciseId)) throw new ArgumentException("Unknown exercise.");
        var folder = Path.Combine(AppPaths.Data, "course", exerciseId);
        Directory.CreateDirectory(folder);
        foreach (var old in Directory.GetFiles(folder)) File.Delete(old);
        if (files.ValueKind != JsonValueKind.Object) throw new ArgumentException("No files were sent.");
        foreach (var file in files.EnumerateObject())
        {
            if (!FileName().IsMatch(file.Name)) throw new ArgumentException($"Unsupported file name: {file.Name}");
            File.WriteAllText(Path.Combine(folder, file.Name), file.Value.GetString() ?? "", new UTF8Encoding(false));
        }
        File.WriteAllText(Path.Combine(folder, "explanation.txt"), explanation, new UTF8Encoding(false));
        return folder;
    }

    public async Task CheckAsync(int id, string exerciseId, JsonElement files, string explanation)
    {
        try
        {
            var folder = PrepareWorkspace(exerciseId, files, explanation);
            var (ok, output, error) = await RunToolAsync(["check", exerciseId, folder], CheckTimeLimitMs);
            var last = output.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).LastOrDefault() ?? "";
            if (last.StartsWith('{'))
            {
                using var doc = JsonDocument.Parse(last);
                send(new { type = "checked", id, exerciseId, report = doc.RootElement.Clone() });
                return;
            }
            send(new { type = "checked", id, exerciseId, problem = ok ? "The checker printed nothing." : error });
        }
        catch (Exception ex)
        {
            send(new { type = "checked", id, exerciseId, problem = ex.Message });
        }
    }

    public async Task SolutionAsync(string exerciseId)
    {
        if (!IsExerciseId(exerciseId)) return;
        var (ok, output, error) = await RunToolAsync(["solution", exerciseId], 30000);
        send(new { type = "solution", exerciseId, text = ok ? output.TrimEnd() : null, problem = ok ? null : Clip(output + error) });
    }

    public void SaveProgress(string json)
    {
        // Parsed first so that a damaged message can never replace good progress.
        using (JsonDocument.Parse(json)) { }
        Directory.CreateDirectory(AppPaths.Data);
        var temporary = ProgressFile + ".tmp";
        File.WriteAllText(temporary, json, new UTF8Encoding(false));
        File.Move(temporary, ProgressFile, overwrite: true);
    }

    public void Export(IWin32Window owner)
    {
        if (!File.Exists(ProgressFile))
        {
            MessageBox.Show(owner, "There is no progress to export yet.", "Guided course");
            return;
        }
        using var dialog = new SaveFileDialog { Title = "Export course progress", Filter = "JSON file|*.json", FileName = $"python-agent-course-progress-{DateTime.Now:yyyy-MM-dd}.json" };
        if (dialog.ShowDialog(owner) == DialogResult.OK) File.Copy(ProgressFile, dialog.FileName, overwrite: true);
    }

    public void Import(IWin32Window owner)
    {
        using var dialog = new OpenFileDialog { Title = "Import course progress", Filter = "JSON file|*.json" };
        if (dialog.ShowDialog(owner) != DialogResult.OK) return;
        var json = File.ReadAllText(dialog.FileName);
        using (JsonDocument.Parse(json)) { }
        send(new { type = "progress", json });
    }

    private async Task<(bool Ok, string Output, string Error)> RunToolAsync(string[] arguments, int timeLimitMs)
    {
        var found = await python.PythonAsync();
        if (found is not { } py) return (false, "", "No Python installation was found on this PC. Install Python from python.org, then reopen the scratchpad.");
        var info = new ProcessStartInfo(py.Path)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            RedirectStandardInput = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = Folder,
        };
        foreach (var arg in py.Args) info.ArgumentList.Add(arg);
        info.ArgumentList.Add(Script);
        foreach (var arg in arguments) info.ArgumentList.Add(arg);
        info.Environment["PYTHONUTF8"] = "1";
        info.Environment["PYTHONIOENCODING"] = "utf-8";
        info.Environment["PYTHONDONTWRITEBYTECODE"] = "1";
        info.Environment.Remove("ANTHROPIC_API_KEY");
        info.Environment.Remove("ANTHROPIC_AUTH_TOKEN");
        info.Environment.Remove("LAB_AGENT_LIVE");
        using var process = new Process { StartInfo = info };
        process.Start();
        process.StandardInput.Close();
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        var finished = process.WaitForExitAsync();
        if (await Task.WhenAny(finished, Task.Delay(timeLimitMs)) != finished)
        {
            try { process.Kill(entireProcessTree: true); } catch (Exception) { /* already gone */ }
            await finished;
            return (false, await output, $"Stopped after {timeLimitMs / 1000} seconds. Is there a loop that never ends?");
        }
        var text = await output;
        var problems = await error;
        return (process.ExitCode == 0, text, process.ExitCode == 0 ? problems : Clip(problems.Length > 0 ? problems : text));
    }

    private static string Clip(string text) => text.Length <= 600 ? text.Trim() : text[..600].Trim() + "…";
}
