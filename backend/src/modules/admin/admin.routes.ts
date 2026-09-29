import { Router } from "express";
import configRouter from "./config.routes";
import merchantsRouter from "./merchants.routes";
import ticketsRouter from "./tickets.routes";
import reportsRouter from "./reports.routes";
import notificationsRouter from "./notifications.routes";

// L'espace d'administration : les sous-routeurs partagent le préfixe /api/admin.
const router = Router();

router.use(configRouter);
router.use(merchantsRouter);
router.use(ticketsRouter);
router.use(reportsRouter);
router.use(notificationsRouter);

export default router;
