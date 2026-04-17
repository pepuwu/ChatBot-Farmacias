using System.Text;
using System.Text.Json;

namespace FarmaciaAgent.Services;

public class WhatsAppService
{
    private readonly HttpClient _http;
    private readonly string? _token;
    private readonly string? _phoneId;
    private readonly ILogger<WhatsAppService> _logger;
    public bool SimulationMode { get; }

    public WhatsAppService(HttpClient http, IConfiguration config, ILogger<WhatsAppService> logger)
    {
        _http = http;
        _token = config["WHATSAPP_TOKEN"];
        _phoneId = config["WHATSAPP_PHONE_ID"];
        _logger = logger;
        SimulationMode = string.IsNullOrWhiteSpace(_token) || string.IsNullOrWhiteSpace(_phoneId);

        if (SimulationMode)
            _logger.LogWarning("WhatsApp no configurado — mensajes serán simulados (no se enviarán realmente).");
    }

    public async Task<bool> SendMessage(string to, string text)
    {
        // Meta requiere el número con + (E.164). El webhook entrante lo manda sin +.
        if (!to.StartsWith("+"))
            to = "+" + to;

        if (SimulationMode)
        {
            _logger.LogInformation("[SIMULACIÓN] WhatsApp → {To}: {Text}", to, text);
            return false; // false = simulado
        }

        var url = $"https://graph.facebook.com/v25.0/{_phoneId}/messages";

        var payload = new
        {
            messaging_product = "whatsapp",
            to,
            type = "text",
            text = new { body = text }
        };

        var request = new HttpRequestMessage(HttpMethod.Post, url)
        {
            Content = new StringContent(JsonSerializer.Serialize(payload), Encoding.UTF8, "application/json")
        };
        request.Headers.Add("Authorization", $"Bearer {_token}");

        var response = await _http.SendAsync(request);

        var responseBody = await response.Content.ReadAsStringAsync();
        if (!response.IsSuccessStatusCode)
            _logger.LogError("Error WhatsApp {StatusCode} enviando a {To}: {Body}", (int)response.StatusCode, to, responseBody);
        else
            _logger.LogInformation("WhatsApp OK a {To}: {Body}", to, responseBody);

        return response.IsSuccessStatusCode;
    }
}
