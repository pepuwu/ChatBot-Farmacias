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
        var apiKey = config["OPENAI_API_KEY"] ?? throw new InvalidOperationException("OPENAI_API_KEY no configurado");
        _client = new OpenAIClient(apiKey).GetChatClient("gpt-4.1-nano");
        _farmacia = farmacia;
        _logger = logger;
    }

    public async Task<string> GenerarRespuesta(List<Mensaje> historial, string mensajeActual)
    {
        try
        {
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

            var response = await _client.CompleteChatAsync(messages);
            return response.Value.Content[0].Text;
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Error generando respuesta con OpenAI");
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
