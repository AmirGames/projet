import { db } from "./db";
import { ApiError } from "../middleware/errorHandler";

export interface CampaignData {
  name: string;
  description?: string;
  type: string;
  message: string;
  targetAudience?: string;
  scheduledAt?: Date;
}

export class MarketingService {
  static async getCampaigns(storeId: string, options?: { skip?: number; take?: number; status?: string }) {
    try {
      const skip = options?.skip || 0;
      const take = options?.take || 50;

      const whereClause: any = { storeId };
      if (options?.status) {
        whereClause.status = options.status;
      }

      const [campaigns, total] = await Promise.all([
        db.marketingCampaign.findMany({
          where: whereClause,
          skip,
          take,
          orderBy: { createdAt: "desc" },
        }),
        db.marketingCampaign.count({ where: whereClause }),
      ]);

      return {
        data: campaigns,
        total,
        skip,
        take,
      };
    } catch (error) {
      throw error;
    }
  }

  static async getCampaign(storeId: string, campaignId: string) {
    try {
      const campaign = await db.marketingCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.storeId !== storeId) {
        throw new ApiError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      return campaign;
    } catch (error) {
      throw error;
    }
  }

  static async createCampaign(storeId: string, data: CampaignData) {
    try {
      const campaign = await db.marketingCampaign.create({
        data: {
          storeId,
          name: data.name,
          description: data.description,
          type: data.type,
          message: data.message,
          targetAudience: data.targetAudience || "all",
          status: "DRAFT",
          scheduledAt: data.scheduledAt,
        },
      });

      return campaign;
    } catch (error) {
      throw error;
    }
  }

  static async updateCampaign(storeId: string, campaignId: string, data: Partial<CampaignData>) {
    try {
      const campaign = await db.marketingCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.storeId !== storeId) {
        throw new ApiError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      const updateData: any = {};
      if (data.name !== undefined) updateData.name = data.name;
      if (data.description !== undefined) updateData.description = data.description;
      if (data.message !== undefined) updateData.message = data.message;
      if (data.targetAudience !== undefined) updateData.targetAudience = data.targetAudience;
      if (data.scheduledAt !== undefined) updateData.scheduledAt = data.scheduledAt;

      const updated = await db.marketingCampaign.update({
        where: { id: campaignId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async updateCampaignStatus(storeId: string, campaignId: string, status: string) {
    try {
      const campaign = await db.marketingCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.storeId !== storeId) {
        throw new ApiError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      const updateData: any = { status };
      if (status === "ACTIVE") {
        updateData.startedAt = new Date();
      } else if (status === "COMPLETED") {
        updateData.completedAt = new Date();
      }

      const updated = await db.marketingCampaign.update({
        where: { id: campaignId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }

  static async deleteCampaign(storeId: string, campaignId: string) {
    try {
      const campaign = await db.marketingCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.storeId !== storeId) {
        throw new ApiError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      await db.marketingCampaign.delete({
        where: { id: campaignId },
      });

      return { success: true };
    } catch (error) {
      throw error;
    }
  }

  static async updateCampaignStats(storeId: string, campaignId: string, field: string, increment: number = 1) {
    try {
      const campaign = await db.marketingCampaign.findUnique({
        where: { id: campaignId },
      });

      if (!campaign || campaign.storeId !== storeId) {
        throw new ApiError(404, "Campaign not found", "CAMPAIGN_NOT_FOUND");
      }

      const updateData: any = {};
      if (field === "sent") updateData.sentCount = { increment };
      if (field === "open") updateData.openCount = { increment };
      if (field === "click") updateData.clickCount = { increment };
      if (field === "conversion") updateData.conversionCount = { increment };

      const updated = await db.marketingCampaign.update({
        where: { id: campaignId },
        data: updateData,
      });

      return updated;
    } catch (error) {
      throw error;
    }
  }
}
