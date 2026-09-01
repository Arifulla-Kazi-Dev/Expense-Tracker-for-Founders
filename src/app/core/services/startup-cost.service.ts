import { Injectable, inject } from '@angular/core';

import { StartupCost, StartupCostInput } from '../models/startup-cost.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class StartupCostService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'startupCosts';

  list() {
    return this.crud.list<StartupCost>(this.collectionName);
  }

  create(data: StartupCostInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: StartupCostInput) {
    return this.crud.update<StartupCostInput>(this.collectionName, id, data);
  }

  markPaid(id: string, amount: number) {
    return this.crud.update<StartupCost>(this.collectionName, id, {
      paymentStatus: 'Paid',
      paidAmount: amount,
      pendingAmount: 0,
    });
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
