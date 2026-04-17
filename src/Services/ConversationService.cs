using Microsoft.EntityFrameworkCore;
using FarmaciaAgent.Data;
using FarmaciaAgent.Models;

namespace FarmaciaAgent.Services;

public class ConversationService
{
    private readonly AppDbContext _db;
    private readonly AIService _aiService;
    private readonly WhatsAppService _whatsAppService;
    private readonly FarmaciaConfig _farmacia;
    private readonly IServiceProvider _serviceProvider;
    private readonly ILogger<ConversationService> _logger;

    private static readonly string[] PalabrasPedido =
    [
        "pedido", "delivery", "enviame", "enviá", "envíame", "enviar",
        "quiero que me envíen", "quiero que me envien", "reservar", "reserva",
        "mandar", "mandame", "mandá", "llevar", "necesito que me traigan"
    ];

    public ConversationService(
        AppDbContext db,
        AIService aiService,
        WhatsAppService whatsAppService,
        FarmaciaConfig farmacia,
        IServiceProvider serviceProvider,
        ILogger<ConversationService> logger)
    {
        _db = db;
        _aiService = aiService;
        _whatsAppService = whatsAppService;
        _farmacia = farmacia;
        _serviceProvider = serviceProvider;
        _logger = logger;
    }

    public async Task HandleIncomingMessage(string telefono, string texto)
    {
        _logger.LogInformation("[1/5] Mensaje recibido de {Telefono}: {Texto}", telefono, texto);

        var cliente = await ObtenerOCrearCliente(telefono);
        cliente.UltimaInteraccion = DateTime.UtcNow;
        _logger.LogInformation("[2/5] Cliente {ClienteId} ({Telefono})", cliente.Id, telefono);

        var conversacion = await ObtenerConversacionActiva(cliente.Id);
        _logger.LogInformation("[3/5] Conversación {ConversacionId} — estado: {Estado}", conversacion.Id, conversacion.Estado);

        if (conversacion.Estado == "farmaceutico")
        {
            _logger.LogInformation("Conversación en modo farmacéutico — mensaje ignorado");
            await _db.SaveChangesAsync();
            return;
        }

        _db.Mensajes.Add(new Mensaje
        {
            ConversacionId = conversacion.Id,
            Role = "user",
            Contenido = texto,
            CreatedAt = DateTime.UtcNow
        });
        conversacion.UpdatedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync();

        _logger.LogInformation("[4/5] Llamando a OpenAI...");
        var historial = await ObtenerHistorial(conversacion.Id);
        var respuesta = await _aiService.GenerarRespuesta(historial, texto);
        _logger.LogInformation("[4/5] Respuesta OpenAI: {Respuesta}", respuesta);

        _db.Mensajes.Add(new Mensaje
        {
            ConversacionId = conversacion.Id,
            Role = "assistant",
            Contenido = respuesta,
            CreatedAt = DateTime.UtcNow
        });
        await _db.SaveChangesAsync();

        _logger.LogInformation("[5/5] Enviando respuesta por WhatsApp a {Telefono}...", telefono);
        var enviado = await _whatsAppService.SendMessage(telefono, respuesta);
        _logger.LogInformation("[5/5] WhatsApp enviado={Enviado} simulacion={Simulacion}", enviado, _whatsAppService.SimulationMode);

        if (EsPedido(texto, respuesta))
        {
            _logger.LogInformation("Pedido detectado de {Telefono} — notificando al farmacéutico", telefono);
            await NotificarFarmaceutico(telefono, texto);
        }
    }

    private static bool EsPedido(string textoCliente, string respuestaAI)
    {
        var combinado = (textoCliente + " " + respuestaAI).ToLowerInvariant();
        return PalabrasPedido.Any(p => combinado.Contains(p));
    }

    private async Task NotificarFarmaceutico(string telefono, string textoPedido)
    {
        try
        {
            var telegramService = _serviceProvider.GetRequiredService<TelegramService>();
            var mensaje =
                $"⚠️ Pedido nuevo\n\n" +
                $"👤 Cliente: {telefono}\n" +
                $"🛒 Productos: {textoPedido}\n" +
                $"📍 Delivery: {(_farmacia.Delivery ? "Sí" : "No")}\n\n" +
                $"¿Qué hacés?\n" +
                $"/tomar {telefono} — para hablar con el cliente\n" +
                $"/fin — cuando esté resuelto";

            await telegramService.EnviarMensajeAdmin(mensaje);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error notificando pedido al farmacéutico");
        }
    }

    public async Task<Conversacion> ObtenerConversacionActiva(int clienteId)
    {
        var conversacion = await _db.Conversaciones
            .Where(c => c.ClienteId == clienteId)
            .OrderByDescending(c => c.UpdatedAt)
            .FirstOrDefaultAsync();

        // Si no existe o la última sesión expiró, crear una nueva
        var timeout = TimeSpan.FromMinutes(_farmacia.TiempoSesionMinutos);
        if (conversacion is null || DateTime.UtcNow - conversacion.UpdatedAt > timeout)
        {
            conversacion = new Conversacion
            {
                ClienteId = clienteId,
                Estado = "bot",
                UpdatedAt = DateTime.UtcNow
            };
            _db.Conversaciones.Add(conversacion);
            await _db.SaveChangesAsync();
        }

        return conversacion;
    }

    public async Task CambiarEstado(int conversacionId, string nuevoEstado)
    {
        var conversacion = await _db.Conversaciones.FindAsync(conversacionId);
        if (conversacion is not null)
        {
            conversacion.Estado = nuevoEstado;
            conversacion.UpdatedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();
        }
    }

    public async Task<List<Conversacion>> GetConversacionesEnEspera()
    {
        return await _db.Conversaciones
            .Include(c => c.Cliente)
            .Where(c => c.Estado == "espera")
            .OrderBy(c => c.UpdatedAt)
            .ToListAsync();
    }

    public async Task<List<Conversacion>> GetConversacionesConFarmaceutico()
    {
        return await _db.Conversaciones
            .Include(c => c.Cliente)
            .Where(c => c.Estado == "farmaceutico")
            .ToListAsync();
    }

    private async Task<Cliente> ObtenerOCrearCliente(string telefono)
    {
        var cliente = await _db.Clientes.FirstOrDefaultAsync(c => c.Telefono == telefono);
        if (cliente is null)
        {
            cliente = new Cliente { Telefono = telefono, Nombre = telefono, UltimaInteraccion = DateTime.UtcNow };
            _db.Clientes.Add(cliente);
            await _db.SaveChangesAsync();
        }
        return cliente;
    }

    private async Task<List<Mensaje>> ObtenerHistorial(int conversacionId)
    {
        return await _db.Mensajes
            .Where(m => m.ConversacionId == conversacionId)
            .OrderByDescending(m => m.CreatedAt)
            .Take(20)
            .OrderBy(m => m.CreatedAt)
            .ToListAsync();
    }

    // Llamado por el background service para cerrar sesiones inactivas
    public async Task CerrarSesionesInactivas()
    {
        var timeout = TimeSpan.FromMinutes(_farmacia.TiempoSesionMinutos);
        var limite = DateTime.UtcNow - timeout;

        var inactivas = await _db.Conversaciones
            .Where(c => c.Estado == "bot" && c.UpdatedAt < limite)
            .ToListAsync();

        foreach (var c in inactivas)
            c.Estado = "cerrada";

        if (inactivas.Count > 0)
        {
            await _db.SaveChangesAsync();
            _logger.LogInformation("{Count} sesiones cerradas por inactividad", inactivas.Count);
        }
    }
}
