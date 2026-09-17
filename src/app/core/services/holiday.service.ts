import { Injectable, inject } from '@angular/core';

import { Holiday, HolidayInput } from '../models/attendance.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class HolidayService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'holidays';

  list() {
    return this.crud.list<Holiday>(this.collectionName);
  }

  create(data: HolidayInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: HolidayInput) {
    return this.crud.update<HolidayInput>(this.collectionName, id, data);
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
