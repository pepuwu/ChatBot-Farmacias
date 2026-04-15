using OpenAI;
using OpenAI.Chat;
using FarmaciaAgent.Models;

namespace FarmaciaAgent.Services;

public class AIService
{
    private readonly ChatClient _client;
    private readonly FarmaciaConfig _farmacia;
    private readonly StockService _stockService;
    private readonly ILogger<AIService> _logger;

    public AIService(IConfiguration config, FarmaciaConfig farmacia, StockService stockService, ILogger<AIService> logger)
    {
        var apiKey = config["OPENAI_API_KEY"] ?? throw new InvalidOperationException("OPENAI_API_KEY no configurado");
        _client = new OpenAIClient(apiKey).GetChatClient("gpt-4.1-nano");
        _farmacia = farmacia;
        _stockService = stockService;
        _logger = logger;
    }

    public async Task<string> GenerarRespuesta(List<Mensaje> historial, string mensajeActual)
    {
        try
        {
            var systemPrompt = await BuildSystemPrompt();
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

    private async Task<string> BuildSystemPrompt()
    {
        var stockItems = await _stockService.GetTodoElStock();
        var stockTexto = stockItems.Count > 0
            ? string.Join("\n", stockItems.Select(p => $"- {p.Nombre}: {p.Stock} unidades" + (p.Precio > 0 ? $" (${p.Precio})" : "")))
            : "Sin productos cargados aún.";

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

STOCK ACTUAL:
{stockTexto}

REGLAS CRÍTICAS:
1. Respondé siempre en el idioma que usa el cliente.
2. NUNCA diagnosticás enfermedades ni recomendás tratamientos complejos. Si te preguntan algo médico complejo, respondé: "{_farmacia.MensajeDerivacion}"
3. Si un medicamento no tiene stock, preguntá al cliente si quiere que te avises cuando llegue.
4. Si el cliente pregunta por precio, informalo si está disponible. Si no tenés el dato, decile que consulte en la farmacia.
5. Sé amable, breve y directo. Usá lenguaje coloquial argentino.
6. No hagas listas largas — respondé lo que el cliente necesita.

MENSAJE DE BIENVENIDA (solo para primer mensaje): {_farmacia.MensajeBienvenida}
""";
    }
}
