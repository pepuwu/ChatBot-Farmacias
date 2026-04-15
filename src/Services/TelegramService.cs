using Telegram.Bot;
using Telegram.Bot.Polling;
using Telegram.Bot.Types;
using Telegram.Bot.Types.Enums;
using FarmaciaAgent.Models;
using FarmaciaAgent.Data;
using Microsoft.EntityFrameworkCore;
using System.Text.RegularExpressions;

namespace FarmaciaAgent.Services;

public class TelegramService : BackgroundService
{
    private readonly ITelegramBotClient _bot;
    private readonly StockService _stockService;
    private readonly ConversationService _conversationService;
    private readonly WhatsAppService _whatsAppService;
    private readonly FarmaciaConfig _farmacia;
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<TelegramService> _logger;
    private readonly long _adminId;

    public TelegramService(
        IConfiguration config,
        StockService stockService,
        ConversationService conversationService,
        WhatsAppService whatsAppService,
        FarmaciaConfig farmacia,
        IServiceScopeFactory scopeFactory,
        ILogger<TelegramService> logger)
    {
        var token = config["TELEGRAM_BOT_TOKEN"] ?? throw new InvalidOperationException("TELEGRAM_BOT_TOKEN no configurado");
        _bot = new TelegramBotClient(token);
        var adminIdStr = config["TELEGRAM_ADMIN_ID"] ?? farmacia.TelegramAdminId;
        _adminId = long.Parse(adminIdStr);
        _stockService = stockService;
        _conversationService = conversationService;
        _whatsAppService = whatsAppService;
        _farmacia = farmacia;
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("Telegram polling iniciado. Admin ID: {AdminId}", _adminId);

        var receiverOptions = new ReceiverOptions { AllowedUpdates = [UpdateType.Message] };

        _bot.StartReceiving(
            updateHandler: HandleUpdate,
            errorHandler: HandleError,
            receiverOptions: receiverOptions,
            cancellationToken: stoppingToken
        );

        await Task.Delay(Timeout.Infinite, stoppingToken);
    }

    public async Task HandleUpdate(ITelegramBotClient bot, Update update, CancellationToken ct)
    {
        if (update.Message?.Text is not { } text)
            return;

        var chatId = update.Message.From?.Id ?? 0;

        // Solo el admin puede usar el bot
        if (chatId != _adminId)
        {
            await bot.SendMessage(chatId, "No autorizado.", cancellationToken: ct);
            return;
        }

        await HandleUpdate(update);
    }

    public async Task HandleUpdate(Update update)
    {
        if (update.Message?.Text is not { } text)
            return;

        var chatId = update.Message.From?.Id ?? 0;

        try
        {
            if (text.StartsWith("/stock"))
                await HandleStock(chatId);
            else if (text.StartsWith("/tomar"))
                await HandleTomar(chatId, text);
            else if (text.StartsWith("/fin"))
                await HandleFin(chatId);
            else if (text.StartsWith("/cola"))
                await HandleCola(chatId);
            else if (text.StartsWith("/alertas"))
                await HandleAlertas(chatId);
            else
                await HandleStockNatural(chatId, text);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error manejando mensaje Telegram");
            await _bot.SendMessage(chatId, "Error procesando el comando.");
        }
    }

    private async Task HandleStock(long chatId)
    {
        var productos = await _stockService.GetTodoElStock();

        if (productos.Count == 0)
        {
            await _bot.SendMessage(chatId, "No hay productos cargados.");
            return;
        }

        var lines = productos.Select(p => $"• {p.Nombre}: {p.Stock} unidades" + (p.Precio > 0 ? $" (${p.Precio})" : ""));
        await _bot.SendMessage(chatId, $"📦 Stock actual:\n\n{string.Join("\n", lines)}");
    }

    private async Task HandleTomar(long chatId, string text)
    {
        // /tomar +5491112345678
        var parts = text.Split(' ', 2);
        if (parts.Length < 2)
        {
            await _bot.SendMessage(chatId, "Uso: /tomar [número de teléfono]");
            return;
        }

        var telefono = parts[1].Trim();

        using var scope = _scopeFactory.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

        var cliente = await db.Clientes.FirstOrDefaultAsync(c => c.Telefono == telefono);
        if (cliente is null)
        {
            await _bot.SendMessage(chatId, $"No encontré al cliente con número {telefono}.");
            return;
        }

        var conversacion = await _conversationService.ObtenerConversacionActiva(cliente.Id);
        await _conversationService.CambiarEstado(conversacion.Id, "farmaceutico");

        await _bot.SendMessage(chatId, $"✅ Tomaste control de la conversación con {telefono}. El bot está silenciado.\nUsá /fin para liberar.");
    }

    private async Task HandleFin(long chatId)
    {
        var conversaciones = await _conversationService.GetConversacionesConFarmaceutico();

        if (conversaciones.Count == 0)
        {
            await _bot.SendMessage(chatId, "No hay conversaciones activas bajo tu control.");
            return;
        }

        foreach (var conv in conversaciones)
        {
            await _conversationService.CambiarEstado(conv.Id, "bot");
            var telefono = conv.Cliente?.Telefono ?? "desconocido";
            _logger.LogInformation("Farmacéutico liberó conversación con {Telefono}", telefono);
        }

        await _bot.SendMessage(chatId, $"✅ {conversaciones.Count} conversación(es) devuelta(s) al bot.");
    }

    private async Task HandleCola(long chatId)
    {
        var cola = await _conversationService.GetConversacionesEnEspera();

        if (cola.Count == 0)
        {
            await _bot.SendMessage(chatId, "No hay clientes en espera.");
            return;
        }

        var lines = cola.Select((c, i) => $"{i + 1}. {c.Cliente?.Telefono} — desde {c.UpdatedAt:HH:mm}");
        await _bot.SendMessage(chatId, $"⏳ Clientes esperando:\n\n{string.Join("\n", lines)}");
    }

    private async Task HandleAlertas(long chatId)
    {
        var bajos = await _stockService.GetStockBajo();

        if (bajos.Count == 0)
        {
            await _bot.SendMessage(chatId, "✅ Todo el stock está bien.");
            return;
        }

        var lines = bajos.Select(p => $"⚠️ {p.Nombre}: solo {p.Stock} unidades");
        await _bot.SendMessage(chatId, $"Alertas de stock bajo:\n\n{string.Join("\n", lines)}");
    }

    // Interpreta mensajes naturales de stock: "Llegaron 50 ibuprofeno 400mg"
    private async Task HandleStockNatural(long chatId, string text)
    {
        var match = Regex.Match(text, @"(?:llegaron?|cargué?|sumá?|agreg[aué]+)\s+(\d+)\s+(.+)", RegexOptions.IgnoreCase);

        if (!match.Success)
        {
            await _bot.SendMessage(chatId,
                "No entendí el comando. Podés usar:\n" +
                "• /stock — ver todo el stock\n" +
                "• /tomar [número] — tomar control de una conversación\n" +
                "• /fin — liberar conversaciones\n" +
                "• /cola — ver clientes en espera\n" +
                "• /alertas — ver stock bajo\n" +
                "• \"Llegaron 50 ibuprofeno 400mg\" — actualizar stock");
            return;
        }

        var cantidad = int.Parse(match.Groups[1].Value);
        var productoNombre = match.Groups[2].Value.Trim();

        await _stockService.ActualizarStock(productoNombre, cantidad);
        await _bot.SendMessage(chatId, $"✅ Stock actualizado: +{cantidad} {productoNombre}");

        // Notificar a clientes en lista de espera
        var enEspera = await _stockService.GetListaEsperaPorProducto(productoNombre);
        if (enEspera.Count > 0)
        {
            foreach (var item in enEspera)
            {
                var telefono = item.Cliente?.Telefono;
                if (telefono is not null)
                {
                    await _whatsAppService.SendMessage(telefono,
                        $"¡Hola! Te avisamos que {productoNombre} ya está disponible en {_farmacia.Nombre}. ¡Pasá o pedí tu delivery!");
                }
            }

            await _stockService.MarcarNotificados(enEspera.Select(e => e.Id).ToList());
            await _bot.SendMessage(chatId, $"📣 Se notificó a {enEspera.Count} cliente(s) en lista de espera.");
        }
    }

    private Task HandleError(ITelegramBotClient bot, Exception ex, HandleErrorSource source, CancellationToken ct)
    {
        _logger.LogError(ex, "Error en Telegram polling ({Source})", source);
        return Task.CompletedTask;
    }
}
