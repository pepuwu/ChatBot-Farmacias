using Microsoft.AspNetCore.Mvc;
using Telegram.Bot.Types;
using Newtonsoft.Json;
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
        string body;
        using (var reader = new StreamReader(Request.Body))
            body = await reader.ReadToEndAsync();

        _logger.LogInformation("Telegram webhook recibió body: {Body}", body);

        Update? update;
        try
        {
            update = JsonConvert.DeserializeObject<Update>(body);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error deserializando Update de Telegram");
            return Ok(); // siempre 200 para que Telegram no reintente
        }

        if (update is null)
        {
            _logger.LogWarning("Update deserializado como null");
            return Ok();
        }

        _logger.LogInformation("Update procesado. Type={Type} ChatId={ChatId} Text={Text}",
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

        return Ok();
    }

    [HttpGet("status")]
    public IActionResult Status()
    {
        return Ok(new { webhook = "activo", endpoint = "/api/telegram", timestamp = DateTime.UtcNow });
    }
}
