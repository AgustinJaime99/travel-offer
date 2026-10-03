-- CreateEnum
CREATE TYPE "Province" AS ENUM ('BUENOS_AIRES', 'CABA', 'CATAMARCA', 'CHACO', 'CHUBUT', 'CORDOBA', 'CORRIENTES', 'ENTRE_RIOS', 'FORMOSA', 'JUJUY', 'LA_PAMPA', 'LA_RIOJA', 'MENDOZA', 'MISIONES', 'NEUQUEN', 'RIO_NEGRO', 'SALTA', 'SAN_JUAN', 'SAN_LUIS', 'SANTA_CRUZ', 'SANTA_FE', 'SANTIAGO_DEL_ESTERO', 'TIERRA_DEL_FUEGO', 'TUCUMAN');

-- CreateTable
CREATE TABLE "School" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "province" "Province" NOT NULL,
    "city" TEXT NOT NULL,
    "normalizedCity" TEXT NOT NULL,
    "address" TEXT,
    "cue" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "School_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "School_cue_key" ON "School"("cue");

-- CreateIndex
CREATE INDEX "School_province_normalizedCity_idx" ON "School"("province", "normalizedCity");

-- Hand-written (ADR-06, ADR-10): trigram indexes for accent-insensitive, typo-tolerant search.
CREATE INDEX "School_normalizedName_trgm_idx" ON "School" USING GIN ("normalizedName" gin_trgm_ops);
CREATE INDEX "School_normalizedCity_trgm_idx" ON "School" USING GIN ("normalizedCity" gin_trgm_ops);

-- Hand-written (ADR-06): the application normalizes; the database refuses malformed values.
ALTER TABLE "School"
  ADD CONSTRAINT "School_cue_format_check" CHECK ("cue" ~ '^([0-9]{7}|[0-9]{9})$'),
  ADD CONSTRAINT "School_normalized_format_check" CHECK (
    "normalizedName" ~ '^[a-z0-9]+( [a-z0-9]+)*$' AND "normalizedCity" ~ '^[a-z0-9]+( [a-z0-9]+)*$'
  );
