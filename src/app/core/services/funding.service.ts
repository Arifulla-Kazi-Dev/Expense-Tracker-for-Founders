import { Injectable, inject } from '@angular/core';

import { Funding, FundingInput } from '../models/funding.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class FundingService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'funding';

  list() {
    return this.crud.list<Funding>(this.collectionName);
  }

  create(data: FundingInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: FundingInput) {
    return this.crud.update<FundingInput>(this.collectionName, id, data);
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
