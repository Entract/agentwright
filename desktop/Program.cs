using System.Text.Json;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

namespace PythonScratchpad;

/// <summary>
/// A small window that shows the scratchpad page from the "web" folder beside
/// this program. The page and the built-in Python runtime are local files, so
/// nothing is fetched from the network. The page can also ask this program to
/// run code with the Python installed on the PC (see <see cref="PythonHost"/>).
/// </summary>
internal static class Program
{
    // A made-up host name mapped to the local folder. ".example" never resolves
    // on the network, so a missing file cannot turn into a web request.
    private const string Host = "scratchpad.example";
    private static readonly string Origin = $"https://{Host}/";

    [STAThread]
    private static void Main()
    {
        ApplicationConfiguration.Initialize();
        Application.Run(new MainForm());
    }

    private sealed class MainForm : Form
    {
        private readonly WebView2 view = new() { Dock = DockStyle.Fill };
        private readonly PythonHost python;
        private readonly CourseHost course;
        private readonly MentorHost mentor;
        private readonly WorkFiles workFiles;
        private readonly AgentFiles agentFiles;

        public MainForm()
        {
            Text = "Python Scratchpad";
            // The window and taskbar use the icon built into the program; Windows scales it to the size it needs.
            using (var icon = typeof(Program).Assembly.GetManifestResourceStream("scratchpad.ico"))
                if (icon is not null) Icon = new Icon(icon, new Size(64, 64));
            ClientSize = new Size(600, 700);
            MinimumSize = new Size(420, 380);
            StartPosition = FormStartPosition.CenterScreen;
            Controls.Add(view);
            python = new PythonHost(Send);
            course = new CourseHost(python, Send);
            mentor = new MentorHost(Send);
            workFiles = new WorkFiles(Send);
            agentFiles = new AgentFiles(Send);
            Load += async (_, _) => await StartAsync();
            FormClosed += (_, _) => { python.Stop(); mentor.Stop(); };
        }

        private async Task StartAsync()
        {
            try
            {
                var web = Path.Combine(AppContext.BaseDirectory, "web");
                if (!File.Exists(Path.Combine(web, "scratchpad.html")))
                    throw new FileNotFoundException($"The scratchpad page is missing from {web}. Run \"npm run desktop\" in the app folder to rebuild.");

                // Settings and the saved code live in the user's profile, not beside the program.
                var environment = await CoreWebView2Environment.CreateAsync(null, AppPaths.Data);
                await view.EnsureCoreWebView2Async(environment);

                var core = view.CoreWebView2;
                core.SetVirtualHostNameToFolderMapping(Host, web, CoreWebView2HostResourceAccessKind.Deny);
                core.Settings.AreDefaultContextMenusEnabled = true;
                core.Settings.IsStatusBarEnabled = false;
                core.Settings.AreBrowserAcceleratorKeysEnabled = false; // F5 runs the code instead of reloading
                core.Settings.IsZoomControlEnabled = true;
                // The window is one local page: no pop-ups, and no navigating away from it.
                core.NewWindowRequested += (_, e) => e.Handled = true;
                core.NavigationStarting += (_, e) =>
                {
                    if (!e.Uri.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) e.Cancel = true;
                };
                core.WebMessageReceived += OnMessage;

                // WebView2 keeps its own copy of pages it has shown. After an update it
                // would go on showing the previous version, so the copy is dropped
                // whenever the installed page has changed. Saved code is not affected.
                var stamp = File.GetLastWriteTimeUtc(Path.Combine(web, "scratchpad.html")).Ticks.ToString();
                var stampFile = Path.Combine(AppPaths.Data, "page-version.txt");
                if (!File.Exists(stampFile) || File.ReadAllText(stampFile) != stamp)
                {
                    await core.Profile.ClearBrowsingDataAsync(CoreWebView2BrowsingDataKinds.DiskCache);
                    File.WriteAllText(stampFile, stamp);
                }
                core.Navigate($"{Origin}scratchpad.html?v={stamp}");
            }
            catch (Exception ex)
            {
                MessageBox.Show(this, ex.Message, "Python Scratchpad could not start", MessageBoxButtons.OK, MessageBoxIcon.Error);
                Close();
            }
        }

        /// <summary>Sends one message to the page. Safe to call from any thread.</summary>
        private void Send(object message)
        {
            var json = JsonSerializer.Serialize(message);
            if (IsDisposed || !IsHandleCreated) return;
            try
            {
                BeginInvoke(() =>
                {
                    if (!IsDisposed && view.CoreWebView2 is not null) view.CoreWebView2.PostWebMessageAsJson(json);
                });
            }
            catch (InvalidOperationException)
            {
                // The window is closing.
            }
        }

        private async void OnMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
        {
            // Only the local scratchpad page may ask for code to be run.
            if (!e.Source.StartsWith(Origin, StringComparison.OrdinalIgnoreCase)) return;
            try
            {
                using var doc = JsonDocument.Parse(e.WebMessageAsJson);
                var root = doc.RootElement;
                if (root.ValueKind != JsonValueKind.Object || !root.TryGetProperty("type", out var typeEl)) return;
                string Text(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.String ? v.GetString() ?? "" : "";
                int Number(string name) => root.TryGetProperty(name, out var v) && v.TryGetInt32(out var number) ? number : 0;
                JsonElement Files() => root.TryGetProperty("files", out var v) ? v : default;
                bool Flag(string name) => root.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
                switch (typeEl.GetString())
                {
                    case "hello":
                        Send(await python.DescribeAsync());
                        break;
                    case "run":
                        if (Text("agent") is { Length: > 0 } agentId)
                        {
                            try
                            {
                                var (folder, main) = agentFiles.Runnable(agentId);
                                python.RunAgent(Number("id"), folder, main);
                            }
                            catch (Exception ex)
                            {
                                Send(new { type = "exit", id = Number("id"), problem = ex.Message });
                            }
                        }
                        else python.Run(Number("id"), Text("code"), Flag("trace"), Text("file"));
                        break;
                    case "stdin":
                        python.SendInput(Text("text"));
                        break;
                    case "stop":
                        python.Stop();
                        break;
                    case "key":
                        using (var dialog = new KeyDialog(KeyStore.HasKey()))
                        {
                            dialog.ShowDialog(this);
                        }
                        Send(await python.DescribeAsync());
                        break;
                    case "mentor":
                        await mentor.AskAsync(Number("id"), Text("system"), root.TryGetProperty("messages", out var conversation) ? conversation.Clone() : default);
                        break;
                    case "mentorStop":
                        mentor.Stop();
                        break;
                    case "folder":
                        python.OpenWorkFolder();
                        break;
                    case "files":
                        workFiles.List();
                        break;
                    case "fileWrite":
                        workFiles.Write(Text("name"), Text("text"));
                        break;
                    case "agents":
                        agentFiles.List();
                        break;
                    case "agentCreate":
                        agentFiles.Create(Text("name"), Text("description"), Text("main"), Files());
                        break;
                    case "agentMeta":
                        agentFiles.Change(Text("id"), root);
                        break;
                    case "agentFileWrite":
                        agentFiles.Write(Text("id"), Text("name"), Text("text"));
                        break;
                    case "agentFileDelete":
                        agentFiles.DeleteFile(Text("id"), Text("name"));
                        break;
                    case "agentDelete":
                        agentFiles.Delete(Text("id"));
                        break;
                    case "agentFolder":
                        agentFiles.OpenFolder(Text("id"));
                        break;
                    case "agentsBackup":
                        agentFiles.Backup(Text("json"));
                        break;
                    case "fileDelete":
                        workFiles.Delete(Text("name"));
                        break;
                    case "course":
                        Send(await course.DescribeAsync());
                        break;
                    case "courseRun":
                        python.RunExercise(Number("id"), Text("exerciseId"), course.PrepareWorkspace(Text("exerciseId"), Files(), Text("explanation")), Flag("live"));
                        break;
                    case "courseCheck":
                        await course.CheckAsync(Number("id"), Text("exerciseId"), Files(), Text("explanation"));
                        break;
                    case "courseSolution":
                        await course.SolutionAsync(Text("exerciseId"));
                        break;
                    case "courseSave":
                        course.SaveProgress(Text("json"));
                        break;
                    case "courseExport":
                        course.Export(this);
                        break;
                    case "courseImport":
                        course.Import(this);
                        break;
                    case "size":
                        // The guided course shows the task beside the editor, so it needs a wider window.
                        var wanted = new Size(Math.Max(ClientSize.Width, Number("width")), Math.Max(ClientSize.Height, Number("height")));
                        var area = Screen.FromControl(this).WorkingArea;
                        if (WindowState == FormWindowState.Normal && wanted != ClientSize)
                        {
                            ClientSize = new Size(Math.Min(wanted.Width, area.Width - 40), Math.Min(wanted.Height, area.Height - 60));
                            Location = new Point(Math.Max(area.Left, Math.Min(Left, area.Right - Width)), Math.Max(area.Top, Math.Min(Top, area.Bottom - Height)));
                        }
                        break;
                }
            }
            catch (Exception ex)
            {
                Send(new { type = "problem", message = ex.Message });
            }
        }
    }
}

/// <summary>Where the scratchpad keeps its own files. The two environment variables exist for testing.</summary>
internal static class AppPaths
{
    public static string Data => Environment.GetEnvironmentVariable("SCRATCHPAD_DATA") is { Length: > 0 } custom
        ? custom
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "PythonScratchpad");

    /// <summary>Where saved agents live: one folder each, holding that agent's own files.</summary>
    public static string Agents => Environment.GetEnvironmentVariable("SCRATCHPAD_AGENTS") is { Length: > 0 } custom
        ? custom
        : Work + " Agents";

    /// <summary>The folder programs run in, so files they read and write are easy to find.</summary>
    public static string Work => Environment.GetEnvironmentVariable("SCRATCHPAD_WORK") is { Length: > 0 } custom
        ? custom
        : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments), "Python Scratchpad");
}
