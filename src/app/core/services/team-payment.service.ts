import { Injectable, inject } from '@angular/core';

import { TeamPayment, TeamPaymentInput } from '../models/team-payment.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class TeamPaymentService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'teamPayments';

  list() {
    return this.crud.list<TeamPayment>(this.collectionName);
  }

  create(data: TeamPaymentInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: TeamPaymentInput) {
    return this.crud.update<TeamPaymentInput>(this.collectionName, id, data);
  }

  markPaid(id: string, amount: number) {
    return this.crud.update<TeamPayment>(this.collectionName, id, {
      paymentStatus: 'Paid',
      paidAmount: amount,
      pendingAmount: 0,
    });
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
