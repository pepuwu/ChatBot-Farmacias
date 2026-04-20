using Microsoft.EntityFrameworkCore;
using Newtonsoft.Json;
using Newtonsoft.Json.Serialization;
using FarmaciaAgent.Data;
using FarmaciaAgent.Models;
using FarmaciaAgent.Services;

// Cargar .env antes de todo
DotNetEnv.Env.Load();

var builder = WebApplication.CreateBuilder(args);

// Cargar variables de entorno (incluye las del .env)
builder.Configuration.AddEnvironmentVariables();

// Cargar farmacia.json
var farmaciaConfigPath = builder.Configuration["FARMACIA_CONFIG_PATH"]
    ?? Path.Combine(AppContext.BaseDirectory, "config", "farmacia.json");

if (!File.Exists(farmaciaConfigPath))
    throw new FileNotFoundException($"No se encontró el archivo de configuración de la farmacia: {farmaciaConfigPath}");

var farmaciaJson = await File.ReadAllTextAsync(farmaciaConfigPath);
var snakeSettings = new JsonSerializerSettings
{
    ContractResolver = new DefaultContractResolver { NamingStrategy = new SnakeCaseNamingStrategy() }
};
var farmacia = JsonConvert.DeserializeObject<FarmaciaConfig>(farmaciaJson, snakeSettings)
    ?? throw new InvalidOperationException("No se pudo deserializar farmacia.json");

builder.Services.AddSingleton(farmacia);

// PostgreSQL
var connectionString = builder.Configuration["DATABASE_URL"]
    ?? throw new InvalidOperationException("La variable de entorno DATABASE_URL no está configurada.");

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseNpgsql(connectionString));

// HTTP client para WhatsApp
builder.Services.AddHttpClient<WhatsAppService>();

// Services
builder.Services.AddScoped<AIService>();
builder.Services.AddScoped<ConversationService>();

// Telegram como BackgroundService (polling)
builder.Services.AddSingleton<TelegramService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<TelegramService>());

// Background service para cerrar sesiones inactivas
builder.Services.AddHostedService<SessionCleanupService>();

builder.Services.AddControllers();

var app = builder.Build();

// Migrar y crear DB automáticamente al iniciar
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    await db.Database.EnsureCreatedAsync();
}

app.MapControllers();

app.MapGet("/", () => $"Farmacia Agent — {farmacia.Nombre} — OK");
app.MapGet("/health", () => Results.Ok(new { status = "ok", farmacia = farmacia.Nombre }));

await app.RunAsync();

// Background service para cerrar sesiones inactivas cada minuto
public class SessionCleanupService : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<SessionCleanupService> _logger;

    public SessionCleanupService(IServiceScopeFactory scopeFactory, ILogger<SessionCleanupService> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            await Task.Delay(TimeSpan.FromMinutes(1), stoppingToken);

            using var scope = _scopeFactory.CreateScope();
            var conversationService = scope.ServiceProvider.GetRequiredService<ConversationService>();
            await conversationService.CerrarSesionesInactivas();
        }
    }
}
