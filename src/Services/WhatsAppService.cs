using System.Text;
using System.Text.Json;
using FarmaciaAgent.Models;

namespace FarmaciaAgent.Services;

public class WhatsAppService
{
    private readonly HttpClient _http;
    private readonly string _token;
    private readonly string _phoneId;
    private readonly ILogger<WhatsAppService> _logger;

    public WhatsAppService(HttpClient http, IConfiguration config, ILogger<WhatsAppService> logger)
    {
        _http = http;
        _token = config["WHATSAPP_TOKEN"] ?? throw new InvalidOperationException("WHATSAPP_TOKEN no configurado");
        _phoneId = config["WHATSAPP_PHONE_ID"] ?? throw new InvalidOperationException("WHATSAPP_PHONE_ID no configurado");
        _logger = logger;
    }

    public async Task SendMessage(string to, string text)
    {
        var url = $"https://graph.facebook.com/v19.0/{_phoneId}/messages";

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

        if (!response.IsSuccessStatusCode)
        {
            var error = await response.Content.ReadAsStringAsync();
            _logger.LogError("Error enviando mensaje WhatsApp a {To}: {Error}", to, error);
        }
    }
}
