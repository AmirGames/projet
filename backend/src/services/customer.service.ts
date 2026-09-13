import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface CustomerData {
  name: string;
  email: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  status?: string;
}

export interface CreateCustomerData extends CustomerData {}

export interface UpdateCustomerData {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  postalCode?: string;
  notes?: string;
  status?: string;
}

export class CustomerService {
  static async getCustomers(storeId: string, options?: { skip?: number; take?: number; search?: string }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;
      const search = options?.search || "";

      const whereClause: any = { storeId };
      if (search) {
        whereClause.OR = [
          { name: { contains: search, mode: "insensitive" } },
          { email: { contains: search, mode: "insensitive" } },
          { phone: { contains: search, mode: "insensitive" } },
        ];
      }

      const [customers, total] = await Promise.all([
        db.customer.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        db.customer.count({ where: whereClause }),
      ]);

      return {
        data: customers,
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getCustomer(storeId: string, customerId: string) {
    try {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
        include: {
          orders: {
            select: {
              id: true,
              totalAmount: true,
              status: true,
              createdAt: true,
            },
            orderBy: { createdAt: "desc" },
            take: 10,
          },
        },
      });

      if (!customer || customer.storeId !== storeId) {
        throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
      }

      return customer;
    } catch (error) {
      throw error;
    }
  }

  static async createCustomer(storeId: string, data: CreateCustomerData) {
    try {
      const existingCustomer = await db.customer.findUnique({
        where: {
          storeId_email: {
            storeId,
            email: data.email,
          },
        },
      });

      if (existingCustomer) {
        throw new ApiError(409, "Customer with this email already exists", "CUSTOMER_EXISTS");
      }

      const customer = await db.customer.create({
        data: {
          storeId,
          name: data.name,
          email: data.email,
          phone: data.phone,
          address: data.address,
          city: data.city,
          postalCode: data.postalCode,
          notes: data.notes,
          status: data.status || "ACTIVE",
        },
      });

      return customer;
    } catch (error) {
      throw error;
    }
  }

  static async updateCustomer(storeId: string, customerId: string, data: UpdateCustomerData) {
    try {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer || customer.storeId !== storeId) {
        throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.phone !== undefined) updateData.phone = data.phone;
      if (data.address !== undefined) updateData.address = data.address;
      if (data.city !== undefined) updateData.city = data.city;
      if (data.postalCode !== undefined) updateData.postalCode = data.postalCode;
      if (data.notes !== undefined) updateData.notes = data.notes;
      if (data.status !== undefined) updateData.status = data.status;

      const updated = await db.customer.update({
        where: { id: customerId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async deleteCustomer(storeId: string, customerId: string) {
    try {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer || customer.storeId !== storeId) {
        throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
      }

      await db.customer.delete({
        where: { id: customerId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  static async blockCustomer(storeId: string, customerId: string) {
    try {
      const customer = await db.customer.findUnique({
        where: { id: customerId },
      });

      if (!customer || customer.storeId !== storeId) {
        throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
      }

      const updated = await db.customer.update({
        where: { id: customerId },
        data: { status: "BLOCKED" },
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }
}
