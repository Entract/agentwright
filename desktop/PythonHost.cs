using System.Diagnostics;
using System.Text;

namespace PythonScratchpad;

/// <summary>
/// Runs scratchpad code with the Python installed on this PC, as an ordinary
/// child process. Unlike the built-in Python there is no sandbox and no time
/// limit: the program can do whatever a script started by hand could do. It is
/// stopped by the Stop button or when the window closes.
/// </summary>
internal sealed class PythonHost(Action<object> send)
{
    private const int MaxChunk = 8192;
    private readonly object gate = new();
    private Process? current;
    private int currentId;
    private bool stopRequested;
    private (string Path, string[] Args, string Version)? found;
    private bool searched;

    /// <summary>What the page needs to know: which Python was found, whether a key is saved, where programs run.</summary>
    public async Task<object> DescribeAsync()
    {
        if (!searched)
        {
            found = await Task.Run(FindPython);
            searched = true;
        }
        return new
        {
            type = "host",
            python = found is { } p ? new { path = p.Path, version = p.Version } : null,
            hasKey = KeyStore.HasKey(),
            workDir = AppPaths.Work,
        };
    }

    /// <summary>Free-form scratchpad run: the code as typed, in the working folder, with the saved API key.</summary>
    /// <param name="trace">
    /// Starts the program through lab_trace.py, which reports each call the program makes to the
    /// Anthropic API on stderr (marked lines the page reads for its tool-call inspector).
    /// </param>
    public void Run(int id, string code, bool trace = false)
    {
        try
        {
            Directory.CreateDirectory(AppPaths.Work);
            var runDir = Path.Combine(AppPaths.Data, "run");
            Directory.CreateDirectory(runDir);
            var script = Path.Combine(runDir, "main.py");
            File.WriteAllText(script, code, new UTF8Encoding(false));
            if (trace)
            {
                var tracer = Path.Combine(runDir, "lab_trace.py");
                using (var source = typeof(PythonHost).Assembly.GetManifestResourceStream("lab_trace.py") ?? throw new InvalidOperationException("The tracing script is missing from this build."))
                using (var target = File.Create(tracer))
                    source.CopyTo(target);
                Launch(id, ["-u", tracer, script], AppPaths.Work, withKey: true, timeLimitMs: 0, hidePath: script);
            }
            else Launch(id, ["-u", script], AppPaths.Work, withKey: true, timeLimitMs: 0, hidePath: script);
        }
        catch (Exception ex)
        {
            send(new { type = "exit", id, problem = $"Python could not be started: {ex.Message}" });
        }
    }

    /// <summary>
    /// Guided-course run: the exercise's fixtures are defined first by labcheck.py. No API key is
    /// passed, and the program is stopped after a minute. A project milestone (LAB-..) is a chat
    /// the learner types into, so it may run for fifteen minutes.
    ///
    /// A live run is the one exception to "no key": the learner pressed Run live and confirmed it.
    /// The saved key is passed, the variable their program checks is set, and labcheck.py allows
    /// the network. labcheck.py itself refuses this for exercises not marked as able to go live.
    /// </summary>
    public void RunExercise(int id, string exerciseId, string workspace, bool live = false)
    {
        try
        {
            if (live && !KeyStore.HasKey())
            {
                send(new { type = "exit", id, problem = "No API key is saved in this app. Open the Scratchpad tab, choose PC Python, save your key with the Key… button, then try Run live again." });
                return;
            }
            var limit = exerciseId.StartsWith("LAB-", StringComparison.Ordinal) ? 900000 : 60000;
            Launch(id, ["-u", CourseHost.Script, live ? "live" : "run", exerciseId, workspace], workspace, withKey: live, timeLimitMs: limit, hidePath: null, live: live);
        }
        catch (Exception ex)
        {
            send(new { type = "exit", id, problem = $"Python could not be started: {ex.Message}" });
        }
    }

    /// <summary>The Python that was found, for other helpers that need to start it.</summary>
    public async Task<(string Path, string[] Args)?> PythonAsync()
    {
        await DescribeAsync();
        return found is { } p ? (p.Path, p.Args) : null;
    }

    private void Launch(int id, string[] arguments, string workingDirectory, bool withKey, int timeLimitMs, string? hidePath, bool live = false)
    {
        if (found is not { } python)
        {
            send(new { type = "exit", id, problem = "No Python installation was found on this PC. Install Python from python.org, then reopen the scratchpad." });
            return;
        }
        lock (gate)
        {
            if (current is not null)
            {
                send(new { type = "exit", id, problem = "A program is already running. Stop it first." });
                return;
            }
        }
        var info = new ProcessStartInfo(python.Path)
        {
            UseShellExecute = false,
            CreateNoWindow = true,
            RedirectStandardInput = true,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardInputEncoding = new UTF8Encoding(false),
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            WorkingDirectory = workingDirectory,
        };
        foreach (var arg in python.Args) info.ArgumentList.Add(arg);
        foreach (var arg in arguments) info.ArgumentList.Add(arg);
        info.Environment["PYTHONUTF8"] = "1";
        info.Environment["PYTHONIOENCODING"] = "utf-8";
        // Lets "import my_module" find files in the working folder.
        info.Environment["PYTHONPATH"] = workingDirectory;
        if (withKey)
        {
            var key = KeyStore.Load();
            if (key is not null) info.Environment["ANTHROPIC_API_KEY"] = key;
        }
        else
        {
            // Guided exercises are offline simulations: they never receive a key, even one set in Windows.
            info.Environment.Remove("ANTHROPIC_API_KEY");
            info.Environment.Remove("ANTHROPIC_AUTH_TOKEN");
        }
        // The project agent goes live only when this is "1". It is set for a confirmed live run and
        // removed for everything else, so a value left in Windows can never switch a run to live.
        if (live) info.Environment["LAB_AGENT_LIVE"] = "1";
        else info.Environment.Remove("LAB_AGENT_LIVE");

        var process = new Process { StartInfo = info };
        var clock = Stopwatch.StartNew();
        var timedOut = false;
        lock (gate)
        {
            process.Start();
            current = process;
            currentId = id;
            stopRequested = false;
        }
        _ = Task.Run(async () =>
        {
            // Tracebacks name the temporary file; "main.py" is clearer.
            var output = PumpAsync(process.StandardOutput, id, "out", null);
            var errors = PumpAsync(process.StandardError, id, "err", hidePath);
            var finished = Task.WhenAll(output, errors, process.WaitForExitAsync());
            if (timeLimitMs > 0 && await Task.WhenAny(finished, Task.Delay(timeLimitMs)) != finished)
            {
                timedOut = true;
                try { process.Kill(entireProcessTree: true); } catch (Exception) { /* already gone */ }
            }
            await finished;
            bool stopped;
            lock (gate)
            {
                stopped = stopRequested;
                current = null;
            }
            if (timedOut)
                send(new { type = "exit", id, problem = $"Stopped after {timeLimitMs / 1000} seconds. Is there a loop that never ends?" });
            else
                send(new { type = "exit", id, code = process.ExitCode, stopped, ms = clock.ElapsedMilliseconds });
            process.Dispose();
        });
    }

    private async Task PumpAsync(StreamReader reader, int id, string stream, string? hidePath)
    {
        var buffer = new char[MaxChunk];
        try
        {
            if (hidePath is null)
            {
                int n;
                while ((n = await reader.ReadAsync(buffer, 0, buffer.Length)) > 0)
                    send(new { type = "out", id, stream, text = new string(buffer, 0, n) });
            }
            else
            {
                // Line by line, so the path can be replaced even when it is long.
                string? line;
                while ((line = await reader.ReadLineAsync()) is not null)
                    send(new { type = "out", id, stream, text = line.Replace(hidePath, "main.py") + "\n" });
            }
        }
        catch (Exception)
        {
            // The program was stopped while it was writing.
        }
    }

    public void SendInput(string text)
    {
        Process? process;
        lock (gate) process = current;
        if (process is null) return;
        try
        {
            process.StandardInput.Write(text + "\n");
            process.StandardInput.Flush();
        }
        catch (Exception)
        {
            // The program has already finished.
        }
    }

    public void Stop()
    {
        Process? process;
        lock (gate)
        {
            process = current;
            if (process is not null) stopRequested = true;
        }
        if (process is null) return;
        try
        {
            process.Kill(entireProcessTree: true);
        }
        catch (Exception)
        {
            // It finished by itself in the meantime.
        }
    }

    public void OpenWorkFolder()
    {
        Directory.CreateDirectory(AppPaths.Work);
        Process.Start(new ProcessStartInfo("explorer.exe") { ArgumentList = { AppPaths.Work } })?.Dispose();
    }

    /// <summary>
    /// The first working python.exe on PATH, then the "py" launcher. The Microsoft
    /// Store placeholder in WindowsApps is skipped: it opens the Store instead of running.
    /// </summary>
    private static (string Path, string[] Args, string Version)? FindPython()
    {
        var candidates = new List<(string Path, string[] Args)>();
        foreach (var dir in (Environment.GetEnvironmentVariable("PATH") ?? "").Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries))
        {
            if (dir.Contains("WindowsApps", StringComparison.OrdinalIgnoreCase)) continue;
            try
            {
                var exe = Path.Combine(dir.Trim().Trim('"'), "python.exe");
                if (File.Exists(exe)) candidates.Add((exe, []));
            }
            catch (ArgumentException)
            {
                // A malformed PATH entry.
            }
        }
        var launcher = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Windows), "py.exe");
        if (File.Exists(launcher)) candidates.Add((launcher, ["-3"]));

        foreach (var (path, args) in candidates)
        {
            try
            {
                var info = new ProcessStartInfo(path) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
                foreach (var arg in args) info.ArgumentList.Add(arg);
                info.ArgumentList.Add("-c");
                info.ArgumentList.Add("import sys; print(sys.version.split()[0])");
                using var process = Process.Start(info);
                if (process is null) continue;
                var version = process.StandardOutput.ReadToEnd().Trim();
                if (!process.WaitForExit(10000)) { process.Kill(); continue; }
                if (process.ExitCode == 0 && version.Length > 0) return (path, args, version);
            }
            catch (Exception)
            {
                // Try the next candidate.
            }
        }
        return null;
    }
}
