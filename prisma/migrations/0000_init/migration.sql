-- CreateTable
CREATE TABLE "Farmacia" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "direccion" TEXT NOT NULL DEFAULT '',
    "horarios" JSONB NOT NULL DEFAULT '{}',
    "delivery" BOOLEAN NOT NULL DEFAULT true,
    "zonaDelivery" TEXT NOT NULL DEFAULT '',
    "obrasSociales" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "servicios" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "promptSistema" TEXT,
    "mensajeBienvenida" TEXT NOT NULL DEFAULT '',
    "mensajeDerivacion" TEXT NOT NULL DEFAULT 'Para eso te comunico con nuestro farmacéutico.',
    "tiempoSesionMinutos" INTEGER NOT NULL DEFAULT 10,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Farmacia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "whatsappNumber" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "farmaciaId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cliente" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "telefono" TEXT NOT NULL,
    "nombre" TEXT NOT NULL DEFAULT '',
    "ultimaInteraccion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Cliente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Conversacion" (
    "id" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "estado" TEXT NOT NULL DEFAULT 'bot',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mensaje" (
    "id" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ListaEspera" (
    "id" TEXT NOT NULL,
    "farmaciaId" TEXT NOT NULL,
    "clienteId" TEXT NOT NULL,
    "producto" TEXT NOT NULL,
    "notificado" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ListaEspera_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Farmacia_whatsappNumber_key" ON "Farmacia"("whatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Admin_whatsappNumber_key" ON "Admin"("whatsappNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Cliente_farmaciaId_telefono_key" ON "Cliente"("farmaciaId", "telefono");

-- CreateIndex
CREATE INDEX "Conversacion_clienteId_updatedAt_idx" ON "Conversacion"("clienteId", "updatedAt");

-- CreateIndex
CREATE INDEX "Conversacion_estado_idx" ON "Conversacion"("estado");

-- CreateIndex
CREATE INDEX "Mensaje_conversacionId_createdAt_idx" ON "Mensaje"("conversacionId", "createdAt");

-- CreateIndex
CREATE INDEX "ListaEspera_farmaciaId_notificado_idx" ON "ListaEspera"("farmaciaId", "notificado");

-- AddForeignKey
ALTER TABLE "Admin" ADD CONSTRAINT "Admin_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "Farmacia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cliente" ADD CONSTRAINT "Cliente_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "Farmacia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversacion" ADD CONSTRAINT "Conversacion_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversacion" ADD CONSTRAINT "Conversacion_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "Farmacia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mensaje" ADD CONSTRAINT "Mensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "Conversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_farmaciaId_fkey" FOREIGN KEY ("farmaciaId") REFERENCES "Farmacia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ListaEspera" ADD CONSTRAINT "ListaEspera_clienteId_fkey" FOREIGN KEY ("clienteId") REFERENCES "Cliente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

