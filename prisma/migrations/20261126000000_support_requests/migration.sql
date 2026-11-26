-- Support center escalations: a complaint, a question or a quality claim about a ticket.
-- Additive only: existing tables and rows are not changed.
-- CreateEnum
CREATE TYPE "SupportRequestType" AS ENUM ('COMPLAINT', 'QUESTION', 'QUALITY');

-- CreateEnum
CREATE TYPE "SupportRequestStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED');

-- CreateTable
CREATE TABLE "SupportRequest" (
    "id" SERIAL NOT NULL,
    "ticketId" INTEGER NOT NULL,
    "authorId" TEXT NOT NULL,
    "type" "SupportRequestType" NOT NULL,
    "status" "SupportRequestStatus" NOT NULL DEFAULT 'OPEN',
    "message" TEXT NOT NULL,
    "response" TEXT,
    "handledById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "SupportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SupportRequest_status_createdAt_idx" ON "SupportRequest"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportRequest_ticketId_createdAt_idx" ON "SupportRequest"("ticketId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportRequest_authorId_createdAt_idx" ON "SupportRequest"("authorId", "createdAt");

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportRequest" ADD CONSTRAINT "SupportRequest_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

