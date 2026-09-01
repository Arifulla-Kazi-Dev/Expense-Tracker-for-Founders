import { Injectable, inject } from '@angular/core';

import { RecurringCostCharge } from '../models/recurring-cost-charge.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class RecurringCostChargeService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'recurringCostCharges';

  list() {
    return this.crud.list<RecurringCostCharge>(this.collectionName);
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
