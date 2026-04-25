# Stack técnico — Farmacia Agent

## Backend
- ASP.NET Core 8 (C#)
- Entity Framework Core con SQLite
- Un archivo .db por farmacia

## Bots
- WhatsApp: Meta Cloud API (webhooks)
- Telegram: Telegram Bot API (polling o webhooks)

## IA
- OpenAI API (gpt-4.1-nano)
- Un system prompt por farmacia cargado desde farmacia.json
- El contexto de la conversación se mantiene en SQLite

## Deploy
- Railway
- Un servicio por farmacia
- Variables de entorno en Railway dashboard

## Dependencias NuGet principales
- Microsoft.EntityFrameworkCore.Sqlite
- Microsoft.EntityFrameworkCore.Design
- Telegram.Bot
- OpenAI (official SDK)
- Newtonsoft.Json

## Estructura de la base de datos

### Tabla Productos
- Id
- Nombre
- Descripcion
- Stock (int)
- Precio (decimal)
- UpdatedAt

### Tabla Clientes
- Id
- Telefono
- Nombre
- UltimaInteraccion

### Tabla Conversaciones
- Id
- ClienteId
- Estado (bot / farmaceutico / espera)
- UpdatedAt

### Tabla Mensajes
- Id
- ConversacionId
- Role (user / assistant / farmaceutico)
- Contenido
- CreatedAt

### Tabla ListaEspera
- Id
- ClienteId
- ProductoNombre
- CreatedAt
- Notificado (bool)

## Flujo de datos

### Cliente manda mensaje por WhatsApp
1. Meta manda webhook a /api/whatsapp
2. WhatsAppController recibe el mensaje
3. ConversationService verifica estado de la conversación
4. Si estado = farmaceutico → ignorar, el farmacéutico responde manual
5. Si estado = bot → AIService genera respuesta con contexto
6. StockService consulta SQLite si pregunta por medicamento
7. WhatsAppService manda la respuesta

### Farmacéutico manda mensaje por Telegram
1. TelegramController recibe el mensaje
2. Si es comando de stock → StockService actualiza SQLite
3. Si es /tomar → ConversationService cambia estado a farmaceutico
4. Si es /fin → ConversationService cambia estado a bot
5. Si hay clientes en lista de espera del producto cargado → WhatsAppService les avisa

## Variables de entorno requeridas
- WHATSAPP_TOKEN
- WHATSAPP_PHONE_ID
- WHATSAPP_VERIFY_TOKEN
- TELEGRAM_BOT_TOKEN
- TELEGRAM_ADMIN_ID
- OPENAI_API_KEY
- DB_PATH
- FARMACIA_CONFIG_PATH
