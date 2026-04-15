using Microsoft.AspNetCore.Mvc;
using FarmaciaAgent.Services;
using System.Text.Json;

namespace FarmaciaAgent.Controllers;

[ApiController]
[Route("api/whatsapp")]
public class WhatsAppController : ControllerBase
{
    private readonly ConversationService _conversationService;
    private readonly ILogger<WhatsAppController> _logger;
    private readonly string _verifyToken;

    public WhatsAppController(ConversationService conversationService, ILogger<WhatsAppController> logger, IConfiguration config)
    {
        _conversationService = conversationService;
        _logger = logger;
        _verifyToken = config["WHATSAPP_VERIFY_TOKEN"] ?? "";
    }

    // Verificación del webhook por Meta
    [HttpGet]
    public IActionResult Verify(
        [FromQuery(Name = "hub.mode")] string mode,
        [FromQuery(Name = "hub.challenge")] string challenge,
        [FromQuery(Name = "hub.verify_token")] string token)
    {
        if (mode == "subscribe" && token == _verifyToken)
            return Ok(challenge);

        return Forbid();
    }

    // Recepción de mensajes entrantes
    [HttpPost]
    public async Task<IActionResult> Receive([FromBody] JsonElement body)
    {
        try
        {
            var entry = body
                .GetProperty("entry")[0]
                .GetProperty("changes")[0]
                .GetProperty("value");

            if (!entry.TryGetProperty("messages", out var messages))
                return Ok(); // evento de status, ignorar

            var message = messages[0];
            var from = message.GetProperty("from").GetString() ?? "";
            var msgType = message.GetProperty("type").GetString() ?? "";

            if (msgType != "text")
                return Ok();

            var text = message.GetProperty("text").GetProperty("body").GetString() ?? "";

            _logger.LogInformation("Mensaje de {From}: {Text}", from, text);

            await _conversationService.HandleIncomingMessage(from, text);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando webhook de WhatsApp");
        }

        return Ok();
    }
}
