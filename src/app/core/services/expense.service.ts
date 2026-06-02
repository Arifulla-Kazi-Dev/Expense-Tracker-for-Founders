import { Injectable, inject } from '@angular/core';

import { Expense, ExpenseInput } from '../models/expense.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class ExpenseService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'expenses';

  list() {
    return this.crud.list<Expense>(this.collectionName);
  }

  create(data: ExpenseInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: ExpenseInput) {
    return this.crud.update<ExpenseInput>(this.collectionName, id, data);
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
