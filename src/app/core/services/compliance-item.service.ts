import { Injectable, inject } from '@angular/core';

import { ComplianceItem, ComplianceItemInput } from '../models/compliance-item.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class ComplianceItemService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'complianceItems';

  list() {
    return this.crud.list<ComplianceItem>(this.collectionName);
  }

  create(data: ComplianceItemInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: ComplianceItemInput) {
    return this.crud.update<ComplianceItemInput>(this.collectionName, id, data);
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
