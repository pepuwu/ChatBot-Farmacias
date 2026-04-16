using Microsoft.AspNetCore.Mvc;
using Telegram.Bot.Types;
using System.Text.Json;
using FarmaciaAgent.Services;

namespace FarmaciaAgent.Controllers;

[ApiController]
[Route("api/telegram")]
public class TelegramController : ControllerBase
{
    private readonly TelegramService _telegramService;
    private readonly ILogger<TelegramController> _logger;

    public TelegramController(TelegramService telegramService, ILogger<TelegramController> logger)
    {
        _telegramService = telegramService;
        _logger = logger;
    }

    [HttpPost]
    public async Task<IActionResult> Update()
    {
        using var reader = new StreamReader(Request.Body);
        var body = await reader.ReadToEndAsync();

        _logger.LogInformation("Telegram webhook body: {Body}", body);

        var update = JsonSerializer.Deserialize<Update>(body,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });

        if (update == null) return Ok();

        _logger.LogInformation("Update procesado. Type={Type} ChatId={ChatId} Text={Text}",
            update.Type, update.Message?.Chat?.Id, update.Message?.Text);

        try
        {
            await _telegramService.HandleUpdate(update);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando update de Telegram");
        }

        return Ok();
    }

    [HttpGet("status")]
    public IActionResult Status() =>
        Ok(new { webhook = "activo", endpoint = "/api/telegram", timestamp = DateTime.UtcNow });
}
