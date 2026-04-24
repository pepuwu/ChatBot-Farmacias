---
name: farmacia-agent
description: Genera un proyecto ASP.NET Core completo con bot de WhatsApp para clientes y bot de Telegram para el farmacéutico admin. Se activa cuando el usuario pide crear un agente para una farmacia, onboardear una farmacia nueva, o construir el bot de farmacia.
---

# Farmacia Agent

## Goal
Generar un proyecto ASP.NET Core (C#) completo y listo para deployar en Railway, con dos bots funcionales basados en el archivo de configuración de la farmacia.

## Inputs requeridos
Antes de arrancar, verificá que existe un archivo farmacia.json en el directorio actual. Si no existe, pedíselo al usuario con este mensaje:
"Necesito el archivo farmacia.json con los datos de la farmacia. ¿Podés crearlo o pasarme los datos?"

## Proceso paso a paso

### Paso 1 — Leer configuración
- Leer el archivo farmacia.json
- Verificar que tiene todos los campos requeridos: nombre, whatsapp, horarios, delivery, obras_sociales, telegram_admin_id
- Si falta algún campo, preguntarle al usuario antes de continuar

### Paso 2 — Crear estructura del proyecto
Crear un proyecto ASP.NET Core con esta estructura:
FarmaciaAgent/
  src/
    Controllers/
      WhatsAppController.cs
      TelegramController.cs
    Services/
      WhatsAppService.cs
      TelegramService.cs
      StockService.cs
      ConversationService.cs
      AIService.cs
    Models/
      Farmacia.cs
      Mensaje.cs
      Stock.cs
      Cliente.cs
    Data/
      AppDbContext.cs
  config/
    farmacia.json
  Dockerfile
  docker-compose.yml
  README.md

### Paso 3 — Implementar bot de WhatsApp (clientes)
Seguir estrictamente el flujo definido en referencias/flujo-cliente.md.
Reglas críticas:
- Responder siempre en el idioma del cliente
- Nunca diagnosticar ni recomendar tratamientos complejos
- Si la consulta es médica compleja → derivar al farmacéutico
- Si el cliente lleva más de 10 minutos sin responder → cerrar la sesión

### Paso 4 — Implementar bot de Telegram (admin)
El farmacéutico puede:
- Actualizar stock: "Llegaron 50 ibuprofeno 400mg"
- Ver stock actual: /stock
- Tomar control de una conversación: /tomar [número]
- Liberar control: /fin
- Ver clientes esperando: /cola
- Ver alertas de stock bajo: /alertas

### Paso 5 — Base de datos
Usar SQLite con Entity Framework Core.
Un archivo .db por farmacia.
No se necesita servidor de base de datos externo.
Tablas requeridas: Farmacias, Productos, Stock, Clientes, Conversaciones, Mensajes, ListaEspera

### Paso 6 — Variables de entorno
Generar archivo .env.example con todas las variables necesarias:
- WHATSAPP_TOKEN
- WHATSAPP_PHONE_ID
- TELEGRAM_BOT_TOKEN
- TELEGRAM_ADMIN_ID
- DB_PATH (ruta al archivo .db de la farmacia)
- OPENAI_API_KEY
- FARMACIA_CONFIG_PATH

### Paso 7 — Deploy
Generar Dockerfile optimizado para Railway y README con instrucciones claras de deploy.

## Reglas que nunca se rompen
- Nunca hardcodear datos de la farmacia — siempre leer de farmacia.json
- El bot de WhatsApp nunca diagnostica enfermedades
- Solo el telegram_admin_id del json puede usar comandos de admin
- Cuando el farmacéutico toma control (/tomar), el bot se silencia completamente
- Cuando el farmacéutico escribe /fin, el bot retoma el control

## Referencias
- Ver flujo conversacional completo en: referencias/flujo-cliente.md
- Ver stack técnico en: referencias/stack.md
- Ver template de configuración en: referencias/farmacia-template.json
