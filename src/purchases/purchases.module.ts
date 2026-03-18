import { Module } from '@nestjs/common';
import { PurchaseItemsController } from './purchase-items.controller';
import { PurchaseItemsService } from './purchase-items.service';
import { PurchasesController } from './purchases.controller';
import { PurchasesService } from './purchases.service';

@Module({
    controllers: [PurchasesController, PurchaseItemsController],
    providers: [PurchasesService, PurchaseItemsService],
})
export class PurchasesModule { }
