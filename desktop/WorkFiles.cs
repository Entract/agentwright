using System.Text;
using Microsoft.VisualBasic.FileIO;

namespace PythonScratchpad;

/// <summary>
/// The Scratchpad's file tabs: small text files kept in the working folder, next to where
/// programs run. Only plain file names with a known text extension are accepted, so the page
/// can never reach outside that folder.
/// </summary>
internal sealed class WorkFiles(Action<object> send)
{
    private static readonly string[] Extensions = [".py", ".json", ".txt", ".csv", ".md"];
    private const int MaxFiles = 40;
    private const long MaxFileBytes = 200_000;
    private const long MaxTotalBytes = 2_000_000;

    /// <summary>Tells the page which files are in the folder, with their text.</summary>
    public void List()
    {
        try
        {
            Directory.CreateDirectory(AppPaths.Work);
            var files = new List<object>();
            long total = 0;
            var skipped = 0;
            foreach (var info in new DirectoryInfo(AppPaths.Work).GetFiles().OrderBy(f => f.Name, StringComparer.OrdinalIgnoreCase))
            {
                if (!Allowed(info.Name)) continue;
                if (files.Count >= MaxFiles || info.Length > MaxFileBytes || total + info.Length > MaxTotalBytes)
                {
                    skipped++;
                    continue;
                }
                try
                {
                    files.Add(new { name = info.Name, text = File.ReadAllText(info.FullName, Encoding.UTF8) });
                    total += info.Length;
                }
                catch (IOException)
                {
                    skipped++; // open in another program
                }
            }
            send(new { type = "files", files, skipped });
        }
        catch (Exception ex)
        {
            send(new { type = "files", files = Array.Empty<object>(), skipped = 0, problem = ex.Message });
        }
    }

    public void Write(string name, string text)
    {
        try
        {
            File.WriteAllText(PathFor(name), text, new UTF8Encoding(false));
        }
        catch (Exception ex)
        {
            send(new { type = "fileProblem", name, problem = $"“{name}” could not be saved: {ex.Message}" });
        }
    }

    /// <summary>Moves the file to the Recycle Bin, so a mistaken delete can be undone.</summary>
    public void Delete(string name)
    {
        try
        {
            var path = PathFor(name);
            if (File.Exists(path)) FileSystem.DeleteFile(path, UIOption.OnlyErrorDialogs, RecycleOption.SendToRecycleBin);
        }
        catch (Exception ex)
        {
            send(new { type = "fileProblem", name, problem = $"“{name}” could not be removed: {ex.Message}" });
        }
        List();
    }

    /// <summary>The full path of a file tab, or an exception when the name is not a plain, allowed file name.</summary>
    public static string PathFor(string name)
    {
        if (!Allowed(name)) throw new ArgumentException("That is not a file name the Scratchpad can use.");
        return Path.Combine(AppPaths.Work, name);
    }

    private static bool Allowed(string name) =>
        name.Length is > 0 and <= 80
        && name == Path.GetFileName(name)
        && name.IndexOfAny(Path.GetInvalidFileNameChars()) < 0
        && !name.StartsWith('.')
        && Extensions.Contains(Path.GetExtension(name), StringComparer.OrdinalIgnoreCase);
}
