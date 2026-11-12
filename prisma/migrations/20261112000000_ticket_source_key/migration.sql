-- Keep imported ticket identity separate from user-visible descriptions.
ALTER TABLE "Ticket" ADD COLUMN "sourceKey" TEXT;

CREATE UNIQUE INDEX "Ticket_sourceKey_key" ON "Ticket"("sourceKey");
