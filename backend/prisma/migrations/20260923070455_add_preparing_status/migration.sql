-- Add PREPARING status to OrderStatus enum
ALTER TYPE "OrderStatus" ADD VALUE 'PREPARING' AFTER 'ACCEPTED';
