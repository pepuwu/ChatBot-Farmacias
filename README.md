# Farmacia Agent — Farmacia San Martín

Bot de WhatsApp para clientes + bot de Telegram para el farmacéutico admin.

## Stack
- ASP.NET Core 8 (C#)
- SQLite con Entity Framework Core (un archivo `.db` por farmacia)
- WhatsApp: Meta Cloud API
- Telegram: Telegram Bot API (polling)
- IA: OpenAI gpt-4.1-nano

---

## Setup local

### 1. Clonar y configurar variables de entorno

```bash
cp .env.example .env
# Editar .env con tus tokens
```

### 2. Editar `config/farmacia.json`

Completar con los datos reales de la farmacia.

### 3. Correr con Docker

```bash
docker-compose up --build
```

### 4. Correr sin Docker

```bash
dotnet run
```

---

## Deploy en Railway

1. Crear un nuevo proyecto en Railway.
2. Conectar este repositorio.
3. En **Variables**, cargar todas las variables de `.env.example`.
4. Railway detecta el `Dockerfile` automáticamente.
5. Para el webhook de WhatsApp, configurar en Meta la URL:
   `https://tu-app.railway.app/api/whatsapp`

---

## Comandos del bot de Telegram (admin)

| Comando | Acción |
|---|---|
| `/stock` | Ver todo el stock actual |
| `/tomar [número]` | Tomar control de la conversación con ese cliente |
| `/fin` | Liberar control y devolvérselo al bot |
| `/cola` | Ver clientes en espera |
| `/alertas` | Ver productos con stock bajo |
| `"Llegaron 50 ibuprofeno 400mg"` | Actualizar stock en lenguaje natural |

---

## Estructura del proyecto

```
FarmaciaAgent/
  src/
    Controllers/
      WhatsAppController.cs   # Webhook de Meta
      TelegramController.cs   # Endpoint opcional para webhooks
    Services/
      WhatsAppService.cs      # Envío de mensajes vía Meta API
      TelegramService.cs      # Polling + comandos admin
      StockService.cs         # CRUD de stock en SQLite
      ConversationService.cs  # Estado de conversaciones
      AIService.cs            # Integración OpenAI
    Models/
      Farmacia.cs             # Config de la farmacia
      Stock.cs                # Entidad Producto
      Cliente.cs              # Entidad Cliente
      Mensaje.cs              # Entidades Conversacion, Mensaje, ListaEspera
    Data/
      AppDbContext.cs         # EF Core context
  config/
    farmacia.json             # Configuración de la farmacia
  data/
    farmacia-san-martin.db    # Base de datos SQLite (generada automáticamente)
  Program.cs
  FarmaciaAgent.csproj
  Dockerfile
  docker-compose.yml
  .env.example
```
