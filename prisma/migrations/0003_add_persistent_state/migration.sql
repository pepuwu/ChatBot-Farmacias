-- Estado del farmacéutico que tomó control de una conversación
CREATE TABLE "ControlActivo" (
  "id"              TEXT NOT NULL,
  "telefonoAdmin"   TEXT NOT NULL,
  "farmaciaId"      TEXT NOT NULL,
  "telefonoCliente" TEXT NOT NULL,
  "conversacionId"  TEXT NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlActivo_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ControlActivo_telefonoAdmin_key" ON "ControlActivo"("telefonoAdmin");

-- Oferta generada por IA esperando confirmación del farmacéutico
CREATE TABLE "OfertaPendiente" (
  "id"                  TEXT NOT NULL,
  "telefonoAdmin"       TEXT NOT NULL,
  "farmaciaId"          TEXT NOT NULL,
  "descripcionOriginal" TEXT NOT NULL,
  "mensajeActual"       TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OfertaPendiente_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OfertaPendiente_telefonoAdmin_key" ON "OfertaPendiente"("telefonoAdmin");

-- Caché de JID @lid de WhatsApp por número de teléfono
CREATE TABLE "JidCache" (
  "telefono"  TEXT NOT NULL,
  "jid"       TEXT NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "JidCache_pkey" PRIMARY KEY ("telefono")
);
