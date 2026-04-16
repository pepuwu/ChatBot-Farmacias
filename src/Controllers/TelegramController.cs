using Microsoft.AspNetCore.Mvc;
using Telegram.Bot.Types;
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
    public async Task<IActionResult> Update([FromBody] Update update)
    {
        _logger.LogInformation("Telegram webhook recibió update. Type={Type} ChatId={ChatId} Text={Text}",
            update.Type,
            update.Message?.Chat?.Id,
            update.Message?.Text);

        try
        {
            await _telegramService.HandleUpdate(update);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error procesando update de Telegram");
        }

        // Telegram requiere 200 OK siempre, incluso si hubo error interno
        return Ok();
    }

    // Endpoint de diagnóstico — GET /api/telegram/status
    [HttpGet("status")]
    public IActionResult Status()
    {
        return Ok(new
        {
            webhook = "activo",
            endpoint = "/api/telegram",
            timestamp = DateTime.UtcNow
        });
    }
}
