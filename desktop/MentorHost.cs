using System.Text.Json;
using Anthropic;
using Anthropic.Models.Messages;

namespace PythonScratchpad;

/// <summary>
/// Sends the Ask Mentor conversation to Claude and passes the reply back to the page as it
/// arrives. The call is made here, not in the page, so the saved API key never reaches the page.
/// The page supplies the instructions and the conversation; nothing is sent unless it asks.
/// </summary>
internal sealed class MentorHost(Action<object> send)
{
    private const string ModelId = "claude-opus-5-5";
    private readonly object gate = new();
    private CancellationTokenSource? current;

    public void Stop()
    {
        lock (gate) current?.Cancel();
    }

    public async Task AskAsync(int id, string system, JsonElement conversation)
    {
        // SCRATCHPAD_MENTOR_URL exists for testing: it points the call at a local stand-in.
        var testUrl = Environment.GetEnvironmentVariable("SCRATCHPAD_MENTOR_URL");
        var key = KeyStore.Load() ?? (string.IsNullOrEmpty(testUrl) ? null : "test-key");
        if (key is null)
        {
            send(new { type = "mentorDone", id, problem = "No API key is saved. Press Key… and enter your Anthropic key first." });
            return;
        }

        List<MessageParam> messages = [];
        if (conversation.ValueKind == JsonValueKind.Array)
        {
            foreach (var item in conversation.EnumerateArray())
            {
                var role = item.TryGetProperty("role", out var r) ? r.GetString() : null;
                var content = item.TryGetProperty("content", out var c) ? c.GetString() ?? "" : "";
                if (content.Length == 0) continue;
                if (role == "assistant") messages.Add(new AssistantMessageParam { Content = content });
                else messages.Add(new UserMessageParam { Content = content });
            }
        }
        if (messages.Count == 0)
        {
            send(new { type = "mentorDone", id, problem = "There was nothing to send." });
            return;
        }

        var cancel = new CancellationTokenSource();
        lock (gate)
        {
            current?.Cancel();
            current = cancel;
        }
        try
        {
            var client = string.IsNullOrEmpty(testUrl) ? new AnthropicClient { ApiKey = key } : new AnthropicClient { ApiKey = key, BaseUrl = testUrl };
            var parameters = new MessageCreateParams
            {
                Model = ModelId,
                MaxTokens = 16000,
                System = system,
                Messages = messages,
            };
            string? stopReason = null;
            await foreach (var streamEvent in client.Messages.CreateStreaming(parameters, cancellationToken: cancel.Token))
            {
                if (streamEvent.TryPickContentBlockDelta(out var delta) && delta.Delta.TryPickText(out var text))
                    send(new { type = "mentorText", id, text = text.Text });
                else if (streamEvent.TryPickDelta(out var end) && end.Delta.StopReason is { } reason)
                    stopReason = reason.Raw();
            }
            var problem = stopReason switch
            {
                "refusal" => "Claude declined to answer this one. Reword the question and try again.",
                "max_tokens" => "The reply was cut off because it reached the length limit.",
                _ => null,
            };
            send(new { type = "mentorDone", id, problem });
        }
        catch (OperationCanceledException)
        {
            send(new { type = "mentorDone", id, stopped = true });
        }
        catch (Exception ex)
        {
            send(new { type = "mentorDone", id, problem = Describe(ex) });
        }
        finally
        {
            lock (gate)
            {
                if (ReferenceEquals(current, cancel)) current = null;
            }
            cancel.Dispose();
        }
    }

    private static string Describe(Exception ex)
    {
        var message = ex.Message;
        if (message.Contains("401") || message.Contains("authentication", StringComparison.OrdinalIgnoreCase))
            return "Anthropic did not accept the saved API key. Press Key… and enter it again.";
        if (message.Contains("429")) return "Anthropic is limiting requests on this key right now. Wait a moment and try again.";
        if (ex is HttpRequestException) return "Anthropic could not be reached. Check the internet connection and try again.";
        return "The mentor could not answer: " + (message.Length > 300 ? message[..300] + "…" : message);
    }
}
