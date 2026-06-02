import { Injectable, inject } from '@angular/core';

import { FounderNote, FounderNoteInput } from '../models/founder-note.model';
import { FirestoreCrudService } from './firestore-crud.service';

@Injectable({ providedIn: 'root' })
export class FounderNoteService {
  private readonly crud = inject(FirestoreCrudService);
  private readonly collectionName = 'founderNotes';

  list() {
    return this.crud.list<FounderNote>(this.collectionName);
  }

  create(data: FounderNoteInput) {
    return this.crud.create(this.collectionName, data);
  }

  update(id: string, data: FounderNoteInput) {
    return this.crud.update<FounderNoteInput>(this.collectionName, id, data);
  }

  delete(id: string) {
    return this.crud.delete(this.collectionName, id);
  }
}
