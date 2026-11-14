using System.Security.Cryptography;
using System.Text;

namespace PythonScratchpad;

/// <summary>
/// The Anthropic API key, encrypted with Windows data protection (DPAPI) for the
/// signed-in Windows user. The file is useless on another PC or to another user.
/// The key is only ever handed to the Python program being run, as the
/// ANTHROPIC_API_KEY environment variable; the scratchpad page never sees it.
/// </summary>
internal static class KeyStore
{
    private static readonly byte[] Purpose = Encoding.UTF8.GetBytes("PythonScratchpad.AnthropicKey");
    private static string FilePath => Path.Combine(AppPaths.Data, "anthropic-key.bin");

    public static bool HasKey() => File.Exists(FilePath);

    public static string? Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return null;
            var plain = ProtectedData.Unprotect(File.ReadAllBytes(FilePath), Purpose, DataProtectionScope.CurrentUser);
            var key = Encoding.UTF8.GetString(plain);
            return key.Length > 0 ? key : null;
        }
        catch (Exception)
        {
            return null; // Unreadable (for example copied from another PC): treat as no key.
        }
    }

    public static void Save(string key)
    {
        Directory.CreateDirectory(AppPaths.Data);
        File.WriteAllBytes(FilePath, ProtectedData.Protect(Encoding.UTF8.GetBytes(key.Trim()), Purpose, DataProtectionScope.CurrentUser));
    }

    public static void Remove()
    {
        if (File.Exists(FilePath)) File.Delete(FilePath);
    }
}

/// <summary>A small native dialog for typing the key, so it never passes through the web page.</summary>
internal sealed class KeyDialog : Form
{
    private readonly TextBox box = new() { UseSystemPasswordChar = true, Dock = DockStyle.Top };

    public KeyDialog(bool hasKey)
    {
        Text = "Anthropic API key";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        MaximizeBox = false;
        MinimizeBox = false;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.CenterParent;
        AutoScaleMode = AutoScaleMode.Font;
        ClientSize = new Size(440, 190);
        Padding = new Padding(14);

        var note = new Label
        {
            Dock = DockStyle.Top,
            Height = 84,
            Text = (hasKey ? "A key is saved. Type a new one to replace it, or remove it.\n\n" : "") +
                   "The key is kept encrypted for your Windows account on this PC. Programs run with the PC's Python receive it as ANTHROPIC_API_KEY, so it never has to appear in your code.",
        };
        var save = new Button { Text = "&Save", AutoSize = true, Enabled = false };
        var remove = new Button { Text = "&Remove key", AutoSize = true, Enabled = hasKey };
        var cancel = new Button { Text = "Cancel", AutoSize = true, DialogResult = DialogResult.Cancel };
        var buttons = new FlowLayoutPanel { Dock = DockStyle.Bottom, FlowDirection = FlowDirection.RightToLeft, Height = 40 };
        buttons.Controls.AddRange([cancel, remove, save]);

        box.TextChanged += (_, _) => save.Enabled = box.Text.Trim().Length > 0;
        save.Click += (_, _) => Finish(() => KeyStore.Save(box.Text));
        remove.Click += (_, _) => Finish(KeyStore.Remove);

        Controls.Add(buttons);
        Controls.Add(box);
        Controls.Add(note);
        AcceptButton = save;
        CancelButton = cancel;
        ActiveControl = box;
    }

    private void Finish(Action action)
    {
        try
        {
            action();
            DialogResult = DialogResult.OK;
        }
        catch (Exception ex)
        {
            MessageBox.Show(this, ex.Message, "The key could not be changed", MessageBoxButtons.OK, MessageBoxIcon.Error);
        }
    }
}
