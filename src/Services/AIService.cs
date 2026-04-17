using OpenAI;
using OpenAI.Chat;
using FarmaciaAgent.Models;

namespace FarmaciaAgent.Services;

public class AIService
{
    private readonly ChatClient _client;
    private readonly FarmaciaConfig _farmacia;
    private readonly ILogger<AIService> _logger;

    public AIService(IConfiguration config, FarmaciaConfig farmacia, ILogger<AIService> logger)
    {
        _logger = logger;
        _farmacia = farmacia;
        var apiKey = config["OPENAI_API_KEY"] ?? throw new InvalidOperationException("OPENAI_API_KEY no configurado");
        _logger.LogInformation("AIService inicializado. Modelo: gpt-4.1-nano. API key prefix: {Prefix}",
            apiKey.Length > 10 ? apiKey[..10] + "..." : "(vacía)");
        _client = new OpenAIClient(apiKey).GetChatClient("gpt-4.1-nano");
    }

    public async Task<string> GenerarRespuesta(List<Mensaje> historial, string mensajeActual)
    {
        _logger.LogInformation("OpenAI: construyendo prompt con {Count} mensajes de historial", historial.Count);

        var systemPrompt = BuildSystemPrompt();
        var messages = new List<ChatMessage> { ChatMessage.CreateSystemMessage(systemPrompt) };

        foreach (var msg in historial)
        {
            if (msg.Role == "user")
                messages.Add(ChatMessage.CreateUserMessage(msg.Contenido));
            else if (msg.Role == "assistant")
                messages.Add(ChatMessage.CreateAssistantMessage(msg.Contenido));
        }

        messages.Add(ChatMessage.CreateUserMessage(mensajeActual));

        _logger.LogInformation("OpenAI: enviando {Count} mensajes a la API...", messages.Count);

        try
        {
            using var cts = new CancellationTokenSource(TimeSpan.FromSeconds(15));
            var response = await _client.CompleteChatAsync(messages, cancellationToken: cts.Token);
            var texto = response.Value.Content[0].Text;
            _logger.LogInformation("OpenAI: respuesta recibida ({Chars} chars): {Texto}", texto.Length, texto);
            return texto;
        }
        catch (OperationCanceledException)
        {
            _logger.LogError("OpenAI: timeout después de 15 segundos");
            return "Lo siento, tardé demasiado en responder. Por favor intentá de nuevo.";
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "OpenAI: error {Type} — {Message}", ex.GetType().Name, ex.Message);
            return "Lo siento, tuve un problema al procesar tu mensaje. Por favor intentá de nuevo.";
        }
    }

    private string BuildSystemPrompt()
    {
        var obrasSociales = string.Join(", ", _farmacia.ObrasSociales);
        var servicios = string.Join(", ", _farmacia.Servicios);

        return $"""
Sos el asistente virtual de {_farmacia.Nombre}, una farmacia ubicada en {_farmacia.Direccion}.

HORARIOS:
- Lunes a Viernes: {_farmacia.Horarios.Semana}
- Sábado: {_farmacia.Horarios.Sabado}
- Domingo: {_farmacia.Horarios.Domingo}

DELIVERY: {(_farmacia.Delivery ? $"Sí, zona: {_farmacia.ZonaDelivery}" : "No disponible")}

OBRAS SOCIALES ACEPTADAS: {obrasSociales}

SERVICIOS: {servicios}

REGLAS CRÍTICAS:
1. Respondé siempre en el idioma que usa el cliente.
2. NUNCA diagnosticás enfermedades ni recomendás tratamientos complejos. Si te preguntan algo médico complejo, respondé: "{_farmacia.MensajeDerivacion}"
3. Sé amable, breve y directo. Usá lenguaje coloquial argentino.
4. No hagas listas largas — respondé lo que el cliente necesita.

MENSAJE DE BIENVENIDA (solo para primer mensaje): {_farmacia.MensajeBienvenida}
""";
    }
}
