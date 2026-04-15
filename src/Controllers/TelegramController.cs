using Microsoft.AspNetCore.Mvc;
using Telegram.Bot.Types;
using FarmaciaAgent.Services;

namespace FarmaciaAgent.Controllers;

// El bot de Telegram usa polling (TelegramService lo maneja como BackgroundService).
// Este controller queda disponible si se prefiere migrar a webhooks en el futuro.

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
}
