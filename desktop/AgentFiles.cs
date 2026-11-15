using System.Diagnostics;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.VisualBasic.FileIO;

namespace PythonScratchpad;

/// <summary>
/// My Agents on disk. Each agent is one folder holding its own files and a small description
/// file. The agent runs in that folder, so what it reads, imports and writes belongs to it alone
/// and nothing in the Scratchpad's folder can change it.
/// </summary>
internal sealed partial class AgentFiles(Action<object> send)
{
    /// <summary>The description file. Its ending is not one a file tab may have, so it can never clash with the agent's own files.</summary>
    private const string MetaName = "agent.meta";

    private sealed class Meta
    {
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Main { get; set; } = "";
        public long Created { get; set; }
        public long Updated { get; set; }
        public double SpentUsd { get; set; }
    }

    private static readonly JsonSerializerOptions Json = new() { PropertyNamingPolicy = JsonNamingPolicy.CamelCase, WriteIndented = true };

    [GeneratedRegex("^[a-z0-9][a-z0-9_-]{0,50}$")]
    private static partial Regex IdPattern();

    private static long Now => DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();

    /// <summary>Tells the page every saved agent, with the text of its files.</summary>
    public void List(string? created = null)
    {
        try
        {
            Directory.CreateDirectory(AppPaths.Agents);
            var agents = new List<(long Created, object Agent)>();
            foreach (var dir in Directory.GetDirectories(AppPaths.Agents))
            {
                var meta = ReadMeta(dir);
                if (meta is null) continue;
                var (files, skipped) = WorkFiles.ReadFolder(dir);
                agents.Add((meta.Created, new { id = Path.GetFileName(dir), name = meta.Name, description = meta.Description, main = meta.Main, created = meta.Created, updated = meta.Updated, spentUsd = meta.SpentUsd, files, skipped }));
            }
            send(new { type = "agents", agents = agents.OrderBy(a => a.Created).Select(a => a.Agent).ToList(), created, folder = AppPaths.Agents });
        }
        catch (Exception ex)
        {
            send(new { type = "agents", agents = Array.Empty<object>(), problem = $"The saved agents could not be read: {ex.Message}", folder = AppPaths.Agents });
        }
    }

    /// <summary>Makes a new agent folder from a set of files, one of which is the script that runs.</summary>
    public void Create(string name, string description, string main, JsonElement files)
    {
        try
        {
            if (files.ValueKind != JsonValueKind.Object) throw new ArgumentException("No files were given.");
            var texts = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (var file in files.EnumerateObject())
            {
                if (!WorkFiles.Allowed(file.Name) || file.Value.ValueKind != JsonValueKind.String) throw new ArgumentException($"“{file.Name}” is not a file an agent can hold.");
                texts[file.Name] = file.Value.GetString() ?? "";
            }
            if (!texts.ContainsKey(main) || !main.EndsWith(".py", StringComparison.OrdinalIgnoreCase)) throw new ArgumentException("The script to run must be one of the agent's Python files.");

            Directory.CreateDirectory(AppPaths.Agents);
            var taken = Directory.GetDirectories(AppPaths.Agents).Select(d => ReadMeta(d)?.Name).Where(n => n is not null).ToHashSet(StringComparer.OrdinalIgnoreCase);
            var wanted = name.Trim().Length > 0 ? name.Trim() : "Agent";
            var unique = wanted;
            for (var n = 2; taken.Contains(unique); n++) unique = $"{wanted} {n}";

            var slug = Regex.Replace(unique.ToLowerInvariant(), "[^a-z0-9_-]+", "-").Trim('-', '_');
            if (slug.Length == 0) slug = "agent";
            if (slug.Length > 40) slug = slug[..40].TrimEnd('-', '_');
            var id = slug;
            for (var n = 2; Directory.Exists(Path.Combine(AppPaths.Agents, id)); n++) id = $"{slug}-{n}";

            var dir = Path.Combine(AppPaths.Agents, id);
            Directory.CreateDirectory(dir);
            foreach (var (file, text) in texts) File.WriteAllText(Path.Combine(dir, file), text, new UTF8Encoding(false));
            WriteMeta(dir, new Meta { Name = unique, Description = description, Main = main, Created = Now, Updated = Now });
            List(created: id);
        }
        catch (Exception ex)
        {
            send(new { type = "agentProblem", problem = $"The agent could not be saved: {ex.Message}" });
        }
    }

    /// <summary>Changes the name, description or main script, or adds to the estimated spend.</summary>
    public void Change(string id, JsonElement message)
    {
        try
        {
            var dir = Folder(id);
            var meta = ReadMeta(dir) ?? throw new FileNotFoundException("That agent no longer exists.");
            string? Text(string name) => message.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() : null;
            if (Text("name") is { } name) meta.Name = name;
            if (Text("description") is { } description) meta.Description = description;
            if (Text("main") is { } main)
            {
                if (!WorkFiles.Allowed(main) || !main.EndsWith(".py", StringComparison.OrdinalIgnoreCase) || !File.Exists(Path.Combine(dir, main))) throw new ArgumentException("The script to run must be one of the agent's Python files.");
                meta.Main = main;
            }
            if (message.TryGetProperty("spent", out var spent) && spent.TryGetDouble(out var usd) && usd > 0) meta.SpentUsd += usd;
            else meta.Updated = Now;
            WriteMeta(dir, meta);
        }
        catch (Exception ex)
        {
            send(new { type = "agentProblem", problem = $"The change could not be saved: {ex.Message}" });
        }
    }

    public void Write(string id, string name, string text)
    {
        try
        {
            File.WriteAllText(FilePath(id, name), text, new UTF8Encoding(false));
        }
        catch (Exception ex)
        {
            send(new { type = "agentProblem", problem = $"“{name}” could not be saved: {ex.Message}" });
        }
    }

    /// <summary>Moves one of the agent's files to the Recycle Bin. The script that runs cannot be removed.</summary>
    public void DeleteFile(string id, string name)
    {
        try
        {
            var path = FilePath(id, name);
            if (string.Equals(ReadMeta(Folder(id))?.Main, name, StringComparison.OrdinalIgnoreCase)) throw new InvalidOperationException("that is the script the agent runs.");
            if (File.Exists(path)) FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
        }
        catch (Exception ex)
        {
            send(new { type = "agentProblem", problem = $"“{name}” could not be removed: {ex.Message}" });
        }
        List();
    }

    /// <summary>Moves the whole agent folder to the Recycle Bin.</summary>
    public void Delete(string id)
    {
        try
        {
            FileSystem.DeleteDirectory(Folder(id), UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
        }
        catch (Exception ex)
        {
            send(new { type = "agentProblem", problem = $"The agent could not be deleted: {ex.Message}" });
        }
        List();
    }

    public void OpenFolder(string id)
    {
        var dir = id.Length > 0 ? Folder(id) : AppPaths.Agents;
        Directory.CreateDirectory(dir);
        Process.Start(new ProcessStartInfo("explorer.exe") { ArgumentList = { dir } })?.Dispose();
    }

    /// <summary>Keeps a copy of the agents saved by an earlier version of the app, which held them inside the window.</summary>
    public void Backup(string json)
    {
        try
        {
            Directory.CreateDirectory(AppPaths.Agents);
            File.WriteAllText(Path.Combine(AppPaths.Agents, $"agents-from-earlier-version-{DateTime.Now:yyyyMMdd-HHmmss}.backup.json"), json, new UTF8Encoding(false));
            send(new { type = "agentsBackedUp" });
        }
        catch (Exception)
        {
            // Without the copy on disk the page keeps its own, and tries again next time.
        }
    }

    /// <summary>The folder and main script of an agent that is about to be started.</summary>
    public (string Folder, string Main) Runnable(string id)
    {
        var dir = Folder(id);
        var meta = ReadMeta(dir) ?? throw new FileNotFoundException("That agent no longer exists.");
        if (!WorkFiles.Allowed(meta.Main) || !File.Exists(Path.Combine(dir, meta.Main))) throw new FileNotFoundException($"The agent's script, {meta.Main}, is missing from its folder.");
        return (dir, meta.Main);
    }

    private static string Folder(string id)
    {
        if (!IdPattern().IsMatch(id)) throw new ArgumentException("That is not an agent.");
        var dir = Path.Combine(AppPaths.Agents, id);
        if (!Directory.Exists(dir)) throw new DirectoryNotFoundException("That agent no longer exists.");
        return dir;
    }

    private static string FilePath(string id, string name)
    {
        if (!WorkFiles.Allowed(name)) throw new ArgumentException("That is not a file name an agent can use.");
        return Path.Combine(Folder(id), name);
    }

    private static Meta? ReadMeta(string dir)
    {
        try
        {
            var path = Path.Combine(dir, MetaName);
            return File.Exists(path) ? JsonSerializer.Deserialize<Meta>(File.ReadAllText(path, Encoding.UTF8), Json) : null;
        }
        catch (Exception)
        {
            return null;
        }
    }

    private static void WriteMeta(string dir, Meta meta) => File.WriteAllText(Path.Combine(dir, MetaName), JsonSerializer.Serialize(meta, Json), new UTF8Encoding(false));
}
