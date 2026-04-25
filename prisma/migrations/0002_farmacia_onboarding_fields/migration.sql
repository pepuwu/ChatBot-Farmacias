-- AlterTable: add telefonoFijo and productosExcluidos to Farmacia
ALTER TABLE "Farmacia" ADD COLUMN "telefonoFijo" TEXT;
ALTER TABLE "Farmacia" ADD COLUMN "productosExcluidos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
