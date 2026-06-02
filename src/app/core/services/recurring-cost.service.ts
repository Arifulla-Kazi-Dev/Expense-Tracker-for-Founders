import { Injectable, inject } from '@angular/core';

import { RecurringCost, RecurringCostInput } from '../models/recurring-cost.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class RecurringCostService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'recurringCosts';

  list() {
    return this.crud.list<RecurringCost>(this.collectionName);
  }

  create(data: RecurringCostInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: RecurringCostInput) {
    return this.crud.update<RecurringCostInput>(this.collectionName, id, data);
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
