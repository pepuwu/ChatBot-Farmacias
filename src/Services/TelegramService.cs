using Telegram.Bot;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using FarmaciaAgent.Data;
using FarmaciaAgent.Models;
using Microsoft.EntityFrameworkCore;

namespace FarmaciaAgent.Services;

public class TelegramService : BackgroundService
{
    private readonly ITelegramBotClient _bot;
    private readonly FarmaciaConfig _farmacia;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TelegramService> _logger;
    private readonly long _adminId;
    private readonly string? _webhookUrl;
    private readonly bool _useWebhook;

    public TelegramService(
        IConfiguration config,
        IHostEnvironment env,
        FarmaciaConfig farmacia,
        IServiceScopeFactory scopeFactory,
        ILogger<TelegramService> logger)
    {
        var token = config["TELEGRAM_BOT_TOKEN"] ?? throw new InvalidOperationException("TELEGRAM_BOT_TOKEN no configurado");
        _bot = new TelegramBotClient(token);
        var adminIdStr = config["TELEGRAM_ADMIN_ID"] ?? farmacia.TelegramAdminId;
        _adminId = long.Parse(adminIdStr);
        _webhookUrl = config["TELEGRAM_WEBHOOK_URL"];
        _useWebhook = env.IsProduction() || !string.IsNullOrWhiteSpace(_webhookUrl);
        _farmacia = farmacia;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (_useWebhook)
        {
            if (string.IsNullOrWhiteSpace(_webhookUrl))
            {
                _logger.LogError("Modo webhook activo pero TELEGRAM_WEBHOOK_URL no está configurado.");
                return;
            }

            var url = _webhookUrl.TrimEnd('/') + "/api/telegram";
            await _bot.SetWebhook(url, cancellationToken: stoppingToken);
            _logger.LogInformation("Telegram webhook registrado en {Url}. Admin ID: {AdminId}", url, _adminId);

            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
        else
        {
            _logger.LogInformation("Telegram polling iniciado. Admin ID: {AdminId}", _adminId);

            await _bot.DeleteWebhook(cancellationToken: stoppingToken);

            var receiverOptions = new ReceiverOptions { AllowedUpdates = [UpdateType.Message] };

            _bot.StartReceiving(
                updateHandler: HandleUpdateCallback,
                errorHandler: HandleError,
                receiverOptions: receiverOptions,
                cancellationToken: stoppingToken
            );

            await Task.Delay(Timeout.Infinite, stoppingToken);
        }
    }

    // Callback para polling
    private async Task HandleUpdateCallback(ITelegramBotClient bot, Update update, CancellationToken ct)
    {
        if (update.Message?.Text is not { } text)
            return;

        var chatId = update.Message.From?.Id ?? 0;

        if (chatId != _adminId)
        {
            await bot.SendMessage(chatId, "No autorizado.", cancellationToken: ct);
            return;
        }

        await HandleUpdate(update);
    }

    // Punto de entrada desde TelegramController (webhook) y polling
    public async Task HandleUpdate(Update update)
    {
        if (update.Message?.Text is not { } text)
            return;

        var chatId = update.Message.From?.Id ?? 0;

        // Validar admin también en webhook
        if (chatId != _adminId)
        {
            await _bot.SendMessage(chatId, "No autorizado.");
            return;
        }

        _logger.LogInformation("Comando de admin {ChatId}: {Text}", chatId, text);

        try
        {
            if (text.StartsWith("/tomar"))
                await HandleTomar(chatId, text);
            else if (text.StartsWith("/fin"))
                await HandleFin(chatId);
            else if (text.StartsWith("/cola"))
                await HandleCola(chatId);
            else if (text.StartsWith("/oferta"))
                await HandleOferta(chatId, text);
            else if (text.StartsWith("/ayuda") || text == "/start")
                await HandleAyuda(chatId);
            else
                await HandleAyuda(chatId);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error manejando mensaje Telegram");
            await _bot.SendMessage(chatId, "Error procesando el comando.");
        }
    }

    private async Task HandleTomar(long chatId, string text)
    {
        var parts = text.Split(' ', 2);
        if (parts.Length < 2)
        {
            await _bot.SendMessage(chatId, "Uso: /tomar [número de teléfono]");
            return;
        }

        var telefono = parts[1].Trim();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var conversationService = scope.ServiceProvider.GetRequiredService<ConversationService>();

        var cliente = await db.Clientes.FirstOrDefaultAsync(c => c.Telefono == telefono);
        if (cliente is null)
        {
            await _bot.SendMessage(chatId, $"No encontré al cliente con número {telefono}.");
            return;
        }

        var conversacion = await conversationService.ObtenerConversacionActiva(cliente.Id);
        await conversationService.CambiarEstado(conversacion.Id, "farmaceutico");

        await _bot.SendMessage(chatId, $"✅ Tomaste control de la conversación con {telefono}. El bot está silenciado.\nUsá /fin para liberar.");
    }

    private async Task HandleFin(long chatId)
    {
        using var scope = _scopeFactory.CreateScope();
        var conversationService = scope.ServiceProvider.GetRequiredService<ConversationService>();

        var conversaciones = await conversationService.GetConversacionesConFarmaceutico();

        if (conversaciones.Count == 0)
        {
            await _bot.SendMessage(chatId, "No hay conversaciones activas bajo tu control.");
            return;
        }

        foreach (var conv in conversaciones)
        {
            await conversationService.CambiarEstado(conv.Id, "bot");
            _logger.LogInformation("Farmacéutico liberó conversación con {Telefono}", conv.Cliente?.Telefono);
        }

        await _bot.SendMessage(chatId, $"✅ {conversaciones.Count} conversación(es) devuelta(s) al bot.");
    }

    private async Task HandleCola(long chatId)
    {
        using var scope = _scopeFactory.CreateScope();
        var conversationService = scope.ServiceProvider.GetRequiredService<ConversationService>();

        var cola = await conversationService.GetConversacionesEnEspera();

        if (cola.Count == 0)
        {
            await _bot.SendMessage(chatId, "No hay clientes en espera.");
            return;
        }

        var lines = cola.Select((c, i) => $"{i + 1}. {c.Cliente?.Telefono} — desde {c.UpdatedAt:HH:mm}");
        await _bot.SendMessage(chatId, $"⏳ Clientes esperando:\n\n{string.Join("\n", lines)}");
    }

    private async Task HandleOferta(long chatId, string text)
    {
        var parts = text.Split(' ', 2);
        if (parts.Length < 2 || string.IsNullOrWhiteSpace(parts[1]))
        {
            await _bot.SendMessage(chatId,
                "Uso: /oferta [texto de la oferta]\n" +
                "Ejemplo: /oferta Ibuprofeno 400mg x20 comp $2500 solo hoy");
            return;
        }

        var oferta = parts[1].Trim();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var whatsAppService = scope.ServiceProvider.GetRequiredService<WhatsAppService>();

        var clientes = await db.Clientes.ToListAsync();

        if (clientes.Count == 0)
        {
            await _bot.SendMessage(chatId, "No hay clientes registrados aún.");
            return;
        }

        var mensaje =
            $"💊 Oferta {_farmacia.Nombre}\n\n" +
            $"{oferta}\n\n" +
            $"¿Querés que te reservemos uno? Respondé SÍ";

        var enviados = 0;
        var simulados = new List<string>();

        foreach (var cliente in clientes)
        {
            var enviado = await whatsAppService.SendMessage(cliente.Telefono, mensaje);
            if (enviado)
                enviados++;
            else
                simulados.Add(cliente.Telefono);
        }

        if (whatsAppService.SimulationMode)
        {
            var lista = string.Join("\n", simulados.Select(t => $"  • {t}"));
            await _bot.SendMessage(chatId,
                $"⚠️ WhatsApp no configurado — simulación:\n\n" +
                $"Se hubiera enviado a {simulados.Count} cliente(s):\n{lista}");
        }
        else
        {
            await _bot.SendMessage(chatId, $"✅ Oferta enviada a {enviados} cliente(s).");
        }
    }

    private async Task HandleAyuda(long chatId)
    {
        await _bot.SendMessage(chatId,
            $"🤖 Bot de {_farmacia.Nombre}\n\n" +
            "Comandos disponibles:\n" +
            "• /tomar [número] — tomar control de una conversación\n" +
            "• /fin — devolver conversaciones al bot\n" +
            "• /cola — ver clientes en espera\n" +
            "• /oferta [texto] — enviar oferta a todos los clientes\n" +
            "• /ayuda — mostrar este menú");
    }

    private Task HandleError(ITelegramBotClient bot, Exception ex, HandleErrorSource source, CancellationToken ct)
    {
        _logger.LogError(ex, "Error en Telegram polling ({Source})", source);
        return Task.CompletedTask;
    }
}
